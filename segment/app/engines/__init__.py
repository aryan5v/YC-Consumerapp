"""Segmentation engines. One process holds exactly one engine, loaded once."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..config import Settings


@dataclass
class Instance:
    """One candidate mask for a target, in pixel coordinates."""

    score: float
    mask: np.ndarray


class Segmenter:
    """Interface every engine implements: one image plus one text query."""

    name = "base"
    detail = ""

    def instances(self, image, target: str) -> list[Instance]:  # pragma: no cover - interface
        """Candidate masks for one named target."""
        raise NotImplementedError

    def propose(self, image) -> list[Instance]:  # pragma: no cover - interface
        """Raw unnamed candidates for the top-salient-objects mode."""
        raise NotImplementedError

    def close(self) -> None:
        return None


def build_engine(settings: Settings, *, log=None) -> Segmenter:
    """Pick and load the engine once.

    `auto` prefers SAM 3 (text-promptable concept segmentation) and falls back
    to Grounding DINO + SAM 2.1 when SAM 3 weights are not reachable, which is
    the case until the gated Hugging Face repo is approved for the account.
    """
    say = log or (lambda message: None)
    from . import dino_sam2 as dino_engine
    from . import sam3 as sam3_engine
    from . import stub as stub_engine

    choice = settings.engine
    if choice == "stub":
        say("engine=stub (deterministic masks, no model)")
        return stub_engine.StubEngine(settings)
    if choice == "sam3":
        say(f"engine=sam3 model={settings.sam3_model_id}")
        return sam3_engine.Sam3Engine(settings)
    if choice == "dino_sam2":
        say(f"engine=dino_sam2 detector={settings.dino_model_id} segmenter={settings.sam2_model_id}")
        return dino_engine.DinoSam2Engine(settings)

    try:
        say(f"engine=auto, trying sam3 model={settings.sam3_model_id}")
        return sam3_engine.Sam3Engine(settings)
    except Exception as exc:
        say(
            "sam3 unavailable "
            f"({type(exc).__name__}: {exc}); falling back to Grounding DINO + SAM 2.1. "
            "Request access to the gated facebook/sam3 (or facebook/sam3.1) repo on Hugging Face "
            "and set HF_TOKEN to switch."
        )
        say(f"engine=dino_sam2 detector={settings.dino_model_id} segmenter={settings.sam2_model_id}")
        return dino_engine.DinoSam2Engine(settings)

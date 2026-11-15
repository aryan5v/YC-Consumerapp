"""SAM 3 / SAM 3.1 with text prompts: one model, one text query per target.

Weights are gated on Hugging Face (`facebook/sam3`, `facebook/sam3.1`): the
account must accept Meta's SAM License and be approved, then set HF_TOKEN.
License: SAM License (Nov 19 2025), worldwide, royalty-free, no US exclusion.
"""

from __future__ import annotations

import numpy as np

from ..config import Settings
from . import Instance, Segmenter


class Sam3Engine(Segmenter):
    name = "sam3"

    def __init__(self, settings: Settings):
        import torch
        from transformers import Sam3Model, Sam3Processor

        self.torch = torch
        self.settings = settings
        self.device = settings.resolve_device()
        self.model = (
            Sam3Model.from_pretrained(settings.sam3_model_id, token=_hf_token()).to(self.device).eval()
        )
        self.processor = Sam3Processor.from_pretrained(settings.sam3_model_id, token=_hf_token())
        self.detail = f"{settings.sam3_model_id} on {self.device}"

    def propose(self, image) -> list[Instance]:
        """Unnamed objects come from SAM 2.1's grid pass: SAM 3's strength here is
        text prompting, and SAM 2.1 already answers "what objects are in this
        frame" without a name."""
        return self._masker().propose(image, self.settings.amg_points_per_side)

    def _masker(self):
        from ..salient import GridMasker

        if getattr(self, "_grid_masker", None) is None:
            from transformers import Sam2Model, Sam2Processor

            processor = Sam2Processor.from_pretrained(self.settings.sam2_model_id)
            model = (
                Sam2Model.from_pretrained(self.settings.sam2_model_id).to(self.device).eval()
            )
            self._grid_masker = GridMasker(model, processor, self.torch, self.device, self.settings)
        return self._grid_masker

    def instances(self, image, target: str) -> list[Instance]:
        torch = self.torch
        inputs = self.processor(images=image, text=target, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            outputs = self.model(**inputs)
        results = self.processor.post_process_instance_segmentation(
            outputs,
            threshold=self.settings.box_threshold,
            mask_threshold=self.settings.mask_threshold,
            target_sizes=inputs["original_sizes"].tolist(),
        )
        result = results[0] if isinstance(results, (list, tuple)) else results
        masks = result.get("masks")
        scores = result.get("scores")
        if masks is None:
            return []
        masks = _to_numpy(masks)
        scores = _to_numpy(scores) if scores is not None else np.ones(len(masks))
        out: list[Instance] = []
        for mask, score in zip(masks, scores):
            array = np.asarray(mask)
            out.append(Instance(score=float(score), mask=array.astype(bool)))
        return out


def _to_numpy(value):
    if hasattr(value, "detach"):
        value = value.detach().cpu().numpy()
    return np.asarray(value)


def _hf_token() -> str | None:
    import os

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    return token.strip() if token and token.strip() else None

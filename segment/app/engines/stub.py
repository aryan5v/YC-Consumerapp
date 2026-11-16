"""Deterministic engine used by the tests: real masks read from PNG files.

It exercises the whole service - auth, decoding, mask cleaning, centroid,
polygons, mask URLs - with no model and no GPU. Put `<slug>.png` files in
SEGMENT_STUB_DIR, where the slug is the target lowercased with non
alphanumerics replaced by `_`. A missing file means "target not found", which
is how the null-region path is tested.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image

from ..config import Settings
from . import Instance, Segmenter


def slugify(target: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", target.strip().lower()).strip("_")


class StubEngine(Segmenter):
    name = "stub"

    def __init__(self, settings: Settings):
        if not settings.stub_dir:
            raise RuntimeError("SEGMENT_STUB_DIR must be set for the stub engine")
        self.settings = settings

        self.directory = Path(settings.stub_dir).expanduser().resolve()
        self.detail = f"stub masks from {self.directory}"

    def instances(self, image, target: str) -> list[Instance]:
        path = self.directory / f"{slugify(target)}.png"
        if not path.exists():
            return []
        mask = Image.open(path).convert("L")
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.NEAREST)
        array = np.asarray(mask) > 127
        if not array.any():
            return []
        return [Instance(score=0.99, mask=array)]

    def propose(self, image) -> list[Instance]:
        """Every mask file in the stub directory, in name order, as candidates."""
        found: list[Instance] = []
        for index, path in enumerate(sorted(self.directory.glob("*.png"))):
            mask = Image.open(path).convert("L")
            if mask.size != image.size:
                mask = mask.resize(image.size, Image.Resampling.NEAREST)
            array = np.asarray(mask) > 127
            if array.any():
                found.append(Instance(score=max(0.5, 0.99 - index * 0.03), mask=array))
        return found

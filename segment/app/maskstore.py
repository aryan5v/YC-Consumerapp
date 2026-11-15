"""Optional PNG alpha masks, written per target so the app can clip its glow.

Files are random-named, so the URL is unguessable; they are served without the
API key because a phone's <Image> loader is happier that way and a mask leaks
nothing but the silhouette of a frame the caller already has.
"""

from __future__ import annotations

import secrets
import time
from pathlib import Path

import numpy as np
from PIL import Image


class MaskStore:
    def __init__(self, directory: Path, *, ttl_s: int = 3600, max_side: int = 1024):
        self.directory = Path(directory).expanduser()
        self.ttl_s = ttl_s
        self.max_side = max_side

    def enabled(self) -> bool:
        return self.max_side != 0

    def write(self, mask: np.ndarray) -> str:
        """Store one boolean mask as an 8-bit alpha PNG and return its id."""
        self.directory.mkdir(parents=True, exist_ok=True)
        alpha = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
        if self.max_side and max(alpha.size) > self.max_side:
            scale = self.max_side / max(alpha.size)
            size = (max(1, round(alpha.width * scale)), max(1, round(alpha.height * scale)))
            alpha = alpha.resize(size, Image.Resampling.NEAREST)
        name = f"{secrets.token_urlsafe(12)}.png"
        alpha.save(self.directory / name, format="PNG", optimize=True)
        self._sweep()
        return name

    def path_for(self, name: str) -> Path | None:
        if "/" in name or "\\" in name or not name.endswith(".png"):
            return None
        candidate = (self.directory / name).resolve()
        if candidate.parent != self.directory.resolve() or not candidate.exists():
            return None
        return candidate

    def _sweep(self) -> None:
        if self.ttl_s <= 0:
            return
        cutoff = time.time() - self.ttl_s
        try:
            for entry in self.directory.glob("*.png"):
                if entry.stat().st_mtime < cutoff:
                    entry.unlink(missing_ok=True)
        except OSError:
            return

"""Environment configuration for the Fork segmentation service."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ENGINES = ("auto", "sam3", "dino_sam2", "stub")


def _get(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _get_int(name: str, default: int) -> int:
    raw = _get(name)
    try:
        return int(raw) if raw is not None else default
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer, got {raw!r}") from exc


def _get_float(name: str, default: float) -> float:
    raw = _get(name)
    try:
        return float(raw) if raw is not None else default
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number, got {raw!r}") from exc


@dataclass(frozen=True)
class Settings:
    api_key: str = ""
    engine: str = "auto"
    device: str = "auto"

    host: str = "0.0.0.0"
    port: int = 8000
    max_concurrency: int = 1

    frame_timeout_s: float = 8.0
    max_frame_bytes: int = 12 * 1024 * 1024
    max_image_pixels: int = 40_000_000

    max_targets: int = 12
    box_threshold: float = 0.30
    text_threshold: float = 0.25
    mask_threshold: float = 0.5
    max_boxes_per_target: int = 12

    min_component_frac: float = 0.20
    max_hole_frac: float = 0.05
    max_hole_abs_frac: float = 0.005
    polygon_point_budget: int = 200

    max_objects: int = 8
    min_object_area_frac: float = 0.004
    max_object_area_frac: float = 0.50
    edge_margin_px: int = 3
    nms_iou: float = 0.60
    nms_containment: float = 0.85
    amg_points_per_side: int = 16
    amg_points_per_batch: int = 32

    mask_dir: Path = field(default_factory=lambda: Path("./masks"))
    mask_ttl_s: int = 3600
    mask_max_side: int = 1024
    mask_public_base_url: str = ""

    sam3_model_id: str = "facebook/sam3"
    dino_model_id: str = "IDEA-Research/grounding-dino-tiny"
    sam2_model_id: str = "facebook/sam2.1-hiera-small"
    stub_dir: str = ""

    @property
    def repo_root(self) -> Path:
        return Path(__file__).resolve().parent.parent

    @classmethod
    def from_env(cls) -> "Settings":
        engine = (_get("SEGMENT_ENGINE", "auto") or "auto").lower()
        if engine not in ENGINES:
            raise RuntimeError(f"SEGMENT_ENGINE must be one of {ENGINES}, got {engine!r}")
        mask_dir = Path(_get("SEGMENT_MASK_DIR", "./masks") or "./masks").expanduser()
        defaults = cls()
        return cls(
            api_key=_get("SEGMENT_API_KEY", "") or "",
            engine=engine,
            device=(_get("SEGMENT_DEVICE", "auto") or "auto").lower(),
            host=_get("SEGMENT_HOST", "0.0.0.0") or "0.0.0.0",
            port=_get_int("SEGMENT_PORT", 8000),
            max_concurrency=max(1, _get_int("SEGMENT_MAX_CONCURRENCY", 1)),
            frame_timeout_s=_get_float("SEGMENT_FRAME_TIMEOUT_S", 8.0),
            max_frame_bytes=_get_int("SEGMENT_MAX_FRAME_BYTES", 12 * 1024 * 1024),
            max_image_pixels=_get_int("SEGMENT_MAX_IMAGE_PIXELS", 40_000_000),
            max_targets=_get_int("SEGMENT_MAX_TARGETS", 12),
            box_threshold=_get_float("SEGMENT_BOX_THRESHOLD", 0.30),
            text_threshold=_get_float("SEGMENT_TEXT_THRESHOLD", 0.25),
            mask_threshold=_get_float("SEGMENT_MASK_THRESHOLD", 0.5),
            max_boxes_per_target=_get_int("SEGMENT_MAX_BOXES_PER_TARGET", 12),
            min_component_frac=_get_float("SEGMENT_MIN_COMPONENT_FRAC", 0.20),
            max_hole_frac=_get_float("SEGMENT_MAX_HOLE_FRAC", 0.05),
            max_hole_abs_frac=_get_float("SEGMENT_MAX_HOLE_ABS_FRAC", 0.005),
            polygon_point_budget=_get_int("SEGMENT_POLYGON_POINT_BUDGET", 200),
            max_objects=_get_int("SEGMENT_MAX_OBJECTS", 8),
            min_object_area_frac=_get_float("SEGMENT_MIN_OBJECT_AREA_FRAC", 0.004),
            max_object_area_frac=_get_float("SEGMENT_MAX_OBJECT_AREA_FRAC", 0.50),
            edge_margin_px=_get_int("SEGMENT_EDGE_MARGIN_PX", 3),
            nms_iou=_get_float("SEGMENT_NMS_IOU", 0.60),
            nms_containment=_get_float("SEGMENT_NMS_CONTAINMENT", 0.85),
            amg_points_per_side=_get_int("SEGMENT_AMG_POINTS_PER_SIDE", 16),
            amg_points_per_batch=_get_int("SEGMENT_AMG_POINTS_PER_BATCH", 32),
            mask_dir=mask_dir,
            mask_ttl_s=_get_int("SEGMENT_MASK_TTL_S", 3600),
            mask_max_side=_get_int("SEGMENT_MASK_MAX_SIDE", 1024),
            mask_public_base_url=(_get("SEGMENT_MASK_PUBLIC_BASE_URL", "") or "").rstrip("/"),
            sam3_model_id=_get("SEGMENT_SAM3_MODEL_ID", defaults.sam3_model_id) or defaults.sam3_model_id,
            dino_model_id=_get("SEGMENT_DINO_MODEL_ID", defaults.dino_model_id) or defaults.dino_model_id,
            sam2_model_id=_get("SEGMENT_SAM2_MODEL_ID", defaults.sam2_model_id) or defaults.sam2_model_id,
            stub_dir=_get("SEGMENT_STUB_DIR", "") or "",
        )

    def resolve_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:  # pragma: no cover - torch is a hard dependency in practice
            return "cpu"

    def require_api_key(self) -> str:
        if not self.api_key:
            raise RuntimeError(
                "SEGMENT_API_KEY is not set. Generate one with "
                "`python -c \"import secrets;print(secrets.token_urlsafe(32))\"` "
                "and export it before starting the server."
            )
        return self.api_key

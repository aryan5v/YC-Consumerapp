"""Unnamed "top salient objects" mode: SAM 2.1 point-grid masks plus filtering.

The named-target mode asks a text-promptable model about specific things. This
mode does the opposite: it proposes everything in the frame, then keeps the
objects a player could plausibly tap - big enough to hit, not the whole frame,
not cut off by the edge, not a duplicate of a better mask.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import Settings
from .engines import Instance
from .engines.dino_sam2 import SAM2_LOGIT_THRESHOLD, best_per_prompt


@dataclass
class SalientObject:
    score: float
    mask: np.ndarray


class GridMasker:
    """SAM 2.1 prompted on a regular point grid; one decode per point."""

    def __init__(self, model, processor, torch_module, device: str, settings: Settings):
        self.model = model
        self.processor = processor
        self.torch = torch_module
        self.device = device
        self.settings = settings

    def propose(self, image, points_per_side: int) -> list[Instance]:
        width, height = image.size
        step = 1.0 / (points_per_side + 1)
        points = [
            [int(width * step * (i + 1)), int(height * step * (j + 1))]
            for i in range(points_per_side)
            for j in range(points_per_side)
        ]
        results: list[Instance] = []
        batch = max(1, self.settings.amg_points_per_batch)
        for start in range(0, len(points), batch):
            chunk = points[start : start + batch]
            inputs = self.processor(
                images=image,
                input_points=[[[[x, y]] for x, y in chunk]],
                input_labels=[[[1] for _ in chunk]],
                return_tensors="pt",
            ).to(self.device)
            with self.torch.inference_mode():
                outputs = self.model(**inputs)
            masks = self.processor.post_process_masks(
                outputs.pred_masks.detach().cpu(),
                inputs["original_sizes"],
                SAM2_LOGIT_THRESHOLD,
                True,
            )[0]
            scores = np.asarray(outputs.iou_scores.detach().cpu().numpy()[0])
            selected, chosen = best_per_prompt(np.asarray(masks), scores)
            for mask, score in zip(selected, chosen):
                if mask.any():
                    results.append(Instance(score=score, mask=mask))
        return results


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _touches_edge(mask: np.ndarray, margin: int) -> bool:
    x0, y0, x1, y1 = _bbox(mask)
    height, width = mask.shape
    return x0 <= margin or y0 <= margin or x1 >= width - 1 - margin or y1 >= height - 1 - margin


def select_salient(
    instances: list[Instance],
    width: int,
    height: int,
    settings: Settings,
    k: int,
) -> list[Instance]:
    """Filter, de-duplicate and rank candidate masks for the unnamed mode."""
    frame_area = float(width * height)
    wanted = max(1, k)
    candidates: list[tuple[float, np.ndarray]] = []
    for instance in instances:
        mask = instance.mask
        area = float(mask.sum())
        frac = area / frame_area
        if frac < settings.min_object_area_frac or frac > settings.max_object_area_frac:
            continue
        if _touches_edge(mask, settings.edge_margin_px):
            continue
        candidates.append((instance.score, mask))

    candidates.sort(key=lambda item: (-item[0], -int(item[1].sum())))

    accepted: list[tuple[float, np.ndarray]] = []
    for score, mask in candidates:
        if len(accepted) >= wanted:
            break
        area = float(mask.sum())
        overlap_max = 0.0
        covered = 0.0
        for _, kept in accepted:
            inter = float(np.logical_and(mask, kept).sum())
            union = area + float(kept.sum()) - inter
            if union > 0:
                overlap_max = max(overlap_max, inter / union)
            covered = max(covered, inter / area if area > 0 else 0.0)
        if overlap_max > settings.nms_iou or covered > settings.nms_containment:
            continue
        accepted.append((score, mask))
    return [Instance(score=score, mask=mask) for score, mask in accepted]


def crop_box(mask: np.ndarray, width: int, height: int) -> dict[str, float]:
    x0, y0, x1, y1 = _bbox(mask)
    return {
        "x": round(x0 / width, 5),
        "y": round(y0 / height, 5),
        "w": round((x1 - x0 + 1) / width, 5),
        "h": round((y1 - y0 + 1) / height, 5),
    }

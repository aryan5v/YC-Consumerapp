"""Mask cleaning, inside-mask centroid and outline polygons.

Everything here works on a boolean HxW numpy array and returns coordinates as
fractions of the frame (0..1, origin top left), which is what the app's
`option.region` contract expects.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np
from scipy import ndimage


@dataclass
class MaskGeometry:
    mask: np.ndarray
    centroid: tuple[float, float]
    """Centroid in pixels, guaranteed to lie inside the mask."""
    polygons: list[np.ndarray]
    """Outer rings in pixel coordinates, simplified."""


def _fill_small_holes(mask: np.ndarray, max_hole_frac: float, max_hole_abs_frac: float) -> np.ndarray:
    """Fill enclosed background regions that are small relative to the object.

    A stone arch's opening, or the gap under a rowboat's hull, stays masked out
    because it is a large hole; sensor noise and text-like speckle inside the
    object are filled.
    """
    area = int(mask.sum())
    if area == 0:
        return mask
    limit = max(area * max_hole_frac, mask.size * max_hole_abs_frac)
    holes, count = ndimage.label(~mask, structure=np.ones((3, 3), dtype=np.uint8))
    if count == 0:
        return mask
    # Which labels touch the image border (that background is not a hole).
    border = np.concatenate([holes[0, :], holes[-1, :], holes[:, 0], holes[:, -1]])
    border_labels = set(int(v) for v in np.unique(border) if v != 0)
    sizes = np.bincount(holes.ravel(), minlength=count + 1)
    fill_labels = [
        label for label in range(1, count + 1) if label not in border_labels and sizes[label] < limit
    ]
    if not fill_labels:
        return mask
    return mask | np.isin(holes, fill_labels)


def clean_mask(
    mask: np.ndarray,
    min_component_frac: float = 0.20,
    max_hole_frac: float = 0.05,
    max_hole_abs_frac: float = 0.005,
) -> np.ndarray:
    """Keep the meaningful components of a mask and fill its small holes."""
    mask = np.ascontiguousarray(mask.astype(bool))
    if not mask.any():
        return mask
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if count <= 1:
        return _fill_small_holes(mask, max_hole_frac, max_hole_abs_frac)
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest = int(areas.max())
    keep = [i + 1 for i, area in enumerate(areas) if area >= max(largest * min_component_frac, 1)]
    if not keep:
        return mask
    cleaned = np.isin(labels, keep)
    return _fill_small_holes(cleaned, max_hole_frac, max_hole_abs_frac)


def centroid_inside(mask: np.ndarray) -> tuple[float, float]:
    """A point that is guaranteed to lie inside the mask.

    Uses the deepest point of the distance transform, so concave objects (an
    arch, a crescent) get a dot inside the silhouette rather than in the gap
    under a plain centroid.
    """
    if not mask.any():
        raise ValueError("cannot compute a centroid for an empty mask")
    dist = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    y, x = np.unravel_index(int(np.argmax(dist)), dist.shape)
    return float(x), float(y)


def _simplify(contour: np.ndarray, epsilon: float) -> np.ndarray:
    approx = cv2.approxPolyDP(contour, epsilon, True)
    return approx.reshape(-1, 2)


def mask_outline(
    mask: np.ndarray,
    point_budget: int = 200,
    min_component_frac: float = 0.20,
) -> list[np.ndarray]:
    """Outer outline(s) of a cleaned mask, simplified to fit a point budget."""
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []
    areas = [abs(cv2.contourArea(c)) for c in contours]
    largest = max(areas) if areas else 0.0
    keep = [c for c, area in zip(contours, areas) if area >= max(largest * min_component_frac, 1.0)]
    if not keep:
        keep = [contours[int(np.argmax(areas))]]
    keep.sort(key=lambda c: -abs(cv2.contourArea(c)))
    keep = keep[:8]

    perimeter = sum(cv2.arcLength(c, True) for c in keep)
    epsilon = max(perimeter * 1e-4, 0.5)
    rings: list[np.ndarray] = []
    for _ in range(24):
        rings = [_simplify(c, epsilon) for c in keep]
        total = sum(len(r) for r in rings)
        if total <= point_budget:
            break
        epsilon *= 1.35
    else:
        scale = point_budget / max(1, sum(len(r) for r in rings))
        for i, ring in enumerate(rings):
            if len(ring) > 8:
                step = max(1, int(np.ceil(len(ring) * scale)))
                rings[i] = ring[::step]
    return [r for r in rings if len(r) >= 3]


def geometry_from_mask(
    mask: np.ndarray,
    *,
    min_component_frac: float = 0.20,
    max_hole_frac: float = 0.05,
    max_hole_abs_frac: float = 0.005,
    point_budget: int = 200,
) -> MaskGeometry | None:
    cleaned = clean_mask(mask, min_component_frac, max_hole_frac, max_hole_abs_frac)
    if not cleaned.any():
        return None
    polygons = mask_outline(cleaned, point_budget, min_component_frac)
    return MaskGeometry(
        mask=cleaned,
        centroid=centroid_inside(cleaned),
        polygons=polygons,
    )


def _round(value: float) -> float:
    return float(round(value, 5))


def polygon_payload(rings: list[np.ndarray], width: int, height: int) -> list | None:
    """Normalise rings to 0..1 fractions.

    One ring comes back as `[[x, y], ...]`; a split object comes back as
    `[[[x, y], ...], [[x, y], ...]]`, the shape the contract allows.
    """
    normalised: list[list[list[float]]] = []
    for ring in rings:
        points = [[_round(x / width), _round(y / height)] for x, y in ring]
        if len(points) >= 3:
            normalised.append(points)
    if not normalised:
        return None
    if len(normalised) == 1:
        return normalised[0]
    return normalised


def centroid_payload(point: tuple[float, float], width: int, height: int) -> dict[str, float]:
    return {"x": _round(point[0] / width), "y": _round(point[1] / height)}

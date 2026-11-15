"""Mask cleaning, inside-mask centroid and polygon simplification."""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw

from app.masks import centroid_payload, clean_mask, geometry_from_mask, polygon_payload


def _empty(width=200, height=100):
    return np.zeros((height, width), dtype=bool)


def test_keeps_meaningful_components_and_drops_speckle():
    mask = _empty()
    mask[20:80, 20:80] = True
    mask[10:12, 150:152] = True  # speckle, 0.6% of the largest component

    cleaned = clean_mask(mask, min_component_frac=0.20)

    assert cleaned[50, 50]
    assert not cleaned[11, 151]


def test_fills_small_holes_and_keeps_large_ones():
    image = Image.new("L", (200, 100), 0)
    draw = ImageDraw.Draw(image)
    draw.rectangle([20, 20, 180, 90], fill=255)
    draw.rectangle([40, 40, 44, 44], fill=0)  # small hole: filled
    draw.rectangle([100, 30, 170, 85], fill=0)  # large opening: kept
    mask = np.asarray(image) > 127

    cleaned = clean_mask(mask)

    assert cleaned[42, 42], "small hole should be filled"
    assert not cleaned[60, 130], "the arch opening is a real hole, keep it"


def test_centroid_lands_inside_a_concave_mask():
    image = Image.new("L", (200, 100), 0)
    draw = ImageDraw.Draw(image)
    draw.rectangle([20, 20, 180, 90], fill=255)
    draw.rectangle([90, 20, 110, 90], fill=0)  # a vertical gap through the middle
    mask = np.asarray(image) > 127

    geometry = geometry_from_mask(mask)

    assert geometry is not None
    x, y = (int(round(v)) for v in geometry.centroid)
    assert mask[y, x], "the centroid must lie inside the mask"
    assert not (95 <= x <= 105), "a plain centroid would have landed in the gap"


def test_polygon_budget_and_normalisation():
    image = Image.new("L", (400, 400), 0)
    draw = ImageDraw.Draw(image)
    for i in range(30):
        draw.ellipse([i * 4, i * 4, 390 - i * 4, 390 - i * 4], fill=255)
    mask = np.asarray(image) > 127

    geometry = geometry_from_mask(mask, point_budget=64)
    assert geometry is not None
    payload = polygon_payload(geometry.polygons, 400, 400)

    assert isinstance(payload, list)
    assert all(0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 for x, y in payload)
    assert len(payload) <= 64


def test_split_object_returns_several_rings():
    mask = _empty()
    mask[20:60, 10:40] = True
    mask[20:60, 150:190] = True  # same size: both kept

    geometry = geometry_from_mask(mask)
    assert geometry is not None
    payload = polygon_payload(geometry.polygons, 200, 100)

    assert isinstance(payload, list) and isinstance(payload[0][0], list)
    assert len(payload) == 2

    centroid = centroid_payload(geometry.centroid, 200, 100)
    assert 0.0 <= centroid["x"] <= 1.0 and 0.0 <= centroid["y"] <= 1.0

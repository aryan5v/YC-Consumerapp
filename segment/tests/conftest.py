"""Shared fixtures: a synthetic frame plus mask files, and a stub-backed API."""

from __future__ import annotations

import base64
import io
import os

import numpy as np
import pytest
from PIL import Image, ImageDraw

FRAME_W, FRAME_H = 200, 100


def _canvas() -> Image.Image:
    return Image.new("L", (FRAME_W, FRAME_H), 0)


@pytest.fixture(scope="session")
def frame_png() -> bytes:
    image = Image.new("RGB", (FRAME_W, FRAME_H), (40, 60, 90))
    draw = ImageDraw.Draw(image)
    draw.rectangle([10, 40, 70, 90], fill=(200, 120, 40))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture(scope="session")
def frame_b64(frame_png: bytes) -> str:
    return base64.b64encode(frame_png).decode()


@pytest.fixture()
def stub_dir(tmp_path) -> str:
    """Mask files named after the targets the stub engine looks up."""
    directory = tmp_path / "masks"
    directory.mkdir()

    boat = _canvas()
    ImageDraw.Draw(boat).ellipse([30, 30, 110, 90], fill=255)
    boat.save(directory / "rowboat.png")

    # A stone arch: a body with a large opening (kept) and a small speckle
    # inside the stone (filled), plus a detached speckle (dropped).
    arch = _canvas()
    draw = ImageDraw.Draw(arch)
    draw.rectangle([120, 20, 190, 95], fill=255)
    draw.ellipse([140, 50, 175, 95], fill=0)
    draw.rectangle([150, 30, 154, 34], fill=0)
    arch.save(directory / "stone_arch.png")

    speck = _canvas()
    ImageDraw.Draw(speck).rectangle([0, 0, 4, 4], fill=255)
    speck.save(directory / "zz_tiny_speck.png")

    whole = Image.new("L", (FRAME_W, FRAME_H), 255)
    whole.save(directory / "zz_whole_frame.png")

    cut_off = _canvas()
    ImageDraw.Draw(cut_off).rectangle([0, 60, 60, 99], fill=255)
    cut_off.save(directory / "zz_edge_cut.png")

    return str(directory)


@pytest.fixture()
def client(stub_dir, monkeypatch, frame_png):
    monkeypatch.setenv("SEGMENT_API_KEY", "test-key")
    monkeypatch.setenv("SEGMENT_ENGINE", "stub")
    monkeypatch.setenv("SEGMENT_STUB_DIR", stub_dir)
    monkeypatch.setenv("SEGMENT_MASK_DIR", os.path.join(stub_dir, "..", "out"))
    monkeypatch.setenv("SEGMENT_MASK_PUBLIC_BASE_URL", "https://seg.test.aryank.xyz")

    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.server import create_app

    with TestClient(create_app(Settings.from_env())) as test_client:
        yield test_client


@pytest.fixture()
def auth() -> dict[str, str]:
    return {"Authorization": "Bearer test-key"}


def random_mask() -> np.ndarray:
    rng = np.random.default_rng(7)
    return rng.random((FRAME_H, FRAME_W)) > 0.4

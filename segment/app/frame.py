"""Frame acquisition: download a frame URL or decode base64, safely."""

from __future__ import annotations

import base64
import binascii
import io
from dataclasses import dataclass

import requests
from PIL import Image, ImageFile, UnidentifiedImageError

ALLOWED_SCHEMES = ("http://", "https://")

ImageFile.LOAD_TRUNCATED_IMAGES = False


class FrameError(ValueError):
    """The caller's frame could not be turned into a usable image."""


@dataclass
class FrameResult:
    image: Image.Image
    source: str
    bytes: int


def fetch_bytes(url: str, *, timeout_s: float, max_bytes: int) -> bytes:
    if not url.lower().startswith(ALLOWED_SCHEMES):
        raise FrameError("frame_url must be an http(s) URL")
    try:
        with requests.get(url, stream=True, timeout=timeout_s, allow_redirects=True) as response:
            if response.status_code != 200:
                raise FrameError(f"frame_url returned HTTP {response.status_code}")
            kind = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if kind and not kind.startswith("image/"):
                raise FrameError(f"frame_url returned Content-Type {kind!r}, expected an image")
            declared = response.headers.get("Content-Length")
            if declared is not None:
                try:
                    if int(declared) > max_bytes:
                        raise FrameError(f"frame_url is larger than the {max_bytes} byte limit")
                except ValueError:
                    pass
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_content(64 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    raise FrameError(f"frame_url exceeded the {max_bytes} byte limit")
                chunks.append(chunk)
    except requests.Timeout as exc:
        raise FrameError(f"frame_url timed out after {timeout_s}s") from exc
    except requests.RequestException as exc:
        raise FrameError(f"frame_url could not be downloaded: {exc}") from exc
    if not chunks:
        raise FrameError("frame_url returned an empty body")
    return b"".join(chunks)


def decode_b64(payload: str, *, max_bytes: int) -> bytes:
    data = payload.strip()
    if data.startswith("data:"):
        _, _, data = data.partition(",")
    data = "".join(data.split())
    if len(data) > max_bytes * 2:
        raise FrameError("frame_b64 is larger than the configured limit")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise FrameError("frame_b64 is not valid base64") from exc
    if len(raw) > max_bytes:
        raise FrameError(f"frame_b64 decodes to more than {max_bytes} bytes")
    return raw


def open_image(raw: bytes, *, max_pixels: int) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise FrameError(f"frame is not a decodable image: {exc}") from exc
    width, height = image.size
    if width * height > max_pixels:
        raise FrameError(f"frame is {width}x{height}, above the {max_pixels} pixel limit")
    if width < 8 or height < 8:
        raise FrameError(f"frame is only {width}x{height}")
    return image.convert("RGB")


def load_frame(
    *,
    frame_url: str | None,
    frame_b64: str | None,
    timeout_s: float,
    max_bytes: int,
    max_pixels: int,
) -> FrameResult:
    if (frame_url is None) == (frame_b64 is None):
        raise FrameError("send exactly one of frame_url or frame_b64")
    if frame_url is not None:
        raw = fetch_bytes(frame_url, timeout_s=timeout_s, max_bytes=max_bytes)
        source = "url"
    else:
        raw = decode_b64(frame_b64 or "", max_bytes=max_bytes)
        source = "b64"
    image = open_image(raw, max_pixels=max_pixels)
    return FrameResult(image=image, source=source, bytes=len(raw))

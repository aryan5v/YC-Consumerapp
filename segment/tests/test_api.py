"""HTTP contract: auth, both modes, frame intake and mask URLs."""

from __future__ import annotations

import base64
import http.server
import io
import threading

import pytest
from PIL import Image


def test_health_is_public(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["engine"] == "stub"


def test_missing_or_wrong_key_is_rejected(client):
    assert client.get("/health").status_code == 200

    no_key = client.post("/segment", json={"frame_b64": "x", "targets": ["rowboat"]})
    assert no_key.status_code == 401

    wrong = client.post(
        "/segment",
        json={"frame_b64": "x", "targets": ["rowboat"]},
        headers={"Authorization": "Bearer nope"},
    )
    assert wrong.status_code == 401


def test_named_mode_returns_region_with_polygon_and_mask_url(client, auth, frame_b64):
    response = client.post(
        "/segment",
        json={"frame_b64": frame_b64, "targets": ["rowboat", "stone arch", "lighthouse"]},
        headers=auth,
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["mode"] == "targets"
    assert body["frame"] == {"width": 200, "height": 100, "source": "b64"}
    assert [item["target"] for item in body["results"]] == ["rowboat", "stone arch", "lighthouse"]

    boat, arch, missing = body["results"]
    assert boat["found"] and arch["found"] and not missing["found"]
    assert missing["region"] is None and missing["score"] == 0.0

    for item in (boat, arch):
        region = item["region"]
        assert set(region) == {"centroid", "polygon", "maskUrl"}
        points = region["polygon"]
        assert isinstance(points, list) and len(points) >= 3
        assert all(0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 for x, y in points)
        assert 0.0 <= region["centroid"]["x"] <= 1.0
        assert 0.0 <= region["centroid"]["y"] <= 1.0
        assert region["maskUrl"].startswith("https://seg.test.aryank.xyz/masks/")

    # The rowboat centroid sits inside its ellipse, in the middle-left of frame.
    assert 0.15 < boat["region"]["centroid"]["x"] < 0.5
    assert 0.3 < boat["region"]["centroid"]["y"] < 0.85


def test_named_mode_cleans_the_mask(client, auth, frame_b64):
    body = client.post(
        "/segment", json={"frame_b64": frame_b64, "targets": ["stone arch"]}, headers=auth
    ).json()
    region = body["results"][0]["region"]
    xs = [point[0] for point in region["polygon"]]
    ys = [point[1] for point in region["polygon"]]

    # The speckle at the top-left corner of the frame was dropped, so the
    # outline stays on the arch at the right of the frame.
    assert min(xs) > 0.5
    assert max(ys) <= 1.0


def test_salient_mode_filters_tiny_huge_and_edge_cut_masks(client, auth, frame_b64):
    response = client.post("/segment", json={"frame_b64": frame_b64}, headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["mode"] == "objects"
    assert "results" not in body
    assert len(body["objects"]) == 2, body["objects"]

    for item in body["objects"]:
        assert set(item) == {"index", "score", "area", "centroid", "polygon", "maskUrl", "crop"}
        assert 0.004 <= item["area"] <= 0.50
        crop = item["crop"]
        assert crop["x"] > 0.0 and crop["y"] > 0.0
        assert crop["x"] + crop["w"] <= 1.0 and crop["y"] + crop["h"] <= 1.0
        assert item["polygon"] is not None


def test_salient_mode_honours_max_objects(client, auth, frame_b64):
    body = client.post(
        "/segment", json={"frame_b64": frame_b64, "max_objects": 1}, headers=auth
    ).json()
    assert len(body["objects"]) == 1


def test_mask_url_returns_a_png_at_the_frame_aspect_ratio(client, auth, frame_b64):
    body = client.post(
        "/segment", json={"frame_b64": frame_b64, "targets": ["rowboat"]}, headers=auth
    ).json()
    path = body["results"][0]["region"]["maskUrl"].split("test.aryank.xyz")[1]

    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"

    image = Image.open(io.BytesIO(response.content)).convert("L")
    assert image.size == (200, 100)
    assert image.getextrema()[1] == 255


def test_frame_input_validation(client, auth, frame_b64):
    both = client.post(
        "/segment",
        json={"frame_b64": frame_b64, "frame_url": "https://example.com/a.jpg"},
        headers=auth,
    )
    assert both.status_code == 400

    neither = client.post("/segment", json={"targets": ["rowboat"]}, headers=auth)
    assert neither.status_code == 400

    not_an_image = client.post(
        "/segment",
        json={"frame_b64": base64.b64encode(b"not an image").decode(), "targets": ["rowboat"]},
        headers=auth,
    )
    assert not_an_image.status_code == 400

    bad_base64 = client.post(
        "/segment", json={"frame_b64": "!!!!", "targets": ["rowboat"]}, headers=auth
    )
    assert bad_base64.status_code == 400


@pytest.fixture()
def frame_server(frame_png):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            if self.path == "/frame.png":
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(frame_png)))
                self.end_headers()
                self.wfile.write(frame_png)
            elif self.path == "/huge.png":
                payload = b"x" * (2 * 1024 * 1024)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            elif self.path == "/slow.png":
                import time

                time.sleep(3)
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                self.wfile.write(frame_png)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def test_frame_url_is_downloaded_with_a_size_limit(client, auth, frame_server):
    ok = client.post(
        "/segment", json={"frame_url": f"{frame_server}/frame.png", "targets": ["rowboat"]},
        headers=auth,
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["frame"]["source"] == "url"
    assert ok.json()["results"][0]["found"]

    missing = client.post(
        "/segment", json={"frame_url": f"{frame_server}/nope.png", "targets": ["rowboat"]},
        headers=auth,
    )
    assert missing.status_code == 400

    not_http = client.post(
        "/segment", json={"frame_url": "file:///etc/passwd", "targets": ["rowboat"]}, headers=auth
    )
    assert not_http.status_code == 400


def test_frame_url_enforces_the_size_limit(monkeypatch, frame_server, stub_dir):
    monkeypatch.setenv("SEGMENT_API_KEY", "test-key")
    monkeypatch.setenv("SEGMENT_ENGINE", "stub")
    monkeypatch.setenv("SEGMENT_STUB_DIR", stub_dir)
    monkeypatch.setenv("SEGMENT_MAX_FRAME_BYTES", "65536")

    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.server import create_app

    with TestClient(create_app(Settings.from_env())) as client:
        response = client.post(
            "/segment",
            json={"frame_url": f"{frame_server}/huge.png", "targets": ["rowboat"]},
            headers={"Authorization": "Bearer test-key"},
        )
    assert response.status_code == 400
    assert "limit" in response.json()["detail"]


def test_frame_url_times_out(monkeypatch, frame_server, stub_dir, frame_png):
    monkeypatch.setenv("SEGMENT_API_KEY", "test-key")
    monkeypatch.setenv("SEGMENT_ENGINE", "stub")
    monkeypatch.setenv("SEGMENT_STUB_DIR", stub_dir)
    monkeypatch.setenv("SEGMENT_FRAME_TIMEOUT_S", "0.5")

    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.server import create_app

    with TestClient(create_app(Settings.from_env())) as client:
        response = client.post(
            "/segment",
            json={"frame_url": f"{frame_server}/slow.png", "targets": ["rowboat"]},
            headers={"Authorization": "Bearer test-key"},
        )
    assert response.status_code == 400
    assert "timed out" in response.json()["detail"]

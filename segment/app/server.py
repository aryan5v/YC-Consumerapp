"""FastAPI application: POST /segment, GET /health, GET /masks/<id>.png."""

from __future__ import annotations

import logging
import secrets
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from . import __version__
from .config import Settings
from .engines import Segmenter, build_engine
from .frame import FrameError, load_frame
from .masks import centroid_payload, geometry_from_mask, polygon_payload
from .maskstore import MaskStore
from .salient import crop_box, select_salient
from .schemas import SegmentRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("segment")


class Service:
    """Everything the endpoints need, built once at startup."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.started_at = time.time()
        self.engine: Segmenter | None = None
        self.masks = MaskStore(
            settings.mask_dir, ttl_s=settings.mask_ttl_s, max_side=settings.mask_max_side
        )
        self.semaphore = threading.BoundedSemaphore(settings.max_concurrency)

    def load(self) -> None:
        self.engine = build_engine(self.settings, log=log.info)
        log.info("engine ready: %s (%s)", self.engine.name, self.engine.detail)


def _authorise(settings: Settings, authorization: str | None) -> None:
    try:
        expected = settings.require_api_key()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    presented = authorization.split(" ", 1)[1].strip()
    if not secrets.compare_digest(presented, expected):
        raise HTTPException(status_code=401, detail="invalid API key")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    service = Service(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        service.load()
        yield

    app = FastAPI(title="Fork segmentation service", version=__version__, lifespan=lifespan)
    app.state.service = service

    @app.get("/health")
    def health() -> dict:
        engine = service.engine
        return {
            "status": "ok" if engine is not None else "loading",
            "engine": engine.name if engine else None,
            "model": engine.detail if engine else None,
            "device": settings.resolve_device(),
            "mask_urls": service.masks.enabled(),
            "uptime_s": round(time.time() - service.started_at, 2),
        }

    @app.post("/segment")
    def segment(
        request: Request,
        payload: SegmentRequest,
        authorization: str | None = Header(default=None),
    ) -> JSONResponse:
        _authorise(settings, authorization)
        if service.engine is None:
            raise HTTPException(status_code=503, detail="model still loading")

        started = time.perf_counter()
        try:
            frame = load_frame(
                frame_url=payload.frame_url,
                frame_b64=payload.frame_b64,
                timeout_s=settings.frame_timeout_s,
                max_bytes=settings.max_frame_bytes,
                max_pixels=settings.max_image_pixels,
            )
        except FrameError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        image = frame.image
        width, height = image.size
        base = settings.mask_public_base_url or str(request.base_url).rstrip("/")

        with service.semaphore:
            if payload.targets:
                body = _named_results(service, image, payload.targets, width, height, base)
            else:
                body = _salient_results(
                    service, image, payload.max_objects or settings.max_objects, width, height, base
                )

        body["frame"] = {"width": width, "height": height, "source": frame.source}
        body["engine"] = service.engine.name if service.engine else None
        body["ms"] = round((time.perf_counter() - started) * 1000, 1)
        return JSONResponse(body)

    @app.get("/masks/{name}")
    def mask(name: str) -> FileResponse:
        path = service.masks.path_for(name)
        if path is None:
            raise HTTPException(status_code=404, detail="no such mask")
        return FileResponse(
            path, media_type="image/png", headers={"Cache-Control": "public, max-age=600"}
        )

    return app


def _region(service: Service, mask, width: int, height: int, base: str) -> dict | None:
    geometry = geometry_from_mask(
        mask,
        min_component_frac=service.settings.min_component_frac,
        max_hole_frac=service.settings.max_hole_frac,
        max_hole_abs_frac=service.settings.max_hole_abs_frac,
        point_budget=service.settings.polygon_point_budget,
    )
    if geometry is None:
        return None
    mask_url = None
    if service.masks.enabled():
        mask_url = f"{base}/masks/{service.masks.write(geometry.mask)}"
    return {
        "centroid": centroid_payload(geometry.centroid, width, height),
        "polygon": polygon_payload(geometry.polygons, width, height),
        "maskUrl": mask_url,
    }


def _named_results(
    service: Service, image, targets: list[str], width: int, height: int, base: str
) -> dict:
    engine = service.engine
    assert engine is not None
    results = []
    for target in targets:
        instances = engine.instances(image, target)
        best = max(instances, key=lambda item: item.score, default=None)
        region = _region(service, best.mask, width, height, base) if best is not None else None
        found = region is not None
        results.append(
            {
                "target": target,
                "found": found,
                "score": round(best.score, 4) if found and best is not None else 0.0,
                "region": region,
            }
        )
    return {"mode": "targets", "results": results}


def _salient_results(
    service: Service, image, k: int, width: int, height: int, base: str
) -> dict:
    engine = service.engine
    assert engine is not None
    candidates = engine.propose(image)
    selected = select_salient(candidates, width, height, service.settings, k)
    objects = []
    for index, instance in enumerate(selected):
        region = _region(service, instance.mask, width, height, base)
        if region is None:
            continue
        objects.append(
            {
                "index": index,
                "score": round(instance.score, 4),
                "area": round(float(instance.mask.sum()) / float(width * height), 5),
                "centroid": region["centroid"],
                "polygon": region["polygon"],
                "maskUrl": region["maskUrl"],
                "crop": crop_box(instance.mask, width, height),
            }
        )
    return {"mode": "objects", "objects": objects, "candidates": len(candidates)}


app = create_app()

"""Run the real engine on real images, print the JSON and render an overlay.

    python -m scripts.smoke_cpu IMAGE "target one,target two" [--engine dino_sam2]
    python -m scripts.smoke_cpu IMAGE --mode objects --max-objects 6

The overlay is the same tint the app will draw, so the polygons can be judged
by eye rather than by trusting the numbers.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from PIL import Image, ImageDraw

from app.config import Settings
from app.engines import build_engine
from app.masks import geometry_from_mask, polygon_payload
from app.salient import crop_box, select_salient


def overlay(image: Image.Image, entries: list[dict], path: Path) -> None:
    canvas = image.convert("RGBA")
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    tint = (255, 196, 84, 110)
    palette = [(255, 120, 170, 110), (120, 220, 255, 110), (170, 255, 140, 110)]
    for index, entry in enumerate(entries):
        geometry = entry["geometry"]
        rings = polygon_payload(geometry.polygons, image.width, image.height)
        if rings is None:
            continue
        rings = [rings] if rings and isinstance(rings[0][0], (int, float)) else rings
        colour = tint if len(entries) == 1 else palette[index % len(palette)]
        for ring in rings:
            points = [(x * image.width, y * image.height) for x, y in ring]
            draw.polygon(points, fill=colour)
            draw.line(points + [points[0]], fill=colour[:3] + (255,), width=3)
        dot = geometry.centroid
        radius = 6
        draw.ellipse(
            [dot[0] - radius, dot[1] - radius, dot[0] + radius, dot[1] + radius],
            fill=(255, 255, 255, 255),
            outline=(20, 20, 20, 255),
        )
        label = entry.get("target") or f"#{index}"
        draw.text((dot[0] + 10, dot[1] - 6), label, fill=(255, 255, 255, 255))
    Image.alpha_composite(canvas, layer).convert("RGB").save(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("targets", nargs="?", default="")
    parser.add_argument("--mode", choices=["targets", "objects"], default="targets")
    parser.add_argument("--engine", default="dino_sam2")
    parser.add_argument("--max-objects", type=int, default=6)
    parser.add_argument("--points-per-side", type=int, default=8)
    parser.add_argument("--out", default="renders/smoke")
    args = parser.parse_args()

    import os

    os.environ["SEGMENT_ENGINE"] = args.engine
    os.environ["SEGMENT_AMG_POINTS_PER_SIDE"] = str(args.points_per_side)

    settings = Settings.from_env()
    print(f"engine={settings.engine} device={settings.resolve_device()}", flush=True)
    started = time.perf_counter()
    engine = build_engine(settings, log=lambda message: print(f"  {message}", flush=True))
    print(f"load {time.perf_counter() - started:.1f}s -> {engine.detail}", flush=True)

    image = Image.open(args.image).convert("RGB")
    print(f"image {args.image} {image.size[0]}x{image.size[1]}", flush=True)

    entries: list[dict] = []
    report: dict = {"image": args.image, "engine": engine.name, "size": image.size}

    if args.mode == "targets":
        targets = [item.strip() for item in args.targets.split(",") if item.strip()]
        report["results"] = []
        for target in targets:
            began = time.perf_counter()
            instances = engine.instances(image, target)
            elapsed = (time.perf_counter() - began) * 1000
            best = max(instances, key=lambda item: item.score, default=None)
            geometry = geometry_from_mask(best.mask) if best is not None else None
            entry = {
                "target": target,
                "found": geometry is not None,
                "score": round(best.score, 4) if best is not None else 0.0,
                "instances": len(instances),
                "ms": round(elapsed, 1),
            }
            if geometry is not None:
                points = geometry.polygons
                entry["polygon_points"] = int(sum(len(ring) for ring in points))
                entry["rings"] = len(points)
                entry["centroid"] = [
                    round(geometry.centroid[0] / image.width, 4),
                    round(geometry.centroid[1] / image.height, 4),
                ]
                entries.append({"target": target, "geometry": geometry})
            report["results"].append(entry)
    else:
        began = time.perf_counter()
        candidates = engine.propose(image)
        selected = select_salient(candidates, image.width, image.height, settings, args.max_objects)
        elapsed = (time.perf_counter() - began) * 1000
        report["objects"] = []
        for instance in selected:
            geometry = geometry_from_mask(instance.mask)
            if geometry is None:
                continue
            entries.append({"target": None, "geometry": geometry})
            report["objects"].append(
                {
                    "score": round(instance.score, 4),
                    "area": round(float(instance.mask.sum()) / (image.width * image.height), 4),
                    "centroid": [
                        round(geometry.centroid[0] / image.width, 4),
                        round(geometry.centroid[1] / image.height, 4),
                    ],
                    "crop": crop_box(instance.mask, image.width, image.height),
                    "rings": len(geometry.polygons),
                }
            )
        report["candidates"] = len(candidates)
        report["ms"] = round(elapsed, 1)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = Path(args.image).stem
    render = out / f"{stem}-{args.mode}.png"
    overlay(image, entries, render)
    print(json.dumps(report, indent=2), flush=True)
    print(f"overlay -> {render}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

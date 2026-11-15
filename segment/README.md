# Fork segmentation service

Standalone HTTP service that turns one video frame plus a list of thing names into the exact shape
of each named thing, so the phone app can light up the object itself instead of drawing a box
around it. It is built to run on one GPU node of Aryan's cluster, next to the FastH3 instances, and
to be exposed on a public HTTPS hostname the way `fasth3-1.aryank.xyz` already is. No ComfyUI, no
AGPL code.

Two modes:

- **Named targets** - `targets: ["red store door", "street ahead", "man in grey coat"]` - one region
  per name, for the tap targets of a beat.
- **Top objects** - omit `targets` - the K most tappable objects in the frame, unnamed, each with a
  crop box so a vision model can name them. This is the mode the generation loop uses before it
  asks the director for continuation prompts.

## The command

```bash
git clone https://github.com/aryan5v/YC-Consumerapp && cd YC-Consumerapp/segment
cp .env.example .env      # set SEGMENT_API_KEY (and HF_TOKEN if SAM 3 is approved)
./run.sh
```

`run.sh` creates the virtualenv, installs the wheels, downloads the weights, and starts uvicorn on
`0.0.0.0:8000`. It sources `.env` when that file exists and generates a key for the run when
`SEGMENT_API_KEY` is missing, printing it. Put that key in `.env` so it survives a restart.

Install [uv](https://docs.astral.sh/uv/) on the node if it is not there. With uv, `TORCH_BACKEND`
defaults to `auto` and the CUDA wheel is selected for you. Without uv, `run.sh` installs from
requirements.txt and, when `nvidia-smi` is present, reinstalls torch from `TORCH_INDEX`
(default `https://download.pytorch.org/whl/cu128`). Set `TORCH_INDEX` if the node's CUDA is older.

Then put your gateway in front of it, the same shape as the FastH3 hostnames:

```bash
# on the node, if nothing else owns 443
SEGMENT_ENGINE=auto ./run.sh
# and point seg-1.aryank.xyz at the node's public address with TLS,
# forwarding /segment, /health and /masks/ to 127.0.0.1:8000
```

`run.sh` starts uvicorn with `--proxy-headers --forwarded-allow-ips '*'`, so behind a reverse proxy
the `maskUrl` values come back on the public hostname the app already called.

## Models, and why

| Engine | What it runs | License | Gated? |
| --- | --- | --- | --- |
| `sam3` | `facebook/sam3` (or `facebook/sam3.1`) with text prompts | SAM License, Nov 19 2025: worldwide, royalty-free, no US exclusion; bars ITAR/military uses and Trade-Control targets | **Yes - manual approval per repo, per account** |
| `dino_sam2` | `IDEA-Research/grounding-dino-tiny` + `facebook/sam2.1-hiera-small` | Apache-2.0 (both) | No |
| `stub` | PNG masks from a directory, no model | n/a | n/a |

**The choice: `dino_sam2` runs today, `sam3` is one line away.** SAM 3 is the model the loop wants -
one text-promptable pass gives the mask and the score without a detection step - but its weights are
gated with *manual* approval on Hugging Face. For a same-day build that approval cannot be assumed,
so the service ships with a working Apache-2.0 pair and prefers SAM 3 automatically the moment the
account is approved:

```bash
# once https://huggingface.co/facebook/sam3 shows your account as approved:
echo 'HF_TOKEN=hf_...' >> .env
echo 'SEGMENT_SAM3_MODEL_ID=facebook/sam3.1' >> .env   # 3.1 if you want the faster one
./run.sh                                                # SEGMENT_ENGINE=auto picks sam3
```

`SEGMENT_ENGINE=auto` (the default) tries SAM 3 at startup, logs why if it cannot load, and falls
back to Grounding DINO + SAM 2.1. `GET /health` reports which engine is live. `sam3` handles the
named-target mode; the unnamed mode uses SAM 2.1's point-grid pass either way, because "find every
object" is what SAM 2.1's automatic pass is for.

## POST /segment

`Authorization: Bearer <SEGMENT_API_KEY>` is required. `GET /health` is open.

### Named targets

```bash
curl -s https://seg-1.aryank.xyz/segment \
  -H "Authorization: Bearer $SEGMENT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"frame_url":"https://fasth3-1.aryank.xyz/frames/beat3.jpg",
       "targets":["red store door","street ahead","man in grey coat"]}'
```

```json
{
  "mode": "targets",
  "results": [
    {"target": "red store door", "found": true, "score": 0.71,
     "region": {
       "centroid": {"x": 0.312, "y": 0.544},
       "polygon": [[0.28, 0.41], [0.36, 0.42], [0.35, 0.68]],
       "maskUrl": "https://seg-1.aryank.xyz/masks/9Qk2mGf1s0aB.png"
     }},
    {"target": "street ahead", "found": false, "score": 0.0, "region": null}
  ],
  "frame": {"width": 720, "height": 1280, "source": "url"},
  "engine": "dino_sam2",
  "ms": 412.6
}
```

- `centroid` is where the resting dot goes. It is the deepest point of the mask's distance
  transform, so it is always inside the silhouette - a plain centroid lands in the gap under an arch.
- `polygon` is the outline simplified to at most 200 points. One ring comes back as `[[x, y], ...]`;
  an object split into pieces comes back as `[[[x, y], ...], [[x, y], ...]]`. Normalise before use:

  ```ts
  const rings = polygon && typeof polygon[0]?.[0] === "number" ? [polygon] : polygon ?? [];
  ```

- `maskUrl` is an optional PNG alpha mask at the frame's aspect ratio (longer side capped at 1024).
  It is served without the key, from an unguessable name, and expires after `SEGMENT_MASK_TTL_S`.
- `region: null` means the app falls back to the labelled chip, exactly as the contract says.
- All coordinates are fractions of the frame, 0..1, origin top left.

### Top objects (unnamed)

```bash
curl -s https://seg-1.aryank.xyz/segment \
  -H "Authorization: Bearer $SEGMENT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"frame_url":"https://fasth3-1.aryank.xyz/frames/beat3.jpg","max_objects":8}'
```

```json
{
  "mode": "objects",
  "objects": [
    {"index": 0, "score": 0.94, "area": 0.081,
     "centroid": {"x": 0.31, "y": 0.54},
     "polygon": [[0.28, 0.41], [0.36, 0.42], [0.35, 0.68]],
     "maskUrl": "https://seg-1.aryank.xyz/masks/8fLd0PqZ.png",
     "crop": {"x": 0.27, "y": 0.39, "w": 0.12, "h": 0.31}}
  ],
  "candidates": 96,
  "frame": {"width": 720, "height": 1280, "source": "url"},
  "engine": "dino_sam2",
  "ms": 388.1
}
```

Masks that are too small to tap (`area < 0.4%`), that cover most of the frame (`area > 50%`), that
are cut off by the frame edge, or that duplicate a better mask (IoU > 0.6 or 85% contained) are
dropped before ranking. `crop` is in the same 0..1 frame fractions, sized for a small image the
vision model can look at. All thresholds are environment variables.

### Frame intake

Exactly one of `frame_url` or `frame_b64`. `frame_url` is fetched with a timeout
(`SEGMENT_FRAME_TIMEOUT_S`, default 8 s) and a byte cap (`SEGMENT_MAX_FRAME_BYTES`, default 12 MiB),
must be http(s) and must return an image content type; `frame_b64` accepts a bare base64 string or a
`data:` URL and is capped at the same byte size. Pixels are capped at `SEGMENT_MAX_IMAGE_PIXELS`
(default 40 MP). Anything else is a 400 with a readable `detail`.

## Environment variables

Required: `SEGMENT_API_KEY`.
Model: `SEGMENT_ENGINE` (`auto|sam3|dino_sam2|stub`), `SEGMENT_DEVICE` (`auto|cuda|cpu`),
`SEGMENT_SAM3_MODEL_ID`, `SEGMENT_DINO_MODEL_ID`, `SEGMENT_SAM2_MODEL_ID`, `HF_TOKEN`.
Server: `SEGMENT_HOST`, `SEGMENT_PORT`, `SEGMENT_MAX_CONCURRENCY` (1 keeps one frame on the GPU at a
time), `SEGMENT_FRAME_TIMEOUT_S`, `SEGMENT_MAX_FRAME_BYTES`, `SEGMENT_MAX_IMAGE_PIXELS`,
`SEGMENT_MAX_TARGETS`.
Quality: `SEGMENT_BOX_THRESHOLD`, `SEGMENT_TEXT_THRESHOLD`, `SEGMENT_MASK_THRESHOLD`,
`SEGMENT_MAX_BOXES_PER_TARGET`, `SEGMENT_MIN_COMPONENT_FRAC`, `SEGMENT_MAX_HOLE_FRAC`,
`SEGMENT_POLYGON_POINT_BUDGET`.
Objects: `SEGMENT_MAX_OBJECTS`, `SEGMENT_MIN_OBJECT_AREA_FRAC`, `SEGMENT_MAX_OBJECT_AREA_FRAC`,
`SEGMENT_EDGE_MARGIN_PX`, `SEGMENT_NMS_IOU`, `SEGMENT_NMS_CONTAINMENT`,
`SEGMENT_AMG_POINTS_PER_SIDE`, `SEGMENT_AMG_POINTS_PER_BATCH`.
Masks: `SEGMENT_MASK_DIR`, `SEGMENT_MASK_TTL_S`, `SEGMENT_MASK_MAX_SIDE` (0 disables mask files and
returns `maskUrl: null`), `SEGMENT_MASK_PUBLIC_BASE_URL` (empty means build URLs from the request's
own hostname).
Tests: `SEGMENT_STUB_DIR`.

Every one of them is listed with its default in `.env.example`.

## Speed

The model loads once at startup: `python -m app.weights` pulls the safetensors before uvicorn
starts, so the first request does not pay for a download. Per frame the work is one detector pass
plus one mask decode per candidate box for three targets, or one image encode plus a point-grid
decode in the objects mode. On CPU (4 cores, no GPU) a named target took 13 to 16 seconds and a 6x6 object grid took 10 seconds, so this box cannot prove the sub-second target. A modern GPU should bring both modes under a second; that number is not measured here. Time it on the node with
`curl -w '%{time_total}\n'` and the `ms` field in the response, and tune
`SEGMENT_AMG_POINTS_PER_SIDE` down (16 -> 12) if the objects mode is the slow part.

SAM 3's weight file is a few GB. Grounding DINO tiny plus SAM 2.1 small are a few hundred MB each.
Measure VRAM on the node before assuming either engine can share a GPU with FastH3.

## Tests

```bash
.venv/bin/python -m pytest tests -q          # 16 tests, no GPU, no model

# optional: two real photos (COCO val2017) for the CPU smoke test
mkdir -p tests/fixtures
for id in 000000039769 000000000632; do
  curl -sL -o "tests/fixtures/coco-$id.jpg" "http://images.cocodataset.org/val2017/$id.jpg"
done
.venv/bin/python -m scripts.smoke_cpu tests/fixtures/coco-000000039769.jpg "cat,remote control,couch"
.venv/bin/python -m scripts.smoke_cpu tests/fixtures/coco-000000039769.jpg --mode objects --max-objects 5
```

Those fixture photos are not committed (they are third-party images), which is why the fetch step
is here.

The pytest suite drives the whole HTTP surface through the stub engine (real mask files): auth,
both response shapes, mask cleaning, the inside-mask centroid, polygon budgets, the objects-mode
filters, PNG mask output, download limits and timeouts. `scripts/smoke_cpu.py` runs the real
`dino_sam2` engine on a CPU-only box and renders the polygons over the image into `renders/smoke/`.

## What to tell the Captain afterwards

1. The public base URL, for example `https://seg-1.aryank.xyz`, and that `SEGMENT_API_KEY` is set on
   the node (never the key itself).
2. The `engine` value from `GET /health`, and whether SAM 3 access was approved on Hugging Face; if
   it was not, the service is on Grounding DINO + SAM 2.1 and still returns regions.
3. The measured `ms` for a 3-target frame and for a `max_objects: 8` frame on that GPU.

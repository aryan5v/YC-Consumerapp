# Tray API contract (FastH3 Omni HTTP wrapper)

This is the contract the Convex backend speaks to the tray you host. Implement exactly this and the
backend switches from mock clips to real ones the moment you set `FASTH3_URL`.

The backend never talks to the model directly and never sees the tray's filesystem. It calls four
HTTP endpoints with JSON bodies and expects JSON back. The app streams the `mp4_url` you return, so
the mp4 (and the last frame) must be reachable from the phone.

## Configuration

Set these on the Convex deployment (`npx convex env set FASTH3_URL https://...`):

| Variable | Meaning |
| --- | --- |
| `FASTH3_URL` | Base URL of the wrapper, for example `http://tray.example.ts.net:8080`. No trailing slash needed. Unset means the backend serves stock mock clips instead. |
| `FASTH3_API_KEY` | Optional bearer token. When set, every request carries `Authorization: Bearer <key>`. |

Every request also carries `content-type: application/json`.

## POST /generate

Starts one clip job. Must return fast (a job id), not wait for the render.

Request:

```json
{
  "prompt": "<action and setting, then the style bible, then the decision-frame instruction>",
  "continuity_frame_url": "https://.../last-frame-b2.jpg",
  "character_sheet_url": "https://.../character.png",
  "style_image_url": "https://.../style.png",
  "voice_ref_url": "https://.../voice.wav",
  "seed": 913417,
  "aspect": "9:16",
  "seconds": 5
}
```

* `prompt` — already fully assembled by the backend: the director's action and setting, then the
  fixed style bible, then the closing instruction. Do not append anything to it and do not strip the
  tail. The last line is always the decision-frame instruction, because the app draws its tap targets
  on the final frame:

  > `The last second is a steady wide shot held without camera movement, with the option targets clearly visible and well separated across the frame.`

* `continuity_frame_url` — the first frame the clip should start from. This is the **last frame of the
  parent clip**, which your wrapper extracted and served. `null` for the very first clip of a run.
  When you can pin an exact first frame, pin it.
* `character_sheet_url`, `style_image_url`, `voice_ref_url` — the other three consistency anchors,
  identical for every clip in an episode. Any may be `null` if you have not set that anchor on the
  deployment; treat a missing anchor as "no reference", not as an error.
* `seed` — stable per beat, so a retry of the same beat renders the same clip.
* `aspect` — `"9:16"` for vertical. `seconds` — clip length; the backend sends 5 unless configured
  otherwise.

Response, 200:

```json
{ "job_id": "01J9Z8K5Q3" }
```

`jobId` and `id` are also accepted as the key name. Any other 2xx status is fine as long as the body
has the job id. Non-2xx (or a body without a job id) marks the clip failed, and the app shows a
progress ring that never resolves, so please return 2xx only when the job is actually queued.

## GET /jobs/:id

Polled by the backend every `TRAY_POLL_MS` (default 1200 ms), up to `TRAY_MAX_POLLS` (default 150,
about three minutes) before the clip is marked failed. Answer cheaply.

Response, 200:

```json
{
  "status": "generating",
  "mp4_url": null,
  "last_frame_url": null,
  "error": null
}
```

then, when the render finishes:

```json
{
  "status": "ready",
  "mp4_url": "https://.../clips/01J9Z8K5Q3.mp4",
  "last_frame_url": "https://.../clips/01J9Z8K5Q3-last.jpg"
}
```

* `status` — `queued` / `pending`, `generating` / `running`, `ready` / `succeeded` / `done` /
  `complete`, or `failed` / `error` are all understood. Anything unrecognised is treated as still
  generating.
* `mp4_url` — required when `ready`. Aliases accepted: `mp4Url`, `url`, `video_url`.
* `last_frame_url` — **extract the last frame of the clip and serve it.** The backend feeds it back
  as the next clip's `continuity_frame_url` and runs the detector on it. Aliases accepted:
  `lastFrameUrl`, `last_frame`, `end_frame_url`. When it is missing, the backend still plays the
  clip but skips detection, so the app falls back to labelled chips instead of glowing outlines.
* `error` — a short string, read when `status` is `failed`.

## POST /detect

Open-vocabulary detection on a decision frame. Called once per beat whose clip is ready **and** whose
beat is the one the player is watching.

Request:

```json
{
  "frame_url": "https://.../clips/01J9Z8K5Q3-last.jpg",
  "targets": ["red store door", "street ahead", "man in grey coat"]
}
```

Response, 200:

```json
{
  "boxes": {
    "red store door": { "x": 0.08, "y": 0.42, "w": 0.21, "h": 0.38 },
    "street ahead": { "x": 0.34, "y": 0.55, "w": 0.28, "h": 0.3 },
    "man in grey coat": null
  }
}
```

* Keys are the target strings from the request, verbatim. The backend maps each box back onto the
  option the player taps.
* Boxes are fractions of the frame from 0 to 1, origin top left. `w` and `h` are widths, not
  corners. The backend clamps them and drops any box with a non-positive width or height.
* `null` (or a missing key, or a box that does not parse) means "not found": the app draws a labelled
  chip for that option instead of an outline. Chips are the fallback, so never fail the whole
  request because one target is missing.
* An array shape is also accepted: `{"boxes": [{"target": "red store door", "box": {...}}, ...]}`.
* Returning `{"boxes": {}}` or an error is safe; the backend records empty boxes and the app shows
  chips.

## POST /jobs/:id/cancel

Called for the two shots the player did not take. Must be idempotent, must not fail if the job has
already finished, and should release the GPU slot. Response body is ignored; the backend does not
retry a failed cancel.

```json
{}
```

## What the backend does not do

* It never sends style or camera words of its own beyond the fixed style bible inside `prompt`.
* It never retries a failed clip. A clip that fails is marked failed and the run keeps going.
* It never queues more than one level of prefetch: three clips for a choice beat, two for a puzzle
  beat, requested in parallel at the moment the parent's clip becomes ready. Latency for three at
  once is the number that decides the whole experience.

## Mock mode (no `FASTH3_URL`)

With `FASTH3_URL` unset the backend never makes a network call:

* `POST /generate` returns `mock-<n>` after `MOCK_LATENCY_MS` (default 1200 ms).
* `GET /jobs/:id` returns `ready` on the first poll with a stock public mp4 and `last_frame_url: null`.
* `POST /detect` returns `{ "boxes": {} }`, so every option renders as a chip.
* `POST /jobs/:id/cancel` is a no-op.

That is the path the end-to-end test plays (`npm test`).

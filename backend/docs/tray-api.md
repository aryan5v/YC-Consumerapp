# Tray: FastVideo UniServe (FastH3 Omni)

The tray runs FastVideo's OpenAI-compatible video server. This document says what the backend sends
today, what it needs from you, and which part of it is a guess that one sample request will fix.

## Status

The four instances you gave are private cluster addresses:

```
http://10.244.15.110:8000  http://10.244.3.215:8000  http://10.244.18.232:8000  http://10.244.17.72:8000
```

Neither a Capy cloud machine nor a Convex action can reach those. Convex actions run on the public
internet, so the backend needs **one public base URL in front of them** (a tunnel, a proxy, or a
host that forwards to the four). Until that exists the backend stays in mock mode and everything
still plays.

## What the backend needs from you

1. **A public base URL, or several.** Set `FASTH3_URLS` to a comma-separated list — for the four
   instances behind one public entry point, one URL is enough; for four public endpoints, list all
   four and the backend spreads parallel generations across them, one child per instance where it can.
   `instanceForSeed` picks the instance from the clip's seed, so three children of one beat land on
   three different instances.
2. **The auth header, if any.** `FASTH3_API_KEY` is sent as `Authorization: Bearer <key>` on every
   request. Leave it unset if the server takes no auth.
3. **One real sample request and response** from your server for `POST /v1/videos`, plus one for
   `GET /v1/videos/{id}`. Everything in `convex/lib/trayUniserve.ts` is written from FastVideo's
   published contract (`docs/design/server_contracts/openai.md`). One captured exchange replaces the
   guesses and is a five-line change, because the HTTP call is isolated in that one file.

## What the backend sends

`POST {base}/v1/videos`:

```json
{
  "model": "fasth3",
  "task": "ref2va",
  "prompt": "<director action and setting>\n\nStyle bible: ...\n\nThe last second is a steady wide shot ...\n\nReferences: the first image reference is the protagonist; the next image reference is the visual style; the last image reference is the frame this shot starts from; the video reference is the shot immediately before this one; the audio reference is the voice the character speaks with.",
  "seconds": "5",
  "seed": 913417,
  "aspect_ratio": "9:16",
  "short_edge": 768,
  "image_reference": [
    { "image_url": "<character sheet>" },
    { "image_url": "<style image>" },
    { "image_url": "<parent last frame, when one exists>" }
  ],
  "video_reference": [{ "video_url": "<parent clip mp4>" }],
  "audio_reference": [{ "audio_url": "<voice reference>" }]
}
```

* `FASTH3_MODEL` (default `fasth3`) and `FASTH3_TASK` (default `ref2va`, set to `none` to omit the
  field and let the server infer the task from the references).
* `FASTH3_SIZE` overrides the canvas with an explicit size like `768x1360`; otherwise the backend
  sends `aspect_ratio` plus `FASTH3_SHORT_EDGE` (default 768).
* `FASTH3_NUM_FRAMES` adds an explicit `num_frames` if you want to pin the grid. It is omitted by
  default so the server resolves `seconds * fps` itself.
* The reference order above is a guess. If FastVideo's Ref2VA layout expects the first frame before
  the subject references, that is one array reorder in `buildVideoRequest`.
* The legend paragraph is appended after the style bible because reference-conditioned models need to
  know what the references are. Delete it if your prompt template already covers the references.
* **The clip prompt carries no dialogue.** Clips have ambient sound only; the character's spoken line
  is generated separately by OpenAI text to speech and played by the app over the clip.

## What the backend reads back

`GET {base}/v1/videos/{id}` is polled every `TRAY_POLL_MS` (default 1200 ms) for up to
`TRAY_MAX_POLLS` (default 150, about three minutes), and the job is looked up on the instance that
accepted it (the job id is stored as `<id>@<base>`).

| Reported `status` | The backend treats it as |
| --- | --- |
| `queued`, `pending` | queued |
| `in_progress`, anything else | generating |
| `completed`, `ready`, `succeeded` | ready, and the mp4 is fetched from `{base}/v1/videos/{id}/content` |
| `failed`, `error`, `cancelled` | failed, with `error.message` as the reason |

A ready job's `mp4_url` is `{base}/v1/videos/{id}/content` unless the response carries `mp4_url`,
`video_url`, `url` or `file_url` itself. A failed job costs one automatic retry, then the clip is
marked failed and the story continues on the other branches rather than stalling.

`DELETE {base}/v1/videos/{id}` is called for the shots the player did not take. FastVideo cannot
interrupt a launch already in flight, so cancelling frees the queue rather than the GPU second; that
is expected and the backend does not retry a failed cancel.

## Two things UniServe does not give us

1. **No last frame.** There is no frame-extraction route, so `last_frame_url` comes back null. The
   continuity anchor is therefore the **parent clip's mp4**, sent as `video_reference`, which is what
   UniServe supports (`continuation_video`). If you want the pinned-first-frame design from the plan,
   something has to extract the last frame — one `ffmpeg -sseof -0.1` sidecar is enough — and serve it
   at a public URL the server can fetch.
2. **No target detection.** Glowing outlines need a detector. Set `DETECT_URL` (and `DETECT_API_KEY`
   if it needs one) to an open-vocabulary detection service:

   ```json
   POST {DETECT_URL}   { "frame_url": "https://.../frame.jpg", "targets": ["red store door", "street ahead"] }
   -> { "boxes": { "red store door": { "x": 0.08, "y": 0.42, "w": 0.21, "h": 0.38 }, "street ahead": null } }
   ```

   Boxes are fractions of the frame, 0 to 1, origin top left; a `null` or missing box, an error, or no
   `DETECT_URL` at all simply means the app draws a labelled chip for that option. Chips are the
   fallback, never a failure.

## Mock mode

With `FASTH3_URLS` and `FASTH3_URL` both unset the client never opens a socket: `trayGenerate`
returns `mock-<n>` after `MOCK_LATENCY_MS`, `trayGetJob` returns a stock public mp4 with no last
frame, `trayDetect` returns no boxes, and `trayCancel` does nothing. That is the path the end-to-end
test plays.

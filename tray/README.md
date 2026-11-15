# Fork tray gateway

One protected URL in front of several FastH3 / UniServe instances, plus a last-frame helper.
Python 3.8+ standard library only: nothing to install, no system packages, no build step.

Two things it does:

1. **Reverse proxy.** Forward any path and any method to one of the upstreams, streaming request
   and response bodies (a 48 MB mp4 copy starts flowing immediately, nothing is buffered). The
   upstream picked is the one with the fewest requests in flight, skipping any that fail a liveness
   probe or a recent request. A job id an upstream minted stays on that upstream for later polls.
2. **`POST /gateway/last-frame`.** Send a video URL, an uploaded mp4 or a raw body, get the clip's
   last frame back as a PNG. Needs `ffmpeg` on `PATH`; returns a clear `501` without it.

Every request needs `Authorization: Bearer <GATEWAY_TOKEN>` or gets `401`. The token is never
forwarded upstream and never written to a log.

## Run it

```bash
git clone https://github.com/aryan5v/YC-Consumerapp
cd YC-Consumerapp/tray
./run.sh
```

`run.sh` starts the gateway, opens a Cloudflare quick tunnel, and prints the public URL and the two
values the Convex backend wants (`FASTH3_URLS`, `FASTH3_API_KEY`). It generates the token once and
reuses it on later runs, so Convex keeps working across restarts.

Stop it with **Ctrl-C** in that terminal. If you started it in the background:

```bash
pkill -f tray/gateway.py; pkill -f 'cloudflared tunnel'
```

Upstreams default to the four tray instances. Point it somewhere else, or skip the tunnel:

```bash
UPSTREAMS=http://10.244.15.110:8000,http://10.244.3.215:8000 ./run.sh
GATEWAY_NO_TUNNEL=1 ./run.sh          # local only, no cloudflared
CLOUDFLARED=/usr/local/bin/cloudflared ./run.sh
```

If the two endpoints are already public, skip the tunnel and put this behind the ingress you
already have — the gateway is an ordinary HTTP server.

A fresh quick tunnel takes a moment: cloudflared prints the `trycloudflare.com` URL before that
hostname resolves publicly, so a request in the first 30 to 60 seconds can fail with a DNS error.
Retry once it settles. If your resolver prefers IPv6 and the box has no IPv6 route, those first
requests can also hang until they fall back to IPv4.

## Frames only

The four instances are already public, so the proxy is optional. `/gateway/last-frame` on its own
is useful when the model server does not return a last frame:

```bash
cd tray
GATEWAY_FRAMES_ONLY=1 ./run.sh        # or: UPSTREAMS= ./run.sh
```

```bash
TOKEN=$(sed -n 's/^GATEWAY_TOKEN=//p' .gateway.env)

# from a URL
curl -sS -X POST http://127.0.0.1:8788/gateway/last-frame \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"url":"https://fasth3-1.aryank.xyz/v1/videos/<id>/content"}' -o last-frame.png

# from a file
curl -sS -X POST http://127.0.0.1:8788/gateway/last-frame \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: video/mp4' \
  --data-binary @clip.mp4 -o last-frame.png

# multipart, field name "file", also accepted
curl -sS -X POST http://127.0.0.1:8788/gateway/last-frame \
  -H "Authorization: Bearer $TOKEN" -F file=@clip.mp4 -o last-frame.png
```

`/gateway/last-frame` is `ffmpeg -sseof -0.3 -i <clip> -vf reverse -frames:v 1`, which is the true
final frame rather than an approximation, and it falls back to a full reverse or a near-end seek on
clips that will not seek. The PNG is returned as `image/png` bytes, at the source resolution. It is
`video_reference`-friendly: fetch it, store it, pass it as the continuity frame of the next clip.

For Convex to use it the endpoint has to be reachable from the internet, either through the tunnel
`run.sh` prints or through the ingress the four instances already sit behind.

## Through the tunnel

```bash
# $PUBLIC_URL and $TOKEN are printed by run.sh, and saved in tray/.gateway.env
curl -sS "$PUBLIC_URL/gateway/health" -H "Authorization: Bearer $TOKEN"
curl -sS "$PUBLIC_URL/v1/videos" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"fasth3","prompt":"a red door in the rain","seconds":"5"}'
curl -sS -X POST "$PUBLIC_URL/gateway/last-frame" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"url":"https://.../clip.mp4"}' -o last.png
```

The backend sends the same bearer token the gateway expects, so `FASTH3_API_KEY` is the gateway
token and `FASTH3_URLS` is the one public URL. Nothing else changes in the backend: the proxy is
transparent, so `POST /v1/videos`, `GET /v1/videos/{id}` and `GET /v1/videos/{id}/content` all work
through it unchanged. `FASTH3_URLS` can also be a comma-separated list; if you list the four public
instance URLs directly the backend spreads its parallel children itself, and the gateway is only
needed for the one-URL setup or for `/gateway/last-frame`.

## Endpoints

| Endpoint | What it does |
| --- | --- |
| *any path, any method* | proxied unchanged to one upstream |
| `GET /gateway/health` | every upstream's `healthy`, `selectable`, `inflight`, `requests`, `failures`, `last_error`, `last_probe_ms`, plus the probe settings |
| `POST /gateway/last-frame` | last frame as PNG; returns `501` if ffmpeg is missing, `400` for a missing or non-video input, `422` if the clip cannot be decoded |

Health says `selectable: false` for an upstream that is out of rotation, and includes `cooldown_s`,
the seconds left before it is tried again.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `UPSTREAMS` | the four tray addresses in `run.sh` | comma-separated base URLs; empty runs frames-only |
| `GATEWAY_TOKEN` | generated by `run.sh` | bearer token every request must carry |
| `GATEWAY_PORT` | `8788` | listen port |
| `GATEWAY_HOST` | `127.0.0.1` | set `0.0.0.0` to also accept LAN traffic |
| `UPSTREAM_TOKEN` | unset | sent upstream as `Authorization: Bearer <value>`; the client's own token is dropped |
| `UPSTREAM_TIMEOUT` | `900` | seconds for one upstream read or write |
| `GATEWAY_PROBE_INTERVAL` | `5` | seconds between liveness probes |
| `GATEWAY_PROBE_TIMEOUT` | `3` | probe timeout |
| `GATEWAY_PROBE_PATH` | `/` | path probed; any HTTP status counts as alive, `-` for a bare TCP connect |
| `GATEWAY_PENALTY_S` | `15` | seconds an upstream is kept out of rotation after a failed request |
| `GATEWAY_STICKY` | `1` | keep an upstream's job ids on that upstream |
| `FFMPEG` | `ffmpeg` on `PATH` | binary used by `/gateway/last-frame` |
| `GATEWAY_MAX_UPLOAD_MB` | `256` | upload and download cap for `/gateway/last-frame` |

Timeouts are generous on purpose: a generation can take tens of seconds and a poll loop can run for
minutes, so nothing is cut off early. `llm`-style clients that keep a connection open are fine.

## How health and balancing work

- **Probe.** Every `GATEWAY_PROBE_INTERVAL`, each upstream gets `GET /` (any HTTP status counts as
  alive, so a 404 is a healthy server). A connection failure or a timeout marks it down.
- **Cooldown.** A request that fails to connect or times out marks that upstream down for
  `GATEWAY_PENALTY_S` and the request is retried once on another upstream. This catches the case a
  TCP probe cannot see: a server that accepts the connection but never answers.
- **Selection.** Fewest requests in flight wins, ties go to the upstream with the fewest requests so
  far, which spreads sequential work evenly. If every upstream looks down, the least busy one is
  tried anyway rather than failing the request outright.
- **Stickiness.** A JSON response to a `POST` that carries an `id`, `job_id` or `video_id` pins that
  id to the upstream that answered. Later requests whose path contains that id go back to the same
  upstream, so `GET /v1/videos/{id}` and its `/content` land on the instance that holds the job,
  which is what UniServe needs. Set `GATEWAY_STICKY=0` to turn it off.

## Tests

```bash
python3 tests/verify.py
```

Starts three fake UniServe-shaped instances plus a dead address and a wedged address, and checks the
gateway against real HTTP: `401` handling, even spread over the live upstreams, three concurrent
requests landing on three instances, a dead upstream never being used, failover off a wedged one,
byte-identical 48 MB streaming without buffering it, 8 MB uploads with and without chunked encoding,
transparent methods/paths/query strings/headers, `DELETE` with no body, a `401` that leaves the
connection reusable for the next request, job-id stickiness, `ffmpeg` last-frame extraction compared
against an independently decoded last frame, and the token appearing neither upstream nor in the log.
30 checks, all passing as of the last run.

`run.sh` itself was checked end to end against two fake upstreams with `GATEWAY_NO_TUNNEL=1`, and in
frames-only mode: the banner values, `.gateway.env` at mode 600, a health request, a proxied `POST`,
a last-frame render, the frames-only `503` on a proxied path, and `run.sh` cleaning up the gateway
when it is signalled (17 checks).

`run.sh` was also run against a real Cloudflare quick tunnel: once the fresh hostname started
resolving (about 60 seconds, as the note above says), a proxied `POST` through the public URL
returned `201`, an unauthenticated request returned `401`, `POST /gateway/last-frame` returned a real
PNG, and repeating those requests on the reused connection returned `200` and `201` again.

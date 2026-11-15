#!/usr/bin/env python3
"""Fork tray gateway: one public, protected URL in front of N FastH3 / UniServe instances.

A transparent, least-in-flight reverse proxy with bearer-token auth and two small helpers.
Python 3.8+ standard library only, so there is nothing to install on the GPU node.

Routes
  *                          -> reverse proxied, any path and any method, bodies streamed both ways
  GET  /gateway/health       -> per-upstream state and in-flight count
  POST /gateway/last-frame   -> the last frame of a clip as a PNG (needs ffmpeg on PATH)

Environment
  UPSTREAMS              comma separated, e.g. http://10.0.0.1:8000,http://10.0.0.2:8000
                         leave it empty to run frames-only (health + last-frame only)
  GATEWAY_TOKEN          required, the bearer token every request must carry
  GATEWAY_HOST           default 127.0.0.1 (cloudflared connects from the same host)
  GATEWAY_PORT           default 8788
  UPSTREAM_TOKEN         optional, sent upstream as Authorization: Bearer <value>
  UPSTREAM_TIMEOUT       seconds for one upstream read/write, default 900
  GATEWAY_PROBE_INTERVAL seconds between liveness probes, default 5
  GATEWAY_PROBE_TIMEOUT  probe timeout, default 3
  GATEWAY_PROBE_PATH     path probed for liveness, any HTTP status counts as alive,
                         default "/" ; set to "-" for a bare TCP connect check
  GATEWAY_PENALTY_S      seconds an upstream is kept out of rotation after a failed
                         request, default 15
  GATEWAY_STICKY         default 1: keep an upstream's job ids on that upstream
  FFMPEG                 default: ffmpeg found on PATH
  GATEWAY_MAX_UPLOAD_MB  upload cap for /gateway/last-frame, default 256
"""

from __future__ import annotations

import hmac
import http.client
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CHUNK = 65536
JSON_INSPECT_MAX = 65536
DRAIN_LIMIT = 1048576
IDEMPOTENT_METHODS = ("GET", "HEAD", "OPTIONS", "DELETE", "PUT", "TRACE")
BODYLESS_STATUS = (204, 304)
PIN_LIMIT = 2000
LAST_FRAME_MAGIC = b"\x89PNG\r\n\x1a\n"

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
STRIP_REQUEST = HOP_BY_HOP | {"host", "content-length", "authorization", "expect"}


def connection_named_headers(pairs):
    """Field names listed in a Connection header are hop-by-hop too (RFC 7230 6.1)."""
    names = set()
    for name, value in pairs:
        if name.lower() != "connection":
            continue
        for token in str(value).split(","):
            token = token.strip().lower()
            if token and token not in ("close", "keep-alive"):
                names.add(token)
    return names


def env_str(name, default=None):
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def env_int(name, default):
    raw = env_str(name)
    if raw is None:
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def env_bool(name, default=True):
    raw = env_str(name)
    if raw is None:
        return default
    return raw.lower() not in ("0", "false", "no", "off")


TOKEN = env_str("GATEWAY_TOKEN")
UPSTREAM_TOKEN = env_str("UPSTREAM_TOKEN")
UPSTREAM_AUTH = env_str("UPSTREAM_AUTHORIZATION")
UPSTREAM_TIMEOUT = env_int("UPSTREAM_TIMEOUT", 900)
PROBE_INTERVAL = max(1, env_int("GATEWAY_PROBE_INTERVAL", 5))
PROBE_TIMEOUT = max(1, env_int("GATEWAY_PROBE_TIMEOUT", 3))
STICKY = env_bool("GATEWAY_STICKY", True)
BUFFER_MAX = max(0, env_int("GATEWAY_BUFFER_MAX", 65536))
PROBE_PATH = env_str("GATEWAY_PROBE_PATH", "/")
PENALTY = max(1, env_int("GATEWAY_PENALTY_S", 15))
FFMPEG = env_str("FFMPEG") or shutil.which("ffmpeg")
FFMPEG_TIMEOUT = env_int("GATEWAY_FFMPEG_TIMEOUT", 120)
URL_FETCH_TIMEOUT = env_int("GATEWAY_URL_TIMEOUT", 120)
MAX_UPLOAD = env_int("GATEWAY_MAX_UPLOAD_MB", 256) * 1024 * 1024
STICKY_ID_MIN_INT = 100000
STICKY_ID_MAX_LEN = 200
_log_lock = threading.Lock()
_started_at = time.time()


def redact(message):
    text = str(message)
    if TOKEN and TOKEN in text:
        return text.replace(TOKEN, "<redacted>")
    return text


def log(message):
    line = "%s %s\n" % (time.strftime("%H:%M:%S"), redact(message))
    with _log_lock:
        sys.stderr.write(line)
        sys.stderr.flush()


class Upstream(object):
    def __init__(self, spec):
        raw = spec.strip()
        if "://" not in raw:
            raw = "http://" + raw
        parts = urllib.parse.urlsplit(raw)
        if parts.scheme not in ("http", "https"):
            raise ValueError("unsupported scheme in upstream %r" % spec)
        if not parts.hostname:
            raise ValueError("upstream %r has no host" % spec)
        self.scheme = parts.scheme
        self.host = parts.hostname
        self.port = parts.port or (443 if parts.scheme == "https" else 80)
        self.base_path = parts.path.rstrip("/")
        if parts.query:
            raise ValueError("upstream %r must not carry a query string" % spec)
        self.url = "%s://%s:%d%s" % (self.scheme, self.host, self.port, self.base_path)
        self.healthy = True
        self.blocked_until = 0.0
        self.inflight = 0
        self.requests = 0
        self.failures = 0
        self.last_error = None
        self.last_probe_at = None
        self.last_probe_ms = None
        self.last_used_at = None
        self.last_probe_status = None

    def target(self, path, query):
        target = self.base_path + path
        if not target:
            target = "/"
        if query:
            target = target + "?" + query
        return target

    def selectable(self, now=None):
        return self.healthy and (now or time.time()) >= self.blocked_until

    def connect(self, timeout):
        if self.scheme == "https":
            return http.client.HTTPSConnection(self.host, self.port, timeout=timeout)
        return http.client.HTTPConnection(self.host, self.port, timeout=timeout)

    def state(self):
        return {
            "url": self.url,
            "healthy": self.healthy,
            "selectable": self.selectable(),
            "cooldown_s": round(max(0.0, self.blocked_until - time.time()), 1),
            "inflight": self.inflight,
            "requests": self.requests,
            "failures": self.failures,
            "last_error": self.last_error,
            "last_probe_at": self.last_probe_at,
            "last_probe_ms": self.last_probe_ms,
            "last_probe_status": self.last_probe_status,
        }


class Pool(object):
    """Least-in-flight selection over the upstreams, plus best-effort job stickiness."""

    def __init__(self, upstreams, sticky=True):
        self.upstreams = upstreams
        self.sticky = sticky
        self.lock = threading.Lock()
        self.pins = OrderedDict()

    def acquire(self, key=None, exclude=()):
        """Pick an upstream and count this request against it. Caller must release()."""
        skipped = set(exclude)
        with self.lock:
            if self.sticky and key:
                pinned = self.pins.get(key)
                if pinned:
                    for up in self.upstreams:
                        if up.url == pinned and up.url not in skipped:
                            self.pins.move_to_end(key)
                            up.inflight += 1
                            return up
            usable = [up for up in self.upstreams if up.url not in skipped]
            now = time.time()
            selectable = [up for up in usable if up.selectable(now)]
            pool = selectable or usable
            if not pool:
                return None
            best = min(pool, key=lambda up: (up.inflight, up.requests))
            best.inflight += 1
            return best

    def release(self, upstream):
        if upstream is None:
            return
        with self.lock:
            if upstream.inflight > 0:
                upstream.inflight -= 1

    def started(self, upstream):
        with self.lock:
            upstream.last_used_at = time.time()
            upstream.requests += 1

    def mark_success(self, upstream):
        with self.lock:
            upstream.healthy = True
            upstream.failures = 0
            upstream.blocked_until = 0.0
            upstream.last_error = None

    def mark_failure(self, upstream, error):
        with self.lock:
            upstream.failures += 1
            upstream.last_error = redact(error)[:300]
            upstream.healthy = False
            upstream.blocked_until = max(upstream.blocked_until, time.time() + PENALTY)

    def probe_result(self, upstream, ok, error, elapsed_ms, status=None):
        with self.lock:
            upstream.last_probe_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            upstream.last_probe_ms = elapsed_ms
            upstream.last_probe_status = status
            if ok:
                upstream.healthy = True
                upstream.last_error = None
            else:
                upstream.healthy = False
                upstream.last_error = redact(error)[:300]
                upstream.blocked_until = max(upstream.blocked_until, time.time() + PENALTY)

    def note_ids(self, ids, upstream):
        if not self.sticky or not ids:
            return
        with self.lock:
            for job_id in ids:
                self.pins[job_id] = upstream.url
                self.pins.move_to_end(job_id)
            while len(self.pins) > PIN_LIMIT:
                self.pins.popitem(last=False)

    def pin_for_path(self, path):
        if not self.sticky:
            return None
        segments = [seg for seg in path.split("/") if seg]
        if not segments:
            return None
        with self.lock:
            for seg in reversed(segments):
                for candidate in (seg, urllib.parse.unquote(seg)):
                    if candidate in self.pins:
                        return candidate
        return None

    def states(self):
        with self.lock:
            return [up.state() for up in self.upstreams]


class UpstreamFailed(Exception):
    """The upstream did not answer. `transmitted` says whether it may have seen the request."""

    def __init__(self, message, transmitted):
        Exception.__init__(self, message)
        self.transmitted = transmitted


class ClientGone(Exception):
    """The client stopped sending a request body; do not retry it anywhere."""


def usable_job_id(value):
    """Ids worth pinning: long enough, and never a bare small number that a path could collide with."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value) if value >= STICKY_ID_MIN_INT else None
    if isinstance(value, str):
        text = value.strip()
        if not 3 <= len(text) <= STICKY_ID_MAX_LEN:
            return None
        if text.isdigit() and len(text) < 6:
            return None
        return text
    return None


def extract_job_ids(raw):
    """Best-effort: ids a later request may name in its path. Never route- or vendor-specific."""
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except Exception:
        return []
    found = []

    def consider(node, depth):
        if depth > 1 or len(found) >= 8:
            return
        if isinstance(node, dict):
            for key in ("id", "job_id", "video_id"):
                job_id = usable_job_id(node.get(key))
                if job_id:
                    found.append(job_id)
            for value in node.values():
                if isinstance(value, (dict, list)):
                    consider(value, depth + 1)
        elif isinstance(node, list):
            for value in node[:5]:
                consider(value, depth + 1)

    consider(data, 0)
    return [job_id for job_id in dict.fromkeys(found)][:8]


def chain_once(first, rest):
    yield first
    for piece in rest:
        yield piece


def parse_multipart(body, boundary):
    delimiter = b"--" + boundary
    chunks = body.split(delimiter)
    parts = []
    for chunk in chunks[1:]:
        if chunk.startswith(b"--"):
            break
        chunk = chunk.lstrip(b"\r\n")
        if not chunk or chunk.startswith(b"--"):
            continue
        head, sep, data = chunk.partition(b"\r\n\r\n")
        if not sep:
            continue
        if data.endswith(b"\r\n"):
            data = data[:-2]
        name = filename = None
        match = re.search(br'name="([^"]*)"', head)
        if match:
            name = match.group(1).decode("utf-8", "replace")
        match = re.search(br'filename="([^"]*)"', head)
        if match:
            filename = match.group(1).decode("utf-8", "replace")
        parts.append((name, filename, data))
    return parts


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ForkTrayGateway/1.0"
    timeout = 900

    def log_message(self, fmt, *args):
        pass

    def log_error(self, fmt, *args):
        pass

    def dispatch(self):
        self.headers_sent = False
        self.proxied_via = None
        self.proxied_status = None
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path or "/"
        self.body_consumed = not self.has_request_body()
        started = time.time()
        try:
            if not self.authorized():
                log("%s %s -> 401 (missing or wrong gateway token)" % (self.command, path))
                self.drain_request_body()
                self.send_json(
                    401,
                    {
                        "error": "unauthorized",
                        "message": "send Authorization: Bearer <GATEWAY_TOKEN>",
                    },
                )
                return
            if path == "/gateway/health" and self.command in ("GET", "HEAD"):
                self.handle_health()
            elif path == "/gateway/last-frame" and self.command == "POST":
                self.handle_last_frame()
            else:
                self.handle_proxy(path, parsed.query)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except ClientGone as exc:
            log("%s %s: %s" % (self.command, path, exc))
            self.close_connection = True
        except Exception as exc:  # never let one request kill the worker thread silently
            log("ERROR %s %s: %s: %s" % (self.command, path, type(exc).__name__, exc))
            if not self.headers_sent:
                self.send_json(500, {"error": "gateway_error", "message": redact(exc)}, close=True)
            else:
                self.close_connection = True
        finally:
            if getattr(self, "proxied_via", None):
                log(
                    "%s %s -> %s in %dms via %s"
                    % (self.command, self.path, self.proxied_status, int((time.time() - started) * 1000),
                       self.proxied_via)
                )

    def authorized(self):
        header = self.headers.get("Authorization", "")
        parts = header.split(None, 1)
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return False
        return hmac.compare_digest(parts[1].strip(), TOKEN)

    def has_request_body(self):
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            return True
        length = self.headers.get("Content-Length")
        return bool(length and length.isdigit() and int(length) > 0)

    def drain_request_body(self):
        """Read a rejected body so the client sees our response instead of a reset.

        Returns True when the body is fully consumed, which is what makes it safe to keep
        the connection alive for the next request (a client behind a tunnel reuses it).
        """
        if not self.has_request_body():
            self.body_consumed = True
            return True
        if self.body_consumed:
            return True
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            total = 0
            for piece in self.chunked_body():
                total += len(piece)
                if total > DRAIN_LIMIT:
                    return False
            return True
        remaining = int(self.headers["Content-Length"])
        if remaining > DRAIN_LIMIT:
            return False
        while remaining > 0:
            try:
                piece = self.rfile.read(min(CHUNK, remaining))
            except (OSError, ValueError):
                return False
            if not piece:
                return False
            remaining -= len(piece)
        self.body_consumed = True
        return True

    def send_json(self, status, payload, close=None):
        body = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
        if close is None:
            # Only drop the connection when a request body is still unread; a tunneled
            # client reuses connections and a needless close shows up as a 502 there.
            close = not self.body_consumed
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if close:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.headers_sent = True
        if self.command != "HEAD":
            self.wfile.write(body)

    def handle_health(self):
        states = POOL.states()
        selectable = [state for state in states if state["selectable"]]
        payload = {
            "ok": len(states) == 0 or len(selectable) == len(states),
            "mode": "proxy" if states else "frames-only",
            "upstreams_total": len(states),
            "upstreams_selectable": len(selectable),
            "upstreams_healthy": len([state for state in states if state["healthy"]]),
            "inflight_total": sum(state["inflight"] for state in states),
            "probe_path": PROBE_PATH,
            "probe_interval_s": PROBE_INTERVAL,
            "cooldown_after_failure_s": PENALTY,
            "uptime_s": round(time.time() - _started_at, 1),
            "upstreams": states,
        }
        self.send_json(200 if payload["ok"] else 503, payload)

    def materialize_body(self):
        """(body, replayable) where body is bytes or a byte iterator, or None.

        A body that fits in GATEWAY_BUFFER_MAX is held in memory so a retried request can
        send it again. A bigger one is streamed, and then this request is never retried:
        the client's bytes have already been consumed and cannot be replayed.
        """
        if not self.has_request_body():
            self.body_consumed = True
            return None, True
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            return self.buffer_chunked_body()
        length = self.headers.get("Content-Length")
        if not length or not length.isdigit():
            return None, True
        total = int(length)
        if total <= BUFFER_MAX:
            pieces = []
            remaining = total
            while remaining > 0:
                piece = self.read_client(min(CHUNK, remaining))
                pieces.append(piece)
                remaining -= len(piece)
            self.body_consumed = True
            return b"".join(pieces), True
        return self.sized_body(total), False

    def buffer_chunked_body(self):
        pieces = []
        total = 0
        stream = self.chunked_body()
        for piece in stream:
            pieces.append(piece)
            total += len(piece)
            if total > BUFFER_MAX:
                return chain_once(b"".join(pieces), stream), False
        self.body_consumed = True
        return b"".join(pieces), True

    def read_client(self, size):
        try:
            piece = self.rfile.read(size)
        except (socket.timeout, TimeoutError):
            raise ClientGone("timeout reading request body from client")
        except OSError as exc:
            raise ClientGone("client disconnected while sending its body: %s" % exc)
        if not piece:
            raise ClientGone("client closed before sending its whole body")
        return piece

    def sized_body(self, remaining):
        while remaining > 0:
            piece = self.read_client(min(CHUNK, remaining))
            remaining -= len(piece)
            yield piece
        self.body_consumed = True

    def chunked_body(self):
        while True:
            try:
                line = self.rfile.readline(1024)
            except (socket.timeout, TimeoutError):
                raise ClientGone("timeout reading chunked body from client")
            if not line:
                raise ClientGone("client closed mid chunked body")
            size_text = line.split(b";")[0].strip()
            try:
                size = int(size_text, 16)
            except ValueError:
                raise ClientGone("malformed chunk size %r" % size_text[:32])
            if size == 0:
                while True:
                    trailer = self.rfile.readline(1024)
                    if trailer in (b"\r\n", b"\n", b""):
                        break
                self.body_consumed = True
                return
            remaining = size
            while remaining > 0:
                piece = self.rfile.read(min(CHUNK, remaining))
                if not piece:
                    raise ClientGone("client closed mid chunk")
                remaining -= len(piece)
                yield piece
            self.rfile.read(2)

    def upstream_headers(self, body):
        skip = STRIP_REQUEST | connection_named_headers(self.headers.items())
        headers = {}
        for name, value in self.headers.items():
            if name.lower() in skip:
                continue
            headers[name] = value
        if isinstance(body, bytes):
            headers["Content-Length"] = str(len(body))
        elif body is not None:
            length = self.headers.get("Content-Length")
            if length and length.isdigit():
                headers["Content-Length"] = length
        if UPSTREAM_AUTH:
            headers["Authorization"] = UPSTREAM_AUTH
        elif UPSTREAM_TOKEN:
            headers["Authorization"] = "Bearer " + UPSTREAM_TOKEN
        return headers

    def handle_proxy(self, path, query):
        key = POOL.pin_for_path(path)
        body, replayable = self.materialize_body()
        upstream = POOL.acquire(key)
        if upstream is None:
            self.drain_request_body()
            self.send_json(
                503,
                {
                    "error": "no_upstream",
                    "message": "this gateway has no UPSTREAMS configured; it serves "
                               "/gateway/health and /gateway/last-frame only",
                },
            )
            return
        tried = []
        error = None
        try:
            for attempt in (1, 2):
                tried.append(upstream.url)
                POOL.started(upstream)
                try:
                    self.forward(upstream, path, query, body)
                    return
                except ClientGone as exc:
                    # the client went away, not the upstream: nothing to retry, nothing to say
                    log("%s %s: %s" % (self.command, path, exc))
                    self.close_connection = True
                    return
                except UpstreamFailed as exc:
                    error = exc
                    POOL.mark_failure(upstream, exc)
                    # Retry when the upstream never saw the request, and otherwise only an
                    # idempotent method with a body we can send again: replaying a POST that
                    # may already have started a generation on that instance would run it twice.
                    may_retry = (not exc.transmitted) or (
                        replayable and self.command in IDEMPOTENT_METHODS
                    )
                    if not may_retry:
                        log("upstream %s failed (%s), not retrying a %s that may have been seen"
                            % (upstream.url, redact(exc), self.command))
                        break
                    log("upstream %s failed (%s), %s" % (upstream.url, redact(exc),
                                                        "failing over" if attempt == 1 else "giving up"))
                    if self.headers_sent or attempt == 2:
                        break
                    following = POOL.acquire(key, exclude=tried)
                    if following is None:
                        break
                    POOL.release(upstream)
                    upstream = following
            if self.headers_sent:
                self.close_connection = True
            else:
                self.send_json(
                    502,
                    {
                        "error": "upstream_failed",
                        "message": redact(error) if error else "upstream request failed",
                        "upstreams_tried": tried,
                    },
                )
        finally:
            POOL.release(upstream)

    def forward(self, upstream, path, query, body):
        target = upstream.target(path, query)
        headers = self.upstream_headers(body)
        self.proxied_via = upstream.url
        conn = upstream.connect(UPSTREAM_TIMEOUT)
        try:
            try:
                # Connecting first separates "this instance is unreachable", where a retry
                # cannot have any effect anywhere, from a failure after the bytes went out.
                conn.connect()
            except (OSError, http.client.HTTPException) as exc:
                raise UpstreamFailed("%s: %s" % (type(exc).__name__, exc), transmitted=False)
            try:
                conn.request(self.command, target, body=body, headers=headers)
                response = conn.getresponse()
            except ClientGone:
                raise
            except (OSError, http.client.HTTPException) as exc:
                raise UpstreamFailed("%s: %s" % (type(exc).__name__, exc), transmitted=True)
            self.relay(response, upstream)
        finally:
            conn.close()

    def read_response(self, response, size):
        """Incremental reads: read() waits for the whole buffer, read1 returns what arrived."""
        reader = getattr(response, "read1", None)
        if reader is None:
            return response.read(size)
        return reader(size)

    def relay(self, response, upstream):
        status = response.status
        try:
            reason = (response.reason or "").encode("latin-1", "ignore").decode("latin-1")
        except (AttributeError, UnicodeError):
            reason = ""
        length_header = response.getheader("Content-Length")
        length = int(length_header) if length_header and length_header.isdigit() else None
        content_type = (response.getheader("Content-Type") or "").lower()
        encoded = response.getheader("Content-Encoding") is not None
        self.proxied_status = status

        # 204, 304 and 1xx are defined to have no body: no framing, no chunk terminator, or
        # the next response on this connection starts at the wrong offset.
        bodyless = self.command == "HEAD" or status in BODYLESS_STATUS or 100 <= status < 200

        self.send_response(status, reason)
        hop_by_hop = HOP_BY_HOP | connection_named_headers(response.getheaders())
        for name, value in response.getheaders():
            low = name.lower()
            if low in hop_by_hop or low == "content-length":
                continue
            self.send_header(name, value)
        chunked_out = False
        if self.command == "HEAD":
            if length is not None:
                self.send_header("Content-Length", str(length))
        elif bodyless:
            pass
        elif length is not None:
            self.send_header("Content-Length", str(length))
        elif self.request_version == "HTTP/1.1":
            chunked_out = True
            self.send_header("Transfer-Encoding", "chunked")
        else:
            self.close_connection = True
        self.end_headers()
        self.headers_sent = True
        POOL.mark_success(upstream)

        if bodyless:
            return

        inspect = STICKY and "json" in content_type and not encoded and self.command == "POST"
        buffered = b""
        complete = False
        if inspect:
            while len(buffered) < JSON_INSPECT_MAX:
                piece = self.read_response(response, min(CHUNK, JSON_INSPECT_MAX - len(buffered)))
                if not piece:
                    complete = True
                    break
                buffered += piece
            if complete and status < 400:
                POOL.note_ids(extract_job_ids(buffered), upstream)
        relayed = 0
        try:
            if buffered:
                self.write_chunk(buffered, chunked_out)
                relayed += len(buffered)
            while True:
                piece = self.read_response(response, CHUNK)
                if not piece:
                    break
                self.write_chunk(piece, chunked_out)
                relayed += len(piece)
            if chunked_out:
                self.wfile.write(b"0\r\n\r\n")
            if length is not None and relayed < length:
                # The upstream declared more than it sent: the client already has a
                # Content-Length it will never satisfy, so close rather than reuse.
                POOL.mark_failure(upstream, "short response: %d of %d bytes" % (relayed, length))
                self.close_connection = True
                self.proxied_status = "%s (truncated after %d of %d bytes)" % (status, relayed, length)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except (OSError, http.client.HTTPException) as exc:
            POOL.mark_failure(upstream, "stream interrupted: %s" % exc)
            self.close_connection = True
            raise

    def write_chunk(self, piece, chunked_out):
        if chunked_out:
            self.wfile.write(b"%X\r\n" % len(piece))
            self.wfile.write(piece)
            self.wfile.write(b"\r\n")
        else:
            self.wfile.write(piece)

    def handle_last_frame(self):
        if not FFMPEG or not os.path.exists(FFMPEG):
            self.drain_request_body()
            self.send_json(
                501,
                {
                    "error": "ffmpeg_missing",
                    "message": "the gateway cannot extract frames: ffmpeg was not found on PATH "
                               "(install it on the tray node, or point FFMPEG at the binary)",
                },
            )
            return
        body = b""
        if self.has_request_body():
            if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
                pieces = []
                total = 0
                for piece in self.chunked_body():
                    total += len(piece)
                    if total > MAX_UPLOAD:
                        self.send_json(413, {"error": "too_large",
                                             "message": "body over GATEWAY_MAX_UPLOAD_MB"})
                        return
                    pieces.append(piece)
                body = b"".join(pieces)
            else:
                size = int(self.headers["Content-Length"])
                if size > MAX_UPLOAD:
                    self.send_json(413, {"error": "too_large",
                                         "message": "body over GATEWAY_MAX_UPLOAD_MB"})
                    return
                remaining = size
                complete = True
                while remaining > 0:
                    piece = self.rfile.read(min(CHUNK, remaining))
                    if not piece:
                        complete = False
                        break
                    remaining -= len(piece)
                    body += piece
                self.body_consumed = complete

        source_url = None
        raw_video = None
        content_type = (self.headers.get("Content-Type") or "").lower()
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        if "url" in query and query["url"]:
            source_url = query["url"][0].strip()
        elif body:
            if "json" in content_type:
                try:
                    payload = json.loads(body.decode("utf-8", "replace"))
                except ValueError as exc:
                    self.send_json(400, {"error": "bad_json", "message": str(exc)})
                    return
                if isinstance(payload, dict):
                    for key in ("url", "video_url", "video"):
                        if isinstance(payload.get(key), str) and payload[key].strip():
                            source_url = payload[key].strip()
                            break
                    else:
                        if isinstance(payload.get("data"), str) and payload["data"].strip():
                            raw_video = decode_base64_loose(payload["data"])
            elif "multipart/form-data" in content_type:
                match = re.search(r'boundary="?([^";]+)"?', self.headers.get("Content-Type", ""))
                if not match:
                    self.send_json(400, {"error": "bad_multipart", "message": "no boundary in Content-Type"})
                    return
                parts = parse_multipart(body, match.group(1).encode("ascii", "ignore"))
                if not parts:
                    self.send_json(400, {"error": "bad_multipart", "message": "no part found"})
                    return
                chosen = None
                for name, filename, data in parts:
                    if filename or name in ("file", "video", "mp4", "clip", "data"):
                        chosen = data
                        break
                if chosen is None:
                    chosen = parts[-1][2]
                raw_video = chosen
            else:
                raw_video = body

        if source_url is not None:
            # Only fetch something remote: without this a file: URL makes the gateway read a
            # file off its own host and hand back a picture of it.
            url_parts = urllib.parse.urlsplit(source_url)
            if url_parts.scheme.lower() not in ("http", "https") or not url_parts.netloc:
                self.send_json(
                    400,
                    {
                        "error": "bad_url",
                        "message": "url must be an http:// or https:// address",
                    },
                )
                return

        if source_url is None and not raw_video:
            self.send_json(
                400,
                {
                    "error": "no_input",
                    "message": "send a JSON body {\"url\": \"https://.../clip.mp4\"}, a multipart/form-data "
                               "file, a raw video body, or ?url=...",
                },
            )
            return

        try:
            png = last_frame_png(source_url, raw_video)
        except LastFrameError as exc:
            self.send_json(exc.status, {"error": exc.code, "message": exc.message})
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.headers_sent = True
        self.wfile.write(png)


def decode_base64_loose(text):
    import base64

    data = text.split(",", 1)[-1] if text.startswith("data:") else text
    try:
        return base64.b64decode(data, validate=False)
    except Exception:
        return None


class LastFrameError(Exception):
    def __init__(self, status, code, message):
        Exception.__init__(self, message)
        self.status = status
        self.code = code
        self.message = redact(message)


def run_ffmpeg(args, timeout=None):
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error"] + args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout or FFMPEG_TIMEOUT,
    )
    return proc


def last_frame_png(source_url, raw_video):
    """Return the last frame of a clip as PNG bytes, exactly one image."""
    workdir = tempfile.mkdtemp(prefix="fork-tray-frame-")
    try:
        if raw_video:
            path = os.path.join(workdir, "input.mp4")
            with open(path, "wb") as handle:
                handle.write(raw_video)
            png = extract_last_frame(path)
            if png:
                return png
            raise LastFrameError(422, "decode_failed", "ffmpeg could not decode the uploaded video")
        path = source_url
        png, error = try_extract(source_url)
        if png:
            return png
        local = os.path.join(workdir, "input.mp4")
        try:
            download(source_url, local)
        except Exception as exc:
            raise LastFrameError(502, "fetch_failed", "could not download %s: %s" % (source_url, exc))
        png = extract_last_frame(local)
        if png:
            return png
        raise LastFrameError(422, "decode_failed", "ffmpeg could not decode %s (%s)" % (source_url, error))
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def try_extract(source):
    try:
        return extract_last_frame(source), None
    except LastFrameError as exc:
        return None, exc.message


def extract_last_frame(source):
    """The true last frame, PNG encoded. Tries the cheap accurate path first."""
    attempts = [
        # Seek to the tail and reverse what is left: exactly the final frame, bounded decode.
        ["-sseof", "-0.3", "-i", source, "-vf", "reverse", "-frames:v", "1"],
        # A clip too short (or a container that will not seek): reverse the whole stream.
        ["-i", source, "-vf", "reverse", "-frames:v", "1"],
        # Last resort when the build has no `reverse` filter: near the end, one frame.
        ["-sseof", "-0.1", "-i", source, "-frames:v", "1"],
    ]
    errors = []
    for args in attempts:
        full = args + ["-an", "-sn", "-f", "image2pipe", "-vcodec", "png", "-"]
        try:
            proc = run_ffmpeg(full)
        except subprocess.TimeoutExpired:
            raise LastFrameError(504, "ffmpeg_timeout", "ffmpeg did not finish within %ds" % FFMPEG_TIMEOUT)
        if proc.returncode == 0 and proc.stdout.startswith(LAST_FRAME_MAGIC):
            return proc.stdout
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-2:]
        errors.append(" | ".join(tail))
    raise LastFrameError(422, "decode_failed", "ffmpeg could not extract a frame: " + " ;; ".join(errors))


def download(url, path):
    request = urllib.request.Request(url, headers={"User-Agent": "fork-tray-gateway/1.0"})
    with urllib.request.urlopen(request, timeout=URL_FETCH_TIMEOUT) as response:
        with open(path, "wb") as handle:
            total = 0
            while True:
                piece = response.read(CHUNK)
                if not piece:
                    break
                total += len(piece)
                if total > MAX_UPLOAD:
                    raise ValueError("video over GATEWAY_MAX_UPLOAD_MB")
                handle.write(piece)


def probe_loop():
    while True:
        for upstream in POOL.upstreams:
            started = time.time()
            status = None
            try:
                if PROBE_PATH == "-":
                    connection = upstream.connect(PROBE_TIMEOUT)
                    connection.connect()
                    connection.close()
                else:
                    headers = {"User-Agent": "fork-tray-gateway-probe/1.0", "Accept": "*/*"}
                    if UPSTREAM_AUTH:
                        headers["Authorization"] = UPSTREAM_AUTH
                    elif UPSTREAM_TOKEN:
                        headers["Authorization"] = "Bearer " + UPSTREAM_TOKEN
                    connection = upstream.connect(PROBE_TIMEOUT)
                    try:
                        connection.request("GET", PROBE_PATH, headers=headers)
                        response = connection.getresponse()
                        status = response.status
                        response.read(256)
                    finally:
                        connection.close()
                POOL.probe_result(upstream, True, None, round((time.time() - started) * 1000, 1), status)
            except Exception as exc:
                POOL.probe_result(
                    upstream,
                    False,
                    "%s: %s" % (type(exc).__name__, exc),
                    round((time.time() - started) * 1000, 1),
                    status,
                )
        time.sleep(PROBE_INTERVAL)


def build_pool():
    raw = env_str("UPSTREAMS")
    upstreams = []
    for spec in (raw or "").split(","):
        if spec.strip():
            upstreams.append(Upstream(spec))
    if not upstreams:
        sys.stderr.write("UPSTREAMS is empty: running frames-only "
                         "(GET /gateway/health and POST /gateway/last-frame only). "
                         "Set UPSTREAMS=http://host:8000,... to also proxy.\n")
    return Pool(upstreams, sticky=STICKY)


def main():
    global POOL
    if not TOKEN:
        sys.stderr.write("GATEWAY_TOKEN is required (run.sh generates one for you)\n")
        raise SystemExit(2)
    POOL = build_pool()
    host = env_str("GATEWAY_HOST", "127.0.0.1")
    port = env_int("GATEWAY_PORT", env_int("PORT", 8788))
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    threading.Thread(target=probe_loop, daemon=True).start()
    log("fork tray gateway listening on http://%s:%d" % (host, port))
    if POOL.upstreams:
        log("upstreams: %s" % ", ".join(up.url for up in POOL.upstreams))
    else:
        log("mode: frames-only (no UPSTREAMS)")
    log("token: required in the Authorization header, value never logged (%d chars)" % len(TOKEN))
    log("ffmpeg: %s" % (FFMPEG or "not found (POST /gateway/last-frame returns 501)"))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


POOL = None

for _method in ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
    setattr(Handler, "do_" + _method, Handler.dispatch)

if __name__ == "__main__":
    main()

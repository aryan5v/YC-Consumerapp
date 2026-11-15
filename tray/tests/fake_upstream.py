#!/usr/bin/env python3
"""A fake FastH3 / UniServe instance for verifying the gateway locally.

Nothing here talks to the real cluster. Standard library only.

  python3 fake_upstream.py --name A --port 9001 --control-port 9101 [--blob path] [--blackhole]

Main port: a small UniServe-shaped surface plus a generic echo and /slow.
Control port (never proxied): GET /state returns what this instance saw, so the
tests can prove balancing, stickiness and that no Authorization header arrived.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CHUNK = 65536
STATE_LOCK = threading.Lock()


def pseudo_bytes(seed, size):
    """Deterministic filler bytes that work on python 3.8 (no random.randbytes)."""
    out = bytearray()
    block = hashlib.sha256(seed.encode("ascii")).digest()
    while len(out) < size:
        out += block
        block = hashlib.sha256(block).digest()
    return bytes(out[:size])


class State(object):
    def __init__(self, name, blob=None, big=b""):
        self.name = name
        self.blob = blob
        self.big = big
        self.requests = []
        self.by_path = {}
        self.ids_served = []
        self.authorization_seen = False
        self.header_names = set()
        self.sequence = 0
        self.started = time.time()

    def record(self, method, path, query, headers, body_len, body_sha, chunked):
        with STATE_LOCK:
            self.sequence += 1
            entry = {
                "n": self.sequence,
                "method": method,
                "path": path,
                "query": query,
                "body_len": body_len,
                "body_sha256": body_sha,
                "chunked": chunked,
                "at": time.time() - self.started,
            }
            self.requests.append(entry)
            self.by_path[method + " " + path] = self.by_path.get(method + " " + path, 0) + 1
            self.header_names.update(name.lower() for name in headers.keys())
            if "authorization" in self.header_names:
                self.authorization_seen = True
            return entry

    def snapshot(self):
        with STATE_LOCK:
            return {
                "name": self.name,
                "requests": len(self.requests),
                "by_path": dict(self.by_path),
                "ids_served": list(self.ids_served),
                "authorization_seen": self.authorization_seen,
                "header_names": sorted(self.header_names),
                "log": list(self.requests),
                "uptime_s": round(time.time() - self.started, 2),
            }


class FakeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "FakeUniServe/1.0"

    def log_message(self, fmt, *args):
        pass

    def _read_body(self):
        encoding = (self.headers.get("Transfer-Encoding") or "").lower()
        chunked = "chunked" in encoding
        body = b""
        if chunked:
            while True:
                line = self.rfile.readline(1024)
                size = int(line.split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    self.rfile.readline(1024)
                    break
                body += self.rfile.read(size)
                self.rfile.read(2)
        else:
            length = int(self.headers.get("Content-Length") or 0)
            remaining = length
            while remaining > 0:
                piece = self.rfile.read(min(CHUNK, remaining))
                if not piece:
                    break
                body += piece
                remaining -= len(piece)
        return body, chunked

    def _json(self, status, payload):
        raw = (json.dumps(payload) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw)

    def handle_any(self):
        body, chunked = self._read_body()
        path = self.path.split("?")[0]
        query = self.path.split("?", 1)[1] if "?" in self.path else ""
        entry = STATE.record(
            self.command,
            path,
            query,
            self.headers,
            len(body),
            hashlib.sha256(body).hexdigest(),
            chunked,
        )
        if path == "/slow":
            params = dict(pair.split("=", 1) for pair in query.split("&") if "=" in pair)
            time.sleep(min(float(params.get("ms", "1000")) / 1000.0, 30.0))
            return self._json(200, {"instance": STATE.name, "slept": True, "n": entry["n"]})
        if self.command == "POST" and path == "/v1/videos":
            with STATE_LOCK:
                job_id = "%s-%d" % (STATE.name, STATE.sequence)
                STATE.ids_served.append(job_id)
            return self._json(201, {"id": job_id, "status": "queued", "instance": STATE.name})
        if self.command == "GET" and path.startswith("/v1/videos/") and path.endswith("/content"):
            return self._blob()
        if path == "/big/content":
            return self._send(STATE.big, "video/mp4")
        if self.command == "GET" and path.startswith("/v1/videos/"):
            job_id = path.split("/v1/videos/", 1)[1]
            return self._json(
                200,
                {
                    "id": job_id,
                    "status": "completed",
                    "instance": STATE.name,
                    "mp4_url": "http://%s:%d/v1/videos/%s/content" % (HOST, PORT, job_id),
                },
            )
        return self._json(
            200,
            {
                "instance": STATE.name,
                "method": self.command,
                "path": path,
                "query": query,
                "body_len": len(body),
                "body_sha256": hashlib.sha256(body).hexdigest(),
                "body_head": body[:64].decode("utf-8", "replace"),
                "header_names": sorted(name.lower() for name in self.headers.keys()),
                "chunked": chunked,
            },
        )

    def _blob(self):
        blob = STATE.blob
        if blob is None:
            return self._json(404, {"error": "no blob configured"})
        return self._send(blob, "video/mp4")

    def _send(self, blob, content_type):
        size = len(blob)
        start, end = 0, size - 1
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            spec = range_header.split("=", 1)[1]
            first, _, last = spec.partition("-")
            start = int(first) if first else 0
            end = int(last) if last else size - 1
            end = min(end, size - 1)
        length = end - start + 1
        self.send_response(206 if range_header else 200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        if range_header:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        if self.command == "HEAD":
            return
        offset = start
        remaining = length
        while remaining > 0:
            piece = blob[offset:offset + min(CHUNK, remaining)]
            self.wfile.write(piece)
            offset += len(piece)
            remaining -= len(piece)

    do_GET = handle_any
    do_POST = handle_any
    do_PUT = handle_any
    do_PATCH = handle_any
    do_DELETE = handle_any
    do_HEAD = handle_any


class ControlHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        payload = STATE.snapshot()
        raw = (json.dumps(payload) + "\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path == "/reset":
            with STATE_LOCK:
                STATE.requests = []
                STATE.by_path = {}
                STATE.ids_served = []
                STATE.authorization_seen = False
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()


STATE = None
HOST = "127.0.0.1"
PORT = 0


def blackhole(port, stop):
    """Accept connections and never answer: a host that is up but wedged."""
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", port))
    listener.listen(128)
    listener.settimeout(0.5)
    held = []
    while not stop.is_set():
        try:
            conn, _ = listener.accept()
            held.append(conn)
        except socket.timeout:
            continue
        except OSError:
            break


def main():
    global STATE, PORT
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--control-port", type=int, required=True)
    parser.add_argument("--blob")
    parser.add_argument("--big-size", type=int, default=0)
    parser.add_argument("--blackhole", action="store_true")
    args = parser.parse_args()
    PORT = args.port
    stop = threading.Event()
    if args.blackhole:
        blackhole(args.port, stop)
        return
    blob = None
    if args.blob:
        with open(args.blob, "rb") as handle:
            blob = handle.read()
    big = pseudo_bytes("fork-tray-verify", args.big_size) if args.big_size else b""
    STATE = State(args.name, blob, big)
    control = ThreadingHTTPServer(("127.0.0.1", args.control_port), ControlHandler)
    control.daemon_threads = True
    threading.Thread(target=control.serve_forever, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), FakeHandler)
    server.daemon_threads = True
    print("fake %s on %d (control %d)" % (args.name, args.port, args.control_port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

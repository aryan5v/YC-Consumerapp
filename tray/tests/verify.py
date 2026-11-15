#!/usr/bin/env python3
"""End-to-end verification of the tray gateway against fake upstreams.

Starts three fake UniServe-shaped instances plus one dead address and one wedged
address, puts gateways in front of them, and checks auth, balancing, failover,
streaming, stickiness and last-frame extraction. Nothing here touches the real cluster.

  python3 tests/verify.py
"""

from __future__ import annotations

import hashlib
import http.client
import json
import os
import random
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GATEWAY = os.path.join(ROOT, "gateway.py")
FAKE = os.path.join(ROOT, "tests", "fake_upstream.py")
TOKEN = "tray-" + secrets.token_hex(12)
BIG_BYTES = 48 * 1024 * 1024
UPLOAD_BYTES = 8 * 1024 * 1024

RESULTS = []
SPAWNED = []
WORKDIR = tempfile.mkdtemp(prefix="fork-tray-verify-")


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    mark = "PASS" if ok else "FAIL"
    print("%-4s %-34s %s" % (mark, name, detail), flush=True)
    return bool(ok)


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def wait_port(port, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.05)
    return False


def spawn(name, args, env=None):
    log_path = os.path.join(WORKDIR, name + ".log")
    handle = open(log_path, "wb")
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    proc = subprocess.Popen(
        [sys.executable] + args, stdout=handle, stderr=subprocess.STDOUT, env=full_env
    )
    SPAWNED.append(proc)
    return proc, log_path


def call(method, url, body=None, headers=None, token=None, timeout=60):
    parsed = urllib.parse.urlsplit(url)
    target = parsed.path or "/"
    if parsed.query:
        target += "?" + parsed.query
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=timeout)
    sent = dict(headers or {})
    if token is not None:
        sent["Authorization"] = "Bearer " + token
    try:
        conn.request(method, target, body=body, headers=sent)
        response = conn.getresponse()
        data = response.read()
        return {
            "status": response.status,
            "headers": {k.lower(): v for k, v in response.getheaders()},
            "body": data,
            "json": json_or_none(data),
        }
    finally:
        conn.close()


def call_chunked(method, url, body, headers=None, token=None, timeout=120):
    parsed = urllib.parse.urlsplit(url)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=timeout)
    try:
        conn.putrequest(method, parsed.path)
        for key, value in (headers or {}).items():
            conn.putheader(key, value)
        if token is not None:
            conn.putheader("Authorization", "Bearer " + token)
        conn.putheader("Transfer-Encoding", "chunked")
        conn.endheaders()
        for offset in range(0, len(body), 65536):
            piece = body[offset:offset + 65536]
            conn.send(("%X\r\n" % len(piece)).encode("ascii") + piece + b"\r\n")
        conn.send(b"0\r\n\r\n")
        response = conn.getresponse()
        data = response.read()
        return {"status": response.status, "headers": dict(response.getheaders()), "body": data,
                "json": json_or_none(data)}
    finally:
        conn.close()


def json_or_none(data):
    try:
        return json.loads(data.decode("utf-8"))
    except Exception:
        return None


def health(port):
    return call("GET", "http://127.0.0.1:%d/gateway/health" % port, token=TOKEN)


def control(port):
    return call("GET", "http://127.0.0.1:%d/state" % port)["json"]


def rss_kb(pid):
    with open("/proc/%d/status" % pid) as handle:
        for line in handle:
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    return 0


def ffmpeg_bin():
    return shutil.which("ffmpeg")


def frame_hash(png_bytes):
    """sha256 of a PNG decoded to raw RGB, so re-encoding cannot fool the comparison."""
    proc = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        input=png_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-400:])
    return hashlib.sha256(proc.stdout).hexdigest()


def true_last_frame_hash(path, dimensions):
    """Decode every frame independently and hash the final one."""
    width, height = dimensions
    proc = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-i", path,
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    frame_size = width * height * 3
    raw = proc.stdout
    return hashlib.sha256(raw[-frame_size:]).hexdigest(), len(raw) // frame_size


def png_size(data):
    return (int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big"))


def main():
    if not ffmpeg_bin():
        print("ffmpeg is required to run this suite")
        return 1
    mp4 = os.path.join(WORKDIR, "clip.mp4")
    subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-f", "lavfi",
         "-i", "testsrc=size=320x180:rate=30:duration=2", "-pix_fmt", "yuv420p",
         "-c:v", "libx264", mp4],
        check=True,
    )
    ref_hash, ref_frames = true_last_frame_hash(mp4, (320, 180))
    print("reference: %d frames, last frame sha256(rgb24)=%s" % (ref_frames, ref_hash[:16]), flush=True)
    upload_body = random.Random(7).randbytes(UPLOAD_BYTES)

    ports = {name: free_port() for name in ("A", "B", "C", "D", "BH")}
    cports = {name: free_port() for name in ("A", "B", "C")}
    try:
        for name in ("A", "B", "C"):
            args = [FAKE, "--name", name, "--port", str(ports[name]),
                    "--control-port", str(cports[name]), "--blob", mp4,
                    "--big-size", str(BIG_BYTES)]
            spawn("fake" + name, args)
        spawn("fakeBH", [FAKE, "--name", "BH", "--port", str(ports["BH"]),
                         "--control-port", str(free_port()), "--blackhole"])
        for name in ("A", "B", "C", "BH"):
            if not wait_port(ports[name]):
                print("fake %s did not start" % name)
                return 1

        upstreams = ",".join("http://127.0.0.1:%d" % ports[n] for n in ("A", "B", "C", "D"))
        g1_port = free_port()
        g1, g1_log = spawn(
            "gateway1",
            [GATEWAY],
            {
                "UPSTREAMS": upstreams,
                "GATEWAY_TOKEN": TOKEN,
                "GATEWAY_PORT": str(g1_port),
                "GATEWAY_PROBE_INTERVAL": "2",
                "GATEWAY_PENALTY_S": "6",
                "UPSTREAM_TIMEOUT": "60",
            },
        )
        if not wait_port(g1_port):
            print("gateway did not start")
            return 1
        base = "http://127.0.0.1:%d" % g1_port

        # ---- auth -------------------------------------------------------------
        check("401 without a token", call("GET", base + "/gateway/health")["status"] == 401)
        check("401 with a wrong token",
              call("GET", base + "/gateway/health", token="nope")["status"] == 401)
        check("401 on a proxied path",
              call("POST", base + "/v1/videos", body=b"{}",
                   headers={"Content-Type": "application/json"})["status"] == 401)
        check("no upstream reached while unauthorized",
              sum(1 for name in ("A", "B", "C")
                  for entry in control(cports[name])["log"]
                  if entry["path"] == "/v1/videos") == 0)

        # ---- wait for the dead address to be probed out -----------------------
        deadline = time.time() + 15
        dead = None
        while time.time() < deadline:
            states = health(g1_port)["json"]["upstreams"]
            dead = [s for s in states if str(ports["D"]) in s["url"]][0]
            if not dead["selectable"]:
                break
            time.sleep(0.2)
        check("dead upstream probed unhealthy", dead["selectable"] is False,
              "last_error=%s" % (dead["last_error"] or "")[:50])

        # ---- balancing, from a clean state -----------------------------------
        for name in ("A", "B", "C"):
            call("POST", "http://127.0.0.1:%d/reset" % cports[name])
        codes = []
        for _ in range(12):
            response = call("POST", base + "/v1/videos?beat=b1",
                            body=b'{"model":"fasth3","prompt":"a door"}',
                            headers={"Content-Type": "application/json"}, token=TOKEN)
            codes.append(response["status"])
        counts = {name: control(cports[name])["requests"] for name in ("A", "B", "C")}
        check("12 requests spread evenly over the live ones",
              all(code == 201 for code in codes) and set(counts.values()) == {4},
              json.dumps(counts))
        check("dead upstream received nothing",
              [s for s in health(g1_port)["json"]["upstreams"] if str(ports["D"]) in s["url"]][0]["requests"] == 0)

        # ---- in-flight balancing ---------------------------------------------
        barrier = threading.Barrier(3)
        slow = {}

        def slow_call(slot):
            barrier.wait()
            response = call("GET", base + "/slow?ms=1500", token=TOKEN, timeout=30)
            slow[slot] = response["json"]["instance"] if response["json"] else None

        threads = [threading.Thread(target=slow_call, args=(i,)) for i in range(3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        check("3 concurrent requests land on 3 instances",
              len(set(slow.values())) == 3 and None not in slow.values(), json.dumps(slow))

        # ---- transparent paths and methods -----------------------------------
        echo = call("PUT", base + "/anything/at/all/deep?q=1&z=2", body=b"abc",
                    headers={"Content-Type": "text/plain", "X-Custom": "kept"}, token=TOKEN)
        payload = echo["json"] or {}
        check("method, path and query pass through unchanged",
              echo["status"] == 200 and payload.get("method") == "PUT"
              and payload.get("path") == "/anything/at/all/deep" and payload.get("query") == "q=1&z=2",
              json.dumps({k: payload.get(k) for k in ("method", "path", "query")}))
        check("client headers pass through",
              "x-custom" in payload.get("header_names", []))
        check("a non-control /gateway path is proxied, not swallowed",
              (call("GET", base + "/gateway/other", token=TOKEN)["json"] or {}).get("path") == "/gateway/other")
        del_response = call("DELETE", base + "/v1/videos/A-1", token=TOKEN)
        check("DELETE with no body passes through", del_response["status"] == 200)

        # ---- stickiness -------------------------------------------------------
        created = call("POST", base + "/v1/videos", body=b'{"prompt":"x"}',
                       headers={"Content-Type": "application/json"}, token=TOKEN)["json"]
        job_id = created["id"]
        home = created["instance"]
        for name in ("A", "B", "C"):
            call("POST", "http://127.0.0.1:%d/reset" % cports[name])
        seen = set()
        for _ in range(5):
            polled = call("GET", base + "/v1/videos/" + job_id, token=TOKEN)["json"]
            seen.add(polled["instance"])
        served = {name: sum(1 for entry in control(cports[name])["log"]
                            if entry["path"] == "/v1/videos/" + job_id)
                  for name in ("A", "B", "C")}
        check("a job id stays on the instance that minted it",
              seen == {home} and served[home] == 5 and sum(served.values()) == 5,
              "created on %s, polls %s" % (home, json.dumps(served)))

        # ---- large streamed response -----------------------------------------
        before = rss_kb(g1.pid)
        streamed = call("GET", base + "/big/content", token=TOKEN, timeout=180)
        after = rss_kb(g1.pid)
        direct = call("GET", "http://127.0.0.1:%d/big/content" % ports["A"], timeout=180)
        check("48 MB response arrives byte for byte",
              streamed["status"] == 200 and len(streamed["body"]) == BIG_BYTES
              and hashlib.sha256(streamed["body"]).digest() == hashlib.sha256(direct["body"]).digest(),
              "%d bytes" % len(streamed["body"]))
        check("the gateway streamed it instead of buffering it",
              (after - before) < 24 * 1024,
              "rss %dMB -> %dMB" % (before // 1024, after // 1024))
        check("large body validity survives a Range request",
              call("GET", base + "/big/content", headers={"Range": "bytes=0-1023"}, token=TOKEN)["status"] == 206)

        upload = call("PUT", base + "/upload/fixed", body=upload_body,
                      headers={"Content-Type": "application/octet-stream"}, token=TOKEN, timeout=180)
        sent_sha = hashlib.sha256(upload_body).hexdigest()
        check("8 MB request body streamed upstream intact",
              upload["json"]["body_len"] == UPLOAD_BYTES and upload["json"]["body_sha256"] == sent_sha,
              "upstream saw %d bytes" % upload["json"]["body_len"])
        chunked = call_chunked("PUT", base + "/upload/chunked", upload_body,
                               headers={"Content-Type": "application/octet-stream"}, token=TOKEN)
        check("chunked request body forwarded intact",
              chunked["json"]["body_len"] == UPLOAD_BYTES
              and chunked["json"]["body_sha256"] == sent_sha
              and chunked["json"]["chunked"] is True)

        # ---- last frame -------------------------------------------------------
        with open(mp4, "rb") as handle:
            clip = handle.read()
        uploaded = call("POST", base + "/gateway/last-frame", body=clip,
                        headers={"Content-Type": "video/mp4"}, token=TOKEN)
        check("last frame from a raw upload is a PNG", uploaded["status"] == 200
              and uploaded["body"][:8] == b"\x89PNG\r\n\x1a\n"
              and uploaded["headers"]["content-type"] == "image/png")
        check("uploaded last frame is the true last frame",
              uploaded["status"] == 200 and png_size(uploaded["body"]) == (320, 180)
              and frame_hash(uploaded["body"]) == ref_hash,
              "png %sx%s vs source 320x180" % png_size(uploaded["body"]))

        boundary = "----forktray" + secrets.token_hex(6)
        multipart = (
            ("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"clip.mp4\"\r\n"
             "Content-Type: video/mp4\r\n\r\n" % boundary).encode()
            + clip + ("\r\n--%s--\r\n" % boundary).encode()
        )
        from_file = call("POST", base + "/gateway/last-frame", body=multipart,
                         headers={"Content-Type": "multipart/form-data; boundary=" + boundary}, token=TOKEN)
        check("last frame from a multipart upload matches",
              from_file["status"] == 200 and frame_hash(from_file["body"]) == ref_hash)
        url_frame = call("POST", base + "/gateway/last-frame",
                         body=json.dumps({"url": "http://127.0.0.1:%d/v1/videos/A-9/content" % ports["A"]}).encode(),
                         headers={"Content-Type": "application/json"}, token=TOKEN, timeout=120)
        check("last frame from a video URL matches",
              url_frame["status"] == 200 and frame_hash(url_frame["body"]) == ref_hash,
              url_frame["json"] if url_frame["json"] else "")

        # ---- no ffmpeg --------------------------------------------------------
        g3_port = free_port()
        spawn("gateway3", [GATEWAY],
              {"UPSTREAMS": upstreams, "GATEWAY_TOKEN": TOKEN, "GATEWAY_PORT": str(g3_port),
               "FFMPEG": "/nonexistent/ffmpeg"})
        wait_port(g3_port)
        no_ffmpeg = call("POST", "http://127.0.0.1:%d/gateway/last-frame" % g3_port, body=clip,
                         headers={"Content-Type": "video/mp4"}, token=TOKEN)
        check("501 with a clear message when ffmpeg is missing",
              no_ffmpeg["status"] == 501 and no_ffmpeg["json"]["error"] == "ffmpeg_missing")

        # ---- a wedged upstream is skipped -------------------------------------
        g2_port = free_port()
        spawn("gateway2", [GATEWAY],
              {"UPSTREAMS": "http://127.0.0.1:%d,http://127.0.0.1:%d" % (ports["BH"], ports["A"]),
               "GATEWAY_TOKEN": TOKEN, "GATEWAY_PORT": str(g2_port), "UPSTREAM_TIMEOUT": "2",
               "GATEWAY_PROBE_INTERVAL": "2", "GATEWAY_PROBE_TIMEOUT": "10",
               "GATEWAY_PENALTY_S": "30"})
        wait_port(g2_port)
        base2 = "http://127.0.0.1:%d" % g2_port
        started = time.time()
        first = call("GET", base2 + "/slow?ms=1", token=TOKEN, timeout=30)
        slow_seconds = time.time() - started
        time.sleep(2.5)
        started = time.time()
        second = call("GET", base2 + "/slow?ms=1", token=TOKEN, timeout=30)
        fast_seconds = time.time() - started
        wedged = [s for s in health(g2_port)["json"]["upstreams"] if str(ports["BH"]) in s["url"]][0]
        check("a wedged upstream fails over on the first request",
              first["status"] == 200 and slow_seconds >= 2.0,
              "%.2fs" % slow_seconds)
        check("the wedged upstream is then skipped",
              second["status"] == 200 and fast_seconds < 1.0 and wedged["selectable"] is False,
              "%.2fs, selectable=%s" % (fast_seconds, wedged["selectable"]))

        # ---- health shape and secret hygiene ---------------------------------
        final = health(g1_port)["json"]
        check("health reports in-flight and per-upstream state",
              final["inflight_total"] == 0 and final["upstreams_total"] == 4
              and {"url", "healthy", "selectable", "inflight", "requests", "last_error"}
              <= set(final["upstreams"][0].keys()))
        check("health does not leak the token", TOKEN not in json.dumps(final))
        leaked = []
        for name in ("A", "B", "C"):
            state = control(cports[name])
            if state["authorization_seen"]:
                leaked.append(name)
        check("the gateway token is never forwarded upstream",
              not leaked and all("authorization" not in control(cports[n])["header_names"]
                                 for n in ("A", "B", "C")),
              "upstreams that saw Authorization: %s" % (leaked or "none"))
        with open(g1_log, "rb") as handle:
            logs = handle.read().decode("utf-8", "replace")
        check("the token is never logged",
              TOKEN not in logs and "Bearer" not in logs,
              "%d log lines" % logs.count("\n"))
    finally:
        for proc in SPAWNED:
            try:
                proc.terminate()
            except Exception:
                pass
        for proc in SPAWNED:
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()

    failed = [name for name, ok, _ in RESULTS if not ok]
    print("\n%d checks, %d failed" % (len(RESULTS), len(failed)))
    if failed:
        print("failed: " + ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

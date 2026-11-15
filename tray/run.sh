#!/usr/bin/env bash
#
# Fork tray gateway: one public URL in front of the FastH3 / UniServe instances.
#
#   ./run.sh
#
# Starts the gateway, opens a Cloudflare quick tunnel, and prints the two values the
# Convex backend needs: FASTH3_URLS and FASTH3_API_KEY. Ctrl-C stops both.
#
# Environment:
#   UPSTREAMS          comma separated, defaults to the four tray instances
#                      set it empty (UPSTREAMS= ./run.sh) for frames-only mode
#   GATEWAY_FRAMES_ONLY 1 to serve only /gateway/health and /gateway/last-frame
#   GATEWAY_PORT       default 8788
#   GATEWAY_TOKEN      set your own; otherwise the last one is reused, or a new one is made
#   GATEWAY_NO_TUNNEL  1 to skip cloudflared (local only)
#   CLOUDFLARED        path to the cloudflared binary

if [ -z "${BASH_VERSION:-}" ]; then
  echo "run.sh needs bash: use ./run.sh or bash run.sh" >&2
  exit 1
fi

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

UPSTREAMS="${UPSTREAMS-http://10.244.15.110:8000,http://10.244.3.215:8000,http://10.244.18.232:8000,http://10.244.17.72:8000}"
if [ "${GATEWAY_FRAMES_ONLY:-0}" = "1" ]; then
  UPSTREAMS=""
fi
GATEWAY_PORT="${GATEWAY_PORT:-8788}"
GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
GATEWAY_NO_TUNNEL="${GATEWAY_NO_TUNNEL:-0}"
ENVFILE="$HERE/.gateway.env"
TUNNEL_LOG="$HERE/cloudflared.log"
BINDIR="$HERE/bin"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || die "python3 is required (the gateway itself has no other dependencies)"

# --- a virtualenv if the machine can make one, the system python otherwise -------------------
PY="python3"
if [ ! -x "$HERE/.venv/bin/python" ]; then
  if python3 -m venv "$HERE/.venv" >/dev/null 2>&1; then
    PY="$HERE/.venv/bin/python"
  fi
fi
if [ -x "$HERE/.venv/bin/python" ]; then
  PY="$HERE/.venv/bin/python"
fi
"$PY" - <<'PYEOF' || die "python 3.8 or newer is required"
import sys
raise SystemExit(0 if sys.version_info >= (3, 8) else 1)
PYEOF
# The gateway is standard library only, so there is nothing to pip install.
say "python: $("$PY" -c 'import sys; print(sys.executable, sys.version.split()[0])')"

# --- token ----------------------------------------------------------------------------------
if [ -z "${GATEWAY_TOKEN:-}" ]; then
  if [ -f "$ENVFILE" ]; then
    # shellcheck disable=SC1090
    GATEWAY_TOKEN="$(sed -n 's/^GATEWAY_TOKEN=//p' "$ENVFILE" | head -1)"
  fi
fi
if [ -z "${GATEWAY_TOKEN:-}" ]; then
  GATEWAY_TOKEN="$("$PY" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  say "generated a new GATEWAY_TOKEN"
else
  say "reusing the existing GATEWAY_TOKEN (set GATEWAY_TOKEN=... to change it)"
fi
export GATEWAY_TOKEN

# --- start the gateway ----------------------------------------------------------------------
export UPSTREAMS GATEWAY_PORT GATEWAY_HOST
LOG="$HERE/gateway.log"
"$PY" "$HERE/gateway.py" >"$LOG" 2>&1 &
GATEWAY_PID=$!
TUNNEL_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  if kill -0 "$GATEWAY_PID" 2>/dev/null; then
    kill "$GATEWAY_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  say ""
  say "stopped."
}
trap cleanup EXIT INT TERM

ok=0
for _ in $(seq 1 100); do
  if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
    say "the gateway exited at once:"
    sed 's/^/  /' "$LOG" >&2
    die "gateway did not start (is port $GATEWAY_PORT already in use?)"
  fi
  if "$PY" - "$GATEWAY_PORT" <<'PYEOF'
import http.client, os, sys, time
port = int(sys.argv[1])
deadline = time.time() + 3
while time.time() < deadline:
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
        conn.request("GET", "/gateway/health",
                     headers={"Authorization": "Bearer " + os.environ["GATEWAY_TOKEN"]})
        response = conn.getresponse()
        response.read()
        if response.status in (200, 503):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.15)
raise SystemExit(1)
PYEOF
  then
    ok=1
    break
  fi
  sleep 0.2
done
[ "$ok" = "1" ] || die "the gateway did not answer on http://127.0.0.1:$GATEWAY_PORT (see $LOG)"
say "gateway listening on http://127.0.0.1:$GATEWAY_PORT"

# --- cloudflared quick tunnel ---------------------------------------------------------------
PUBLIC_URL=""
if [ "$GATEWAY_NO_TUNNEL" = "1" ]; then
  say "GATEWAY_NO_TUNNEL=1: not starting a tunnel"
else
  CF="${CLOUDFLARED:-}"
  if [ -z "$CF" ]; then
    if command -v cloudflared >/dev/null 2>&1; then
      CF="$(command -v cloudflared)"
    elif [ -x "$BINDIR/cloudflared" ]; then
      CF="$BINDIR/cloudflared"
    fi
  fi
  if [ -z "$CF" ]; then
    case "$(uname -m)" in
      x86_64|amd64) CFARCH="amd64" ;;
      aarch64|arm64) CFARCH="arm64" ;;
      *) CFARCH="" ;;
    esac
    [ -n "$CFARCH" ] || die "unknown architecture $(uname -m): install cloudflared yourself and set CLOUDFLARED=/path/to/cloudflared"
    mkdir -p "$BINDIR"
    say "downloading cloudflared ($CFARCH) ..."
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL -o "$BINDIR/cloudflared" \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CFARCH" \
        || die "could not download cloudflared: does this machine have outbound internet?"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$BINDIR/cloudflared" \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CFARCH" \
        || die "could not download cloudflared: does this machine have outbound internet?"
    else
      die "neither curl nor wget is installed: fetch cloudflared yourself and set CLOUDFLARED=/path/to/cloudflared"
    fi
    chmod +x "$BINDIR/cloudflared"
    CF="$BINDIR/cloudflared"
  fi
  if ! "$CF" --version >/dev/null 2>&1; then
    die "$CF will not run: set CLOUDFLARED=/path/to/cloudflared"
  fi
  say "tunnel: $("$CF" --version 2>/dev/null | head -1)"
  rm -f "$TUNNEL_LOG"
  "$CF" tunnel --no-autoupdate --url "http://127.0.0.1:$GATEWAY_PORT" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  for _ in $(seq 1 300); do
    PUBLIC_URL="$(grep -oE 'https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)"
    [ -n "$PUBLIC_URL" ] && break
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      say "cloudflared exited; last lines of $TUNNEL_LOG:"
      tail -n 8 "$TUNNEL_LOG" 2>/dev/null | sed 's/^/  /' >&2
      break
    fi
    sleep 0.2
  done
  if [ -n "$PUBLIC_URL" ]; then
    say "tunnel: $PUBLIC_URL"
  else
    say "WARNING: no tunnel URL yet. The gateway is still up on http://127.0.0.1:$GATEWAY_PORT."
    say "         Check $TUNNEL_LOG, or use your own tunnel and set FASTH3_URLS to it."
  fi
fi

# --- leave the values where the next step can find them -------------------------------------
umask 077
{
  say "# written by run.sh; contains the gateway token, do not commit"
  say "UPSTREAMS=$UPSTREAMS"
  say "GATEWAY_PORT=$GATEWAY_PORT"
  say "GATEWAY_TOKEN=$GATEWAY_TOKEN"
  [ -n "$PUBLIC_URL" ] && say "PUBLIC_URL=$PUBLIC_URL"
} >"$ENVFILE"
chmod 600 "$ENVFILE"

# --- the part you actually need --------------------------------------------------------------
say ""
say "════════════════════════════════════════════════════════════════════"
if [ -n "$PUBLIC_URL" ]; then
  say " Fork tray gateway is up."
  say ""
  say " Public URL   $PUBLIC_URL"
else
  say " Fork tray gateway is up (no public URL; local only)."
  say ""
  say " Local URL    http://127.0.0.1:$GATEWAY_PORT"
fi
say " Local health http://127.0.0.1:$GATEWAY_PORT/gateway/health"
say ""
say " Give the Convex backend these two values:"
say ""
say "   FASTH3_URLS=${PUBLIC_URL:-http://127.0.0.1:$GATEWAY_PORT}"
say "   FASTH3_API_KEY=$GATEWAY_TOKEN"
say ""
if [ -n "$PUBLIC_URL" ]; then
  say " Check it from anywhere:"
  say "   curl -sS $PUBLIC_URL/gateway/health -H 'Authorization: Bearer $GATEWAY_TOKEN'"
else
  say " Check it:"
  say "   curl -sS http://127.0.0.1:$GATEWAY_PORT/gateway/health -H 'Authorization: Bearer $GATEWAY_TOKEN'"
fi
say ""
say " Logs: gateway $LOG | tunnel $TUNNEL_LOG"
say " Stop: Ctrl-C (or: pkill -f tray/gateway.py; pkill -f 'cloudflared tunnel')"
say ""
say " Last frame of a clip (PNG on stdout):"
say "   curl -sS -X POST http://127.0.0.1:$GATEWAY_PORT/gateway/last-frame \\"
say "     -H 'Authorization: Bearer $GATEWAY_TOKEN' -H 'Content-Type: application/json' \\"
say "     -d '{\"url\":\"https://example.com/clip.mp4\"}' -o last-frame.png"
say "════════════════════════════════════════════════════════════════════"
say ""

wait "$GATEWAY_PID"

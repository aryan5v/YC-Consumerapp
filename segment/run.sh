#!/usr/bin/env bash
# One command for the GPU node: venv, dependencies, weights, server.
#
#   ./run.sh              # auto: use SAM 3 if its weights are reachable, else Grounding DINO + SAM 2.1
#   ENGINE=sam3 ./run.sh  # force SAM 3 (needs HF access approval)
#   ENGINE=dino_sam2 ./run.sh
#   ENGINE=stub STUB_DIR=./tests/fixtures/masks ./run.sh
#
# Everything is overridable with environment variables; see .env.example.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ENGINE="${ENGINE:-${SEGMENT_ENGINE:-auto}}"
export SEGMENT_ENGINE="$ENGINE"
VENV="${VENV_DIR:-$ROOT/.venv}"
PYTHON="${PYTHON:-python3}"

if [[ ! -d "$VENV" ]]; then
  echo "==> creating virtualenv at $VENV"
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 "$VENV"
  else
    "$PYTHON" -m venv "$VENV"
  fi
fi

PY="$VENV/bin/python"
if command -v uv >/dev/null 2>&1; then
  echo "==> installing dependencies"
  VIRTUAL_ENV="$VENV" uv pip install -r requirements.txt --torch-backend="${TORCH_BACKEND:-auto}"
else
  echo "==> installing dependencies (install uv if this step is slow)"
  "$PY" -m pip install --upgrade pip >/dev/null
  "$PY" -m pip install -r requirements.txt
  BACKEND="${TORCH_BACKEND:-auto}"
  if [[ "$BACKEND" != "cpu" ]] && { [[ "$BACKEND" != "auto" ]] || command -v nvidia-smi >/dev/null 2>&1; }; then
    INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cu128}"
    echo "==> installing CUDA torch from $INDEX"
    "$PY" -m pip install --upgrade torch torchvision --index-url "$INDEX"
  fi
fi

if [[ "$ENGINE" == "stub" ]]; then
  echo "==> stub engine, skipping weight download"
  if [[ -n "${STUB_DIR:-}" ]]; then
    export SEGMENT_STUB_DIR="$STUB_DIR"
  fi
else
  echo "==> downloading weights (engine=$ENGINE)"
  "$PY" -m app.weights --engine "$ENGINE"
fi

if [[ -z "${SEGMENT_API_KEY:-}" ]]; then
  echo "==> SEGMENT_API_KEY is not set; generating one for this run"
  export SEGMENT_API_KEY="$("$PY" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  echo "    SEGMENT_API_KEY=$SEGMENT_API_KEY"
  echo "    (put this in .env so the key survives a restart)"
fi

export SEGMENT_MASK_DIR="${SEGMENT_MASK_DIR:-$ROOT/masks}"
export SEGMENT_HOST="${SEGMENT_HOST:-0.0.0.0}"
export SEGMENT_PORT="${SEGMENT_PORT:-8000}"

echo "==> starting server on ${SEGMENT_HOST}:${SEGMENT_PORT} (engine=$ENGINE)"
exec "$PY" -m uvicorn app.server:app \
  --host "$SEGMENT_HOST" --port "$SEGMENT_PORT" \
  --proxy-headers --forwarded-allow-ips '*'

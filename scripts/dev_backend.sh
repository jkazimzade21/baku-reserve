#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST="${DEV_BACKEND_HOST:-0.0.0.0}"
PORT="${DEV_BACKEND_PORT:-8000}"

PYTHON_BIN="python3"
if [[ -x "$ROOT/.venv/bin/python3" ]]; then
  # Prefer the project virtualenv when available so uvicorn and deps resolve.
  PYTHON_BIN="$ROOT/.venv/bin/python3"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3.11)"
fi

echo "[dev-backend] Starting FastAPI on ${HOST}:${PORT} (reload enabled)"
exec "$PYTHON_BIN" -m uvicorn app.main:app --app-dir backend --host "$HOST" --port "$PORT" --reload

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST="${DEV_BACKEND_HOST:-0.0.0.0}"
PORT="${DEV_BACKEND_PORT:-8000}"

echo "[dev-backend] Starting FastAPI on ${HOST}:${PORT} (reload enabled)"
exec python3 -m uvicorn app.main:app --app-dir backend --host "$HOST" --port "$PORT" --reload

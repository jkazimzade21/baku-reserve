#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/mobile"

DEFAULT_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
IP="${EXPO_HOST_IP:-$DEFAULT_IP}"
API_PORT="${API_PORT:-8000}"
PORT="${EXPO_DEV_PORT:-8081}"

export EXPO_PUBLIC_API_BASE="${EXPO_PUBLIC_API_BASE:-http://$IP:$API_PORT}"

echo "[dev-mobile] Using API at $EXPO_PUBLIC_API_BASE"
echo "[dev-mobile] Starting Expo on port $PORT"
exec npx expo start --port "$PORT"

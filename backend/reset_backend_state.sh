#!/usr/bin/env bash
set -euo pipefail
# Nuke persisted reservations to guarantee a clean baseline.
DATA_DIR="$(cd "$(dirname "$0")/app/data" && pwd)"
RES="$DATA_DIR/reservations.json"
mkdir -p "$DATA_DIR"
printf '{ "reservations": [] }\n' > "$RES"
echo "[ok] Wrote empty $RES"

#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$HOME/baku-reserve}"
OUT_DIR="${2:-code_dump}"

cd "$ROOT"
mkdir -p "$OUT_DIR"

# directories to skip (heavy or generated)
PRUNE=(.git node_modules .venv __pycache__ .pytest_cache .mypy_cache .expo .next build dist ios android .idea .vscode)

# build find prune expression
build_prune() {
  local arr=("$@")
  local expr=()
  for d in "${arr[@]}"; do expr+=( -name "$d" -o ); done
  # drop trailing -o
  unset 'expr[${#expr[@]}]'
  printf '%s\0' "${expr[@]}"
}

# write repo structure (filtered)
STRUCT="$OUT_DIR/STRUCTURE.txt"
: > "$STRUCT"
printf "# Repo structure (filtered)\n# Root: %s\n\n" "$ROOT" >> "$STRUCT"
# shellcheck disable=SC2046
find . -type d \( $(build_prune "${PRUNE[@]}") \) -prune -o -print >> "$STRUCT"

dump_dir() {
  local dir="$1"
  local out="$2"

  : > "$out"
  printf "# Code dump for %s\n# Generated: %s\n\n" "$dir" "$(date -Iseconds)" >> "$out"

  # iterate files (skip common binaries)
  # shellcheck disable=SC2046
  while IFS= read -r -d '' f; do
    # skip binary-ish files defensively
    if ! grep -Iq . "$f"; then
      printf "\n===== FILE (binary skipped): %s =====\n" "$f" >> "$out"
      continue
    fi

    printf "\n===== FILE: %s =====\n" "$f" >> "$out"

    # naive redaction of obvious secrets in dumps (doesn't touch your real files)
    sed -E \
      -e 's/([Pp]assword|PWD|PASS|SECRET|Token|TOKEN|API[_-]?KEY|ApiKey|apiKey)\s*[:=]\s*\S+/\\1=***REDACTED***/g' \
      -e 's/(DATABASE_URL|DB_URL|DATABASE_URI|CONNECTION_STRING)\s*[:=]\s*\S+/\\1=***REDACTED***/g' \
      "$f" >> "$out"
    printf "\n" >> "$out"
  done < <(
    find "$dir" \
      -type d \( $(build_prune "${PRUNE[@]}") \) -prune -o \
      -type f ! -name "*.png" ! -name "*.jpg" ! -name "*.jpeg" ! -name "*.webp" ! -name "*.gif" ! -name "*.ico" ! -name "*.pdf" ! -name "*.svg" ! -name "*.mp4" ! -name "*.mov" \
      -print0
  )
}

# dump backend if present
[[ -d "$ROOT/backend"  ]] && dump_dir "$ROOT/backend"  "$OUT_DIR/CODE_BACKEND.txt"
# dump frontend if present
[[ -d "$ROOT/frontend" ]] && dump_dir "$ROOT/frontend" "$OUT_DIR/CODE_FRONTEND.txt"

echo "DONE. Files created in $OUT_DIR:"
ls -lh "$OUT_DIR"

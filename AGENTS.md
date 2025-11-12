# Repository Guidelines

> **Codex Handoff Rule:** This file now holds the running context (no separate `codexinfo.md`). Skim it before changing code and append any critical hand-off notes here when you wrap up.

## Project Structure & Module Organization
- `backend/app/` holds the FastAPI service, seeded venue data, and lightweight SQLite-backed reservation store. Domain helpers live under `app/availability.py`, `storage.py`, and `utils.py`.
- `backend/tests/` contains pytest smoke and property-based coverage; scripts in `backend/scripts/` and `backend/tools/` orchestrate smoke, stress, and e2e entrypoints.
- `mobile/` is the Expo client. Core UI lives in `src/screens/`, shareable UI primitives in `src/components/`, and API wiring in `src/api.ts`. Unit specs reside under `mobile/__tests__/`.
- `tools/` aggregates repo-wide automation such as `full_stack_e2e.sh` and the `mega_tester.py` orchestrator.

## Build, Test, and Development Commands
- **Bootstrap backend** (from repo root): `python3.11 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`.
- **Run API with hot reload**: `./scripts/dev_backend.sh` (wraps `uvicorn app.main:app --app-dir backend --reload` and binds `0.0.0.0:8000`).
- **Expo client**: `./scripts/dev_mobile.sh` (exports `EXPO_PUBLIC_API_BASE` to your LAN IP and starts Metro on port 8081).
- **Backend smoke**: `BASE=http://127.0.0.1:8000 pytest backend/tests/test_extreme.py`.
- **Mobile unit tests**: `cd mobile && npm test`.
- **Full sweep**: `./tools/full_stack_e2e.sh` once both services are serving.

## Coding Style & Naming Conventions
- Python uses 4-space indentation, type hints, and CamelCase models mirroring `schemas.py`. Extend seeded data with UUID4 IDs and keep formatting via `ruff`/`black` defaults.
- TypeScript/React Native uses 2-space indentation, PascalCase components, and descriptive hooks (e.g., `useSeatAvailability`). Reference colors from `mobile/src/config/theme.ts`’s “Sunlit Comfort” palette; avoid ad hoc hex codes.
- Keep JSX descriptive and add comments only when behaviour is non-obvious (e.g., timing logic around live seat sync).

## Testing Guidelines
- Pytest fixtures reset the reservation store; run `backend/reset_backend_state.sh` if manual experiments dirty data.
- Exercise the live seat map regularly: book a table via mobile and confirm the SeatPicker removes it within the 15-second sync window.
- Frontend tests use React Native Testing Library. Place specs under `mobile/__tests__/` and mock network calls via `src/api.ts`.

## Commit & Pull Request Guidelines
- Write imperative, single-line commit subjects (e.g., “Tighten booking conflict checks”). Group related changes per commit.
- PR descriptions must state user-facing changes, list touched API/mobile surfaces, and include the latest `pytest`, `npm test`, or `tools/full_stack_e2e.sh` output. Attach UI screenshots for visual tweaks and call out any `.env` or Expo config updates.

## Agent Terminal Routine
- Maintain three terminals: **Terminal A** runs the FastAPI backend, **Terminal B** runs the Expo client, **Terminal C** is reserved for Codex workflow.
- At each hand-off, record whether each terminal is running a command, waiting at a prompt, or blocked. Include ready-to-paste restart commands for A (`./scripts/dev_backend.sh`), B (`./scripts/dev_mobile.sh`), and suggested next steps for C.
- Avoid restarting services unnecessarily—prefer reusing the running backend/mobile processes unless a code change requires a full restart.

## Additional Context
- Backend seeds live in `backend/app/data/restaurants.json`. After editing, sync them into the runtime store (`~/.baku-reserve-data/restaurants.json`) using the helper Python snippet from `scripts/dev_backend.sh` docs so FastAPI returns the new data.
- The concierge stack relies on OpenAI (`OPENAI_API_KEY`, `CONCIERGE_GPT_MODEL`, `CONCIERGE_EMBED_MODEL`) and caches embeddings at `~/.baku-reserve-data/concierge_embeddings.json`; make sure those env vars are present before enabling concierge mode.
- The enrichment workflow (`tools/baku_enricher/`, `tools/update_restaurant_photos.py`) is the source of truth for adding venues—run it to regenerate assets and manifests instead of editing JSON/WebP files manually.

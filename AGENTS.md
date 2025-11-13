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

## 2025-11-12 GoMap integration notes
- `gomap_az/` now stores the official API PDF and onboarding email for reference. Keep new correspondence or credentials in that folder.
- `.env` contains the temporary GoMap GUID provided by SINAM. Update it when the one-month window lapses and mirror values in `.env.example`.
- Mobile Prep Notify screen now talks to the backend arrival-intent location endpoint (Expo Location + GoMap ETA). If the "Use my location" button regresses, check `mobile/src/utils/location.ts` and the new tests in `mobile/__tests__/experience.ui.test.tsx`.
- Added `/reservations/{id}/arrival_intent/suggestions` powered by GoMap search + routing; it drives the new manual pickers in `ReservationsScreen` and `PrepNotifyScreen`. Keep latency low by limiting `limit` to ≤8 per request.
- Manual typeahead lives in `mobile/src/hooks/useArrivalSuggestions.ts` with a shared UI card in `mobile/src/components/ArrivalInsightCard.tsx`. Both screens now show live distance/ETA/traffic pulled from the arrival intent payload.
- Created `.venv` (Python 3.11) and installed backend deps there; rerun `source .venv/bin/activate && pytest backend/tests/test_gomap.py backend/tests/test_backend_system.py backend/tests/test_validation.py` plus `cd mobile && npm test -- --watchAll=false` to reproduce today’s verification.

## 2025-02-15 MCP tooling pause
- Commented out every Codex MCP server in `~/.codex/config.toml` except Ref docs and Chrome DevTools so those two remain usable. Re-enable others (Apify, Sentry, baku-enricher, etc.) by uncommenting their `[mcp_servers.*]` blocks.

## 2025-11-13 Quick filter remediation
- Reproduced Claude Code’s audit locally: search, booking validation, Auto-assign, and Auth flows already behave per code (`backend/app/storage.py` search path + `mobile/src/screens/SeatPicker.tsx` auth guard). Root cause for “broken filters” was the quick chips issuing literal search strings that never matched seed data.
- Updated `mobile/src/screens/HomeScreen.tsx` so Tonight/Brunch/Live music/Terrace chips now toggle curated tag filters instead of brittle text queries; also expanded `tagFilterMap` and `vibeFilters` to cover the new tags.
- Tests: `source .venv/bin/activate && pytest backend/tests/test_gomap.py backend/tests/test_backend_system.py backend/tests/test_validation.py` and `cd mobile && npm test -- --watchAll=false`.

## 2025-11-13 Hook + timezone wave
- Added richer cancellation + stale-state handling to `useArrivalSuggestions`, updated PrepNotify and Reservations screens to keep presets visible while live requests resolve, and expanded `experience.ui.test.tsx` coverage for the new behaviors.
- Propagated per-restaurant `timezone` through backend seeds, schemas, serializers, and availability responses (synced to `~/.baku-reserve-data/restaurants.json`). Mobile API types now expose the field, and availability utilities/book flows consume it to format labels and timestamps correctly (defaulting to `Asia/Baku`). SeatPicker and navigation params pass timezone through to floor/arrival cards.
- Tests executed: `source .venv/bin/activate && pytest backend/tests/test_backend_system.py backend/tests/test_validation.py` and `cd mobile && npm test -- --watchAll=false`.
- Terminal status @ handoff — A: idle (`./scripts/dev_backend.sh`), B: idle (`./scripts/dev_mobile.sh`), C: free for workflow (next step: verify concierge GoMap latency once services restart).

## 2025-11-13 Wave 3 stability wrap
- Hardened `/health` so blank/trimmed config disables optional deps without hitting the network, exposed a `clear_cache()` helper, and added coverage in `test_observability.py`; tests now blank `GOMAP_GUID` env before importing the app.
- Concierge startup skips the async refresh loop when running in local mode or without `OPENAI_API_KEY`, marking health as degraded instead of spawning failing background tasks; added loop guard when no event loop exists.
- Type generator now understands JSON Schema tuples (`prefixItems`) so server contracts emit `[number, number]` for table positions; regenerated `mobile/src/types/server.d.ts`.
- Tests: `source .venv/bin/activate && pytest backend/tests/test_observability.py backend/tests/test_e2e_workflows.py::TestErrorRecoveryWorkflows::test_network_timeout_recovery backend/tests/test_backend_system.py backend/tests/test_validation.py`; `cd mobile && npm test -- --watchAll=false --watchman=false` (need `--watchman=false` locally due to watchman socket restrictions).
- Terminal status @ handoff — A: idle (`./scripts/dev_backend.sh`), B: idle (`./scripts/dev_mobile.sh`), C: idle after tests (next step: restart services only if you need to exercise concierge health with real GoMap).

## 2025-11-13 R1 date parsing fix
- Extracted `formatDateInput`/`parseDateInput` into `mobile/src/utils/dateInput.ts` so they build `YYYY-MM-DD` strings via local calendar fields instead of `toISOString`, eliminating the Asia/Baku rejection.
- Updated `BookScreen` to consume the new helpers and added focused Jest coverage (`mobile/__tests__/dateInput.test.ts`) that forces `TZ=Asia/Baku` to guard against regressions.
- Tests executed: `cd mobile && npm test -- --runTestsByPath __tests__/dateInput.test.ts`.
- Terminal status @ handoff — A: idle (`./scripts/dev_backend.sh`), B: idle (`./scripts/dev_mobile.sh`), C: idle (next: proceed with R2 slot timezone remediation).

## 2025-11-13 R2–R5 timezone & authorization sweep
- Backend availability slots now emit timezone-aware ISO strings using `zoneinfo`, and SeatPicker derives refresh dates with the restaurant timezone via `getAvailabilityDayKey`.
- Added ownership scoping to every reservation endpoint (persisting `owner_id`, filtering list, enforcing per-route checks) plus new backend tests ensuring cross-tenant access returns 404.
- Arrival location pings now store `current_location` alongside `last_location`, and suggestions fall back gracefully; tests verify GoMap queries receive the guest’s coordinates.
- New Jest coverage for availability helpers (`mobile/__tests__/availability.utils.test.ts`), plus FastAPI tests for timezone offsets, owner filtering, and location-aware suggestions.
- Tests executed: `source .venv/bin/activate && pytest backend/tests/test_backend_system.py`; `cd mobile && npm test -- --runTestsByPath __tests__/availability.utils.test.ts __tests__/dateInput.test.ts`.
- Terminal status @ handoff — A: idle (`./scripts/dev_backend.sh`), B: idle (`./scripts/dev_mobile.sh`), C: idle (next: tackle R6 token refresh flow).

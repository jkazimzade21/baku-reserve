# Repository Guidelines
## Project Structure & Module Organization
- `backend/app/` hosts the FastAPI service, domain models, and the seeded data store under `app/data/`.
- `backend/tests/` contains pytest regression coverage; helper scripts in `backend/scripts/` and `backend/tools/` orchestrate smoke and stress runs.
- `mobile/` is the Expo app (`src/components`, `src/screens`, `src/api.ts`), with Jest specs in `__tests__/` and media in `assets/`.
- `tools/` aggregates repo-level automation such as `full_stack_e2e.sh` and `mega_tester.py` for cross-tier checks.

## Build, Test, and Development Commands
- Bootstrap the API: `python -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`.
- Run FastAPI locally: `uvicorn app.main:app --reload --app-dir backend` (defaults to port 8000).
- Backend smoke: `BASE=http://127.0.0.1:8000 pytest backend/tests/test_extreme.py`.
- Mobile dev loop: `cd mobile && npm install && npm run start` (`npm run ios` / `android` launch simulators).
- Mobile unit tests: `cd mobile && npm test` or `npm run test:watch`.
- End-to-end sweep: `./tools/full_stack_e2e.sh` once both services are reachable.

## Coding Style & Naming Conventions
Python modules use 4-space indentation, type hints, and CamelCase models as in `schemas.py`; extend seeded dictionaries with UUID4 IDs. TypeScript sticks to two-space indentation, PascalCase components, and `useX` hooks aligned with route keys.

## Testing Guidelines
Pytest fixtures reset the reservation store; run `backend/reset_backend_state.sh` if data drifts. Keep backend additions near `test_extreme.py` and focus Hypothesis on boundaries. For React Native, place `*.test.tsx` under `__tests__/`, use Testing Library queries, and mock fetches via `src/api.ts`.

## Agent Terminal Routine
- Operate with three terminals at all times: Terminal A runs the FastAPI backend, Terminal B runs the Expo Go client, and Terminal C is reserved for Codex tasks.
- At each hand-off, log the live status of all three terminals (running command, ready prompt, or blocked state) for the next contributor.
- Provide ready-to-paste commands for every terminal—restart instructions for A, `expo` or `npm` commands for B, and next troubleshooting or test steps for C—even if the action is to wait.

## Commit & Pull Request Guidelines
Write imperative, one-line commit subjects (e.g., “Tighten booking conflict checks”) and group related changes per commit. PRs should state the user-facing change, list API/mobile touchpoints, and include command output for `pytest`, `npm test`, or `tools/full_stack_e2e.sh`. Attach screenshots or screen recordings for UI changes and call out any `.env` adjustments in the description.

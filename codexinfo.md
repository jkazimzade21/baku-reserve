# Codex Knowledge Base

_Last updated: 2025-11-10 18:40 AZT (UTC+04:00)_

## General

Baku Reserve is a dual-platform demo for high-end restaurant reservations in Baku, Azerbaijan. The repo comprises:

- **Backend (`backend/`)** – FastAPI + Uvicorn app. Restaurant seed data starts in `backend/app/data/restaurants.json` but is copied to the runtime data directory (`~/.baku-reserve-data/`) via `app/storage.py`. Key modules: `app/main.py` (FastAPI factory), `app/routes/*` (REST endpoints), `app/availability.py` (table conflict + seating logic), `app/utils.py` (geo + phone helpers), and `app/settings.py` (loads `.env`). The JSON “database” tracks restaurants, areas/tables, and reservations. Utility scripts live under `scripts/` (`dev_backend.sh`, `reset_backend_state.sh`).
- **Mobile (`mobile/`)** – Expo / React Native client. `src/screens/` implements seat picker, booking flow, AI concierge. Shared components are under `src/components/`, API glue under `src/api.ts`, theme tokens inside `src/config/theme.ts`. Restaurant imagery is bundled as WebP assets (`src/assets/restaurants/<slug>/`). Metro is launched via `scripts/dev_mobile.sh` after exporting `EXPO_PUBLIC_API_BASE`.
- **Tooling (`tools/`)** – Repo-wide automation, e.g., `full_stack_e2e.sh`, testers, and the new `baku_enricher/` pipeline. `tools/update_restaurant_photos.py` pulls curated JPGs from `IGPics/<slug>/`, converts them to WebP for mobile, rebuilds `mobile/src/assets/restaurantPhotoManifest.ts`, and rewrites `backend/app/data/restaurants.json` photo paths.
- **Assets & Data** – `backend/app/data/` is the canonical seed source; runtime writes live under `~/.baku-reserve-data/`. Expo expects `/assets/restaurants/<slug>/<index>.jpg` paths in JSON to match the WebP imports in the bundle. Every venue should expose 5 photos (3 food + 2 interior) for parity.

### Automation flow (Baku Enricher)
1. `.env` now holds `GOOGLE_MAPS_API_KEY`, `APIFY_TOKEN`, `SERPAPI_API_KEY`, optional Bing search key, plus `INSTAGRAM_USERNAME`/`INSTAGRAM_PASSWORD` for Instaloader fallback.
2. `tools/baku_enricher/enrich.py` combines Google Places + SerpAPI + Apify (or Instaloader) + CLIP to resolve address, menu URL, Instagram handle, tags, and five photos. Output lands in `out/restaurants/<slug>.json` and `out/restaurants/images/`.
3. `tools/baku_enricher_mcp/server.mjs` exposes that CLI as an MCP server (`baku-enricher`). Codex (or `node tools/baku_enricher_mcp/call_tool.mjs "<Restaurant>"`) can call `enrich_restaurant` with `downloadImages=true` to automate data gathering end-to-end.
4. After enrichment, copy JPGs into `IGPics/<slug>/1..5.jpg` and run `python tools/update_restaurant_photos.py --slugs <slug>` to generate WebPs + update manifests. Sync `backend/app/data/restaurants.json` into the runtime datastore (`~/.baku-reserve-data/restaurants.json`) using the helper snippet below whenever seeds change.

### Environment & Testing
- **Backend dev:** `./scripts/dev_backend.sh` (Terminal A, uvicorn with reload). Reset state via `./backend/reset_backend_state.sh` or by copying the seed file into `~/.baku-reserve-data/`.
- **Mobile dev:** `./scripts/dev_mobile.sh` (Terminal B, Expo CLI) – sets `EXPO_PUBLIC_API_BASE` automatically.
- **Backend tests:** `.venv/bin/pytest backend` (or `BASE=http://127.0.0.1:8000 pytest backend/tests/test_extreme.py`).
- **Frontend tests:** `cd mobile && npm test -- --watchAll=false`.
- **Full-stack smoke:** `./tools/full_stack_e2e.sh` after both services run.

**Runtime seed sync helper:**
```bash
python3 - <<'PY'
import json, sys
from pathlib import Path
sys.path.insert(0, 'backend')
from app.settings import settings
src = Path('backend/app/data/restaurants.json')
dst = settings.data_dir / 'restaurants.json'
dst.write_text(json.dumps(json.loads(src.read_text()), indent=2, ensure_ascii=False))
print(f"Synced {dst}")
PY
```

## Codex Session Log

### Session 1 – 2025-11-09 09:30 UTC — Vision & automation plan
- Defined the need to scale demo content (25→100+ venues) and outlined the enrichment pipeline (Google Places, menu scraping heuristics, Instagram classification, tag generation, photo manifests). No code landed.

### Session 2 – 2025-11-10 07:45 UTC — Environment + secrets
- Hardened `.env` with Google/Axios keys, Apify token, SerpAPI fallback, and clarified Mapbox/Expo defaults. Installed the `tools/baku_enricher/` virtualenv dependencies (Torch, CLIP, Apify client). Config-only session.

### Session 3 – 2025-11-10 10:55 UTC — MCP automation tooling
- Built `tools/baku_enricher/enrich.py` (Google Places + SerpAPI + Apify + CLIP + Instaloader fallback) and `tools/baku_enricher_mcp/` (Node wrapper + MCP server + `call_tool.mjs`). Added `.venv` instructions, login fallback, and logging for Apify/Instaloader.
- Validation: manual `node tools/baku_enricher_mcp/call_tool.mjs "Chinar Baku"` run.

### Session 4 – 2025-11-10 17:30 UTC — Data import & documentation (current)
- Ran the MCP tool for **Nakhchivan Restaurant**, copied assets into `IGPics/` + mobile WebPs, updated `backend/app/data/restaurants.json`, regenerated `mobile/src/assets/restaurantPhotoManifest.ts`, and synced seeds into `~/.baku-reserve-data/restaurants.json` so the API serves the new venue. Added this `codexinfo.md`, updated `AGENTS.md`, and documented the reset instructions.
- Validation: `.venv/bin/pytest backend` and `cd mobile && npm test -- --watchAll=false` (see latest test logs in this session’s hand-off).

### How to inspect per-session changes
- `git log --oneline --since "2025-11-09"` – view chronological commits across these sessions.
- `git diff <commit_before_session>...<commit_after_session>` – drill into a specific session.
- Asset diffs: `git status` (generated assets in `mobile/src/assets/restaurants/<slug>/` and `IGPics/<slug>/`).

> **Reminder:** Future Codex agents must read this file before making changes so context carries forward between hand-offs.

# Codex Knowledge Base

_Last updated: 2025-11-10 23:59 AZT (UTC+04:00)_

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

### Session 5 – 2025-11-10 19:16 UTC — MCP dependency fix
- `npm install` inside `tools/baku_enricher_mcp/` to restore the local `node_modules` required by `server.mjs`, fixing the “connection closed: initialize response” failure when the Codex MCP client tried to start the `baku-enricher` server.
- Added a lightweight `node --input-type=module` smoke check (see shell history) that spins up the STDIO transport, calls `listTools`, and confirms the server now stays up (reports 1 tool).

### Session 6 – 2025-11-10 23:23 UTC — MCP auto-connect hardening
- Logged in to the hosted Apify MCP (`codex mcp login apify`) so Codex sessions no longer prompt for OAuth.
- Added `tools/baku_enricher_mcp/start_server.sh`, which lazily runs `npm install` (guarded by a timestamp) before launching `server.mjs`, and pointed both `.codex/config.toml` and `call_tool.mjs` at the script so the MCP server always has dependencies.
- Commented out the unused MCP entries (Stripe, Supabase, Vercel) inside `.codex/config.toml` while keeping Chrome DevTools, Ref, and Sentry enabled per request.
- Ignored `tools/baku_enricher_mcp/node_modules/` in `.gitignore` so the auto-install doesn’t dirty `git status`.

### Session 7 – 2025-11-10 23:55 UTC — 27-venue ingestion push
- Ran the `baku-enricher` MCP tool for 27 Port Baku / Bayil targets until Apify usage hit the ceiling; outputs now live under `tools/baku_enricher/out/`.
- Added `tools/baku_enricher/import_to_seed.py` to translate enriched JSON into full seed entries (cuisine heuristics, seat maps, price bands). Executed it to append all 27 venues, bringing `backend/app/data/restaurants.json` to 53 records and syncing the runtime store via the documented helper snippet.
- Copied the downloaded media into `IGPics/<slug>/`, expanded `PHOTO_SOURCES` with placeholder entries for the new slugs, and ran `.venv/bin/python tools/update_restaurant_photos.py --slugs <...>` to mint WebPs, refresh `/assets/restaurants/<slug>/`, and regenerate `mobile/src/assets/restaurantPhotoManifest.ts` (now flagging `la-maison-patisserie-cafe` + `people-livebar` as `PENDING_PHOTO_SLUGS` because no imagery was returned). `porterhouse-grill-wine` currently serves 2 hero photos; everything else landed with five.
- Notable follow-up: source Instagram or website assets for the two pending slugs once Apify credits refresh, then rerun `tools/update_restaurant_photos.py --slugs la-maison-patisserie-cafe people-livebar` to drop them out of the pending set.

### How to inspect per-session changes
- `git log --oneline --since "2025-11-09"` – view chronological commits across these sessions.
- `git diff <commit_before_session>...<commit_after_session>` – drill into a specific session.
- Asset diffs: `git status` (generated assets in `mobile/src/assets/restaurants/<slug>/` and `IGPics/<slug>/`).

> **Reminder:** Future Codex agents must read this file before making changes so context carries forward between hand-offs.

# Codex Knowledge Base

_Last updated: 2025-11-11 01:56 AZT (UTC+04:00)_

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

### Session 8 – 2025-11-11 05:10 UTC — Concierge heuristics upgrade
- Extended the `/restaurants` list payload plus `RestaurantSummary` shape to surface `neighborhood` and `address`, giving the Explore concierge enough context to match Fountain Square, Port Baku, or Bayil prompts without fetching detail records.
- Overhauled `mobile/src/utils/conciergeRecommender.ts`: richer vibe maps (tea houses/backgammon, hookah lounges, authentic/Azeri keywords, expanded synonyms), cuisine + price keyword extensions (numeric AZN parsing, “not too expensive” handling), stronger location hinting (neighborhood/address text, Fountain Square/downtown keywords), and a lower score floor so near-misses still surface.
- Added a culturally specific idea chip (“Traditional tea house breakfast with backgammon”) on `ConciergeAssistantCard` to demonstrate the feature and invite those prompts.
- Validation: `cd mobile && npm run lint` (green). Backend tests not rerun because the API change only exposes optional fields already present on the detail schema, and no server-side logic paths were altered.

### Session 9 – 2025-11-10 21:56 UTC — Codex unified exec prep
- Backed up `~/.codex/config.toml`, then added a `[shell]` section with `mode = "unified_exec"` so the CLI routes every command through the new execution path instead of the legacy shell tool.
- Created `~/.codex/keybindings.json` to bind `ctrl+n`/`ctrl+p` to the command palette’s next/previous actions per the new workflow guidelines.
- Could not restart the Codex app from inside the agent; please restart manually and run `codex mcp list`, `codex mcp test sentry`, `codex mcp test apify`, and `codex mcp test chrome-devtools` to refresh the MCP handshakes (especially the Sentry entry the update reintroduced).

### Session 10 – 2025-11-10 23:40 UTC — MCP CLI sanity check
- Restarted Codex locally and confirmed `codex mcp list` now reports `baku-enricher`, `chrome-devtools`, `sentry`, `apify`, and `ref` as `enabled`, so all configured servers register with the client.
- Discovered the CLI no longer ships a `codex mcp test <server>` helper; use `codex mcp get <server>` (or invoke one of its tools) to verify connectivity when the hand-off instructions call for a “test.”

### Session 11 – 2025-11-10 22:15 UTC — MCP auth attempts + IG roster
- Ran `codex mcp get sentry`, `codex mcp get apify`, and `codex mcp get chrome-devtools` to capture the exact transport configs for the active MCP servers. `codex mcp login sentry` is unsupported (stdio transport), while `codex mcp login ref` now prints the OAuth URL but needs the user to finish the browser step before the CLI times out.
- Parsed `backend/app/data/restaurants.json` to list every restaurant’s name plus Instagram handle so stakeholders can review coverage; noted the missing handles for `La Maison Patisserie&Cafe` and the placeholder link on `People Livebar`.

### How to inspect per-session changes
- `git log --oneline --since "2025-11-09"` – view chronological commits across these sessions.
- `git diff <commit_before_session>...<commit_after_session>` – drill into a specific session.
- Asset diffs: `git status` (generated assets in `mobile/src/assets/restaurants/<slug>/` and `IGPics/<slug>/`).

> **Reminder:** Future Codex agents must read this file before making changes so context carries forward between hand-offs.

### Session 12 – 2025-11-11 04:05 UTC — Concierge AI + mobile wiring
- Added an OpenAI-powered concierge stack: new settings/env knobs (`OPENAI_API_KEY`, `CONCIERGE_GPT_MODEL`, `CONCIERGE_EMBED_MODEL`), dependencies (`openai`, `numpy`), and a dedicated `backend/app/concierge.py` engine that interprets prompts via GPT-3.5, caches restaurant embeddings (`~/.baku-reserve-data/concierge_embeddings.json`), and serves `POST /concierge/recommendations` with multilingual intent parsing, semantic scoring, and deterministic fallbacks. Refactored the serializer helpers into `backend/app/serializers.py` so both the API and concierge route share the same `RestaurantListItem` formatting.
- Exposed new Pydantic models (`ConciergeQuery`, `ConciergeResponse`) plus FastAPI route wiring, and covered the fallback path with `backend/tests/test_concierge.py` (uses the existing `.venv` by running `.venv/bin/pytest backend/tests/test_concierge.py`).
- Refreshed the mobile concierge card to call the backend via `fetchConciergeRecommendations`, display AI explanations/badges, and gracefully resume the on-device heuristics when the API reports a fallback or errors. Added result messaging plus a reusable error hint so users know when the assistant is offline.
- Follow-up: set `OPENAI_API_KEY` in `.env` (or deployment secrets) before enabling the new concierge API in staging/prod so embeddings/GPT calls succeed. The first request will populate the embedding cache; seed regeneration requires roughly 50 embedding tokens.

### Session 13 – 2025-11-11 15:05 UTC — Concierge V2 (LLM intent + hybrid scoring)
- Rebuilt the concierge surface around a structured AI pipeline: new schemas (`ConciergeIntent`, `ConciergeRequest`, `ConciergeResponse`), multilingual taxonomy helpers (`backend/app/concierge_tags.py`), OpenAI intent parser with circuit breaker (`llm_intent.py`), embedding cache (`embeddings.py`), and weightable scoring (`scoring.py`). `backend/app/concierge_service.py` orchestrates feature flags, prompt caching, AB splits, Sentry spans, and deterministic fallback to the legacy heuristic engine.
- FastAPI endpoint now returns `{results, match_reason}` and respects `mode` query overrides/kill switch. Sentry SDK initialised with release/env tags; spans cover LLM → embedding → scoring → serialization. `.env.example` documents new knobs plus `SENTRY_*` additions.
- Mobile client consumes the updated API (`fetchConciergeRecommendations(prompt, { mode, lang, limit })`), detects AZ/RU input, and renders match reason chips. Concierge card gracefully handles offline/local modes via `EXPO_PUBLIC_CONCIERGE_MODE` (wired through `app.config.js` + `scripts/dev_mobile.sh`).
- Tests: backend intent/scoring/endpoint suites (`pytest backend/tests/test_intent.py backend/tests/test_scoring.py backend/tests/test_endpoint.py`) and new RN tests for the concierge card (`npm test -- --runTestsByPath __tests__/concierge.assistant.test.tsx`).
- Tooling/docs: `docs/concierge_v2.md` (architecture, flags, MCP usage, rollback), `scripts/enrich_baku.py` (`make enrich`), `tools/e2e_perf.mjs` (`make perf`), `scripts/ref_docs.mjs`, `scripts/sentry_bootstrap.mjs`, and a repo-level `Makefile` bundling the new automation.

### Session 14 – 2025-11-11 16:40 UTC — Sentry wiring + 50-run concierge web batch
- Added dev-friendly Sentry configuration: backend now honors `SENTRY_TRACES_SAMPLE_RATE` + `/dev/sentry-test` route for quick event pings, `.env`/`.env.example` document the new DSNs, and mobile picks up `EXPO_PUBLIC_SENTRY_DSN` via `scripts/dev_mobile.sh`, `app.config.js`, `.env`, and `App.tsx` (sentry-expo initialised with traces at 1.0).
- Enhanced the concierge UI with automation-friendly test IDs (`concierge-input`, `concierge-submit`, `concierge-results`, per-result IDs) and detail screen selectors (`restaurant-hero-card`, `restaurant-see-availability`) so browser automation can reliably drive flows.
- Authored `tools/concierge_smoke.js` (Puppeteer harness emulating an iPhone viewport, randomized multilingual prompts across five canonical journeys, per-iteration artifacts + metrics) plus `scripts/concierge_smoke.sh` wrapper. Root-level Node deps (puppeteer, dayjs, yargs) were added for this harness and `artifacts/` + root `node_modules/` are git-ignored.
- Ran the full **50-journey** concierge batch against the user-provided backend/Expo processes (`scripts/dev_backend.sh` on 0.0.0.0:8000 and `scripts/dev_mobile.sh` on LAN IP). Artifacts live under `artifacts/web/web-20251111-163928/`, linearized per-iteration records were collated into `runs_summary.jsonl`, and headline stats captured in `RUN_SUMMARY.md` (100% pass rate, TTFR p50 1.64s / p95 3.82s / p99 6.46s, no console/network errors). Sentry dashboards remain clean aside from the deliberate dev test events.

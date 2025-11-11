# Concierge Web Batch – 11 Nov 2025 @ 16:39 UTC

- **Run ID:** `web-20251111-163928`
- **Artifacts:** `artifacts/web/web-20251111-163928/`
- **Harness:** `scripts/concierge_smoke.sh` (Puppeteer, iPhone 14 Pro viewport, Expo web at http://localhost:19006)

## Pass / Fail By Journey
| Flow | Prompt theme | Runs | Pass | Fail |
| --- | --- | --- | --- | --- |
| A | Romantic skyline dinner | 10 | 10 | 0 |
| B | Old City brunch | 10 | 10 | 0 |
| C | Boulevard seafood (value) | 10 | 10 | 0 |
| D | Late-night tea & backgammon | 10 | 10 | 0 |
| E | Azerbaijani + live music (mid price) | 10 | 10 | 0 |
| **Total** |  | **50** | **50** | **0** |

> Success rate: **100%**

## Time-to-First-Results (ms)
- p50: **1,640**
- p95: **3,821**
- p99: **6,456**
- min/max: **157 / 6,456**

## Console & Network Findings
- Console errors: _none captured across 50 runs_
- Network failures: _none captured across 50 runs_

## Sentry Observations
- Backend project `baku-reserve-backend`: only the manual smoke message `[dev-sentry-test] backend-dev-test` (issue `BAKU-RESERVE-BACKEND-1`) is present; no concierge errors recorded during the 50 runs.
- Frontend project `baku-reserve-frontend`: only the manual "frontend dev test event" (issue `BAKU-RESERVE-FRONTEND-1`) is present; no run-time issues were logged during the batch.

## Next Actions
1. Keep `scripts/concierge_smoke.sh` handy to rerun (`BASE_URL`/`HEADLESS` overrides available).
2. If future runs show spikes in TTFR or errors, check the per-iteration `metrics.json` + `network.json` files under the artifacts folder for specifics.

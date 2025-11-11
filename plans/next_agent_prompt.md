# Next Codex Prompt – Concierge Web Run Follow-Up

You are picking up right after the 50-run concierge automation batch (`web-20251111-163928`). The artifacts for that run live at `artifacts/web/web-20251111-163928/` (results/detail screenshots, Chrome traces, per-iteration metrics, network + console logs, and `summary.json`). `runs_summary.jsonl` contains the aggregated per-iteration metrics. Use these deliverables to understand current performance, trace anomalies, and prioritize UI/concierge improvements.

Focus areas for your session:
1. **Perf fine-tuning:** Use the existing run data (TTFR p95 3.8s, p99 6.4s) to identify bottlenecks. Dive into the traces or network logs to see where time accumulates and propose/implement optimizations.
2. **Stability & debugging:** Look for subtle UI issues surfaced in the screenshots/logs (e.g., occasional 150ms TTFR outliers). Re-run `./scripts/concierge_smoke.sh 10` to validate any fixes.
3. **App upgrades:** Continue refining the concierge experience (copy, heuristics, Sentry breadcrumbs, fallback flows). Any enhancements should keep the automation selectors working (`data-testid` hooks in `ConciergeAssistantCard` and `RestaurantScreen`).

Environment reminders:
- Backend: `./scripts/dev_backend.sh` (uses `.venv`, now wired to Sentry with `/dev/sentry-test`).
- Expo/mobile: `./scripts/dev_mobile.sh` (Expo web at http://localhost:19006, also emits Sentry events).
- Automation harness: `./scripts/concierge_smoke.sh [runs]` (Puppeteer; headless by default, accepts `BASE_URL`/`OUTPUT_DIR`).

Deliverables expected next session: updated performance metrics (new run ID), notes on any fixes, and refreshed summary if improvements land.

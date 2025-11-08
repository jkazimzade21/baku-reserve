# Pre-arrival Prep (On My Way) – Manual Test Plan

## Prerequisites
1. Copy `.env.example` to `.env` and set:
   ```dotenv
   PREP_NOTIFY_ENABLED=true
   PAYMENTS_MODE=mock
   PAYMENT_PROVIDER=mock
   ```
2. Reset the demo data if you have pending reservations:
   ```bash
   ./backend/reset_backend_state.sh
   ```

## Backend
1. Create/activate the virtual environment and install dependencies (once per machine):
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements-dev.txt
   ```
2. Start the API with hot reload:
   ```bash
   ./scripts/dev_backend.sh
   ```
   The console should log `Application startup complete.` and bind to `0.0.0.0:8000`.

## Mobile
1. Install npm deps inside `mobile/` (`npm install`).
2. Launch Expo pointing at your LAN IP (script auto-detects):
   ```bash
   ./scripts/dev_mobile.sh
   ```
3. Open the Expo Go client (device or simulator) and load the bundle.

## Happy path scenario
1. Book or reuse a confirmed reservation that starts in the future.
2. On **Bookings → Reservations**, pick the reservation and tap **On My Way (Prep Food)**.
3. In the prep screen:
   - Choose an ETA (5/10/15 minutes).
   - Toggle **Starters only** vs **Full meal**.
   - Optionally list sample dishes/notes (comma or newline separated).
   - Tap **Confirm & pay deposit**.
4. Expected results:
   - A toast/alert confirms the mock payment and navigation returns to the list.
   - The reservation card shows a “Prep Accepted” badge and retains the ETA/items you entered.
   - The backend logs include a `Pre-arrival prep notify triggered` entry with reservation id + scope.

## API smoke (optional)
```bash
# Quote
curl -s -X POST http://127.0.0.1:8000/reservations/<RES_ID>/preorder/quote \
  -H 'Content-Type: application/json' \
  -d '{"minutes_away": 10, "scope": "starters"}' | jq

# Confirm (mock charge)
curl -s -X POST http://127.0.0.1:8000/reservations/<RES_ID>/preorder/confirm \
  -H 'Content-Type: application/json' \
  -d '{"minutes_away": 10, "scope": "full", "items": ["qutab"]}' | jq '.prep_status,.prep_deposit_txn_id'
```

## Mock payment semantics
- The mock gateway always returns `success=true` and fabricates ids like `mock_<uuid>`.
- Switching to a future live gateway only requires updating `PAYMENT_PROVIDER`/`PAYMENTS_MODE`; no refactor is necessary.
- Failed providers bubble a `502` with `"Payment failed (mock). Please try again."` so the mobile client can render an actionable error.

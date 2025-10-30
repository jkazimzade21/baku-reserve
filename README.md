# Baku-Reserve

**Baku-Reserve** is a restaurant reservation platform built with:

- **Backend:** FastAPI (Python 3.11+) — runs locally on http://127.0.0.1:8000  
- **Frontend:** React Native / Expo — connects to backend via LAN IP `192.168.0.148`  
- **Database:** PostgreSQL (dev environment)  
- **Testing:** `backend/tests/test_api_smoke.py`, `scripts/backend_smoketest.sh`

## Development Setup

1. Open **3 terminals**:
   - **Terminal 1:** Backend  
     ```bash
     cd ~/baku-reserve/backend
     source .venv/bin/activate
     python -m uvicorn main:app --reload
     ```
   - **Terminal 2:** Expo Metro Bundler  
     ```bash
     cd ~/baku-reserve/mobile
     npx expo start
     ```
   - **Terminal 3:** Utility / edits  
     Used for git commits, running tests, or scripts like:  
     ```bash
     ./scripts/backend_smoketest.sh
     ```

2. Verify backend:  
   ```bash
   curl http://127.0.0.1:8000/test-ai



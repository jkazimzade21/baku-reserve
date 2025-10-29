import datetime as dt
import sys
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app  # type: ignore

SESSION = TestClient(app)


def _clear_reservations() -> None:
    """Remove all reservations so tests can assert on availability deterministically."""
    response = SESSION.get("/reservations")
    response.raise_for_status()
    for record in response.json():
        SESSION.delete(f"/reservations/{record['id']}")


def _today_iso() -> str:
    return dt.date.today().isoformat()


def test_health_endpoint_reports_service_status() -> None:
    response = SESSION.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "baku-reserve"


def test_create_and_cancel_reservation_flow() -> None:
    _clear_reservations()
    day = _today_iso()
    payload = {
        "restaurant_id": "fc34a984-0b39-4f0a-afa2-5b677c61f044",
        "party_size": 2,
        "start": f"{day}T19:00:00",
        "end": f"{day}T20:30:00",
        "guest_name": "Smoke Test",
    }

    try:
        create_response = SESSION.post("/reservations", json=payload)
        assert create_response.status_code == 201
        created = create_response.json()
        assert created["id"]
        assert created["status"] == "booked"

        cancel = SESSION.post(f"/reservations/{created['id']}/cancel")
        assert cancel.status_code == 200
        assert cancel.json()["status"] == "cancelled"

        missing = SESSION.post(f"/reservations/{uuid4()}/cancel")
        assert missing.status_code == 404
    finally:
        _clear_reservations()

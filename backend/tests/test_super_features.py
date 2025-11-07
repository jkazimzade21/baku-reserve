import datetime as dt
import sys
from collections import Counter
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import DB, app  # noqa: E402

SESSION = TestClient(app)

RID = "fc34a984-0b39-4f0a-afa2-5b677c61f044"  # Sahil Bar & Restaurant


def _clear_reservations() -> None:
    resp = SESSION.get("/reservations")
    resp.raise_for_status()
    for rec in resp.json():
        SESSION.delete(f"/reservations/{rec['id']}")


@pytest.fixture(autouse=True)
def clean_state():
    _clear_reservations()
    yield
    _clear_reservations()


def _today_iso() -> str:
    return dt.date.today().isoformat()


def test_restaurant_query_filter_matches_name_cuisine_and_city():
    resp = SESSION.get("/restaurants", params={"q": "Sahil"})
    resp.raise_for_status()
    data = resp.json()
    assert any(rest["id"] == RID for rest in data)

    resp_city = SESSION.get("/restaurants", params={"q": "Baku"})
    resp_city.raise_for_status()
    assert any(rest["city"] == "Baku" for rest in resp_city.json())

    resp_cuisine = SESSION.get("/restaurants", params={"q": "Seafood"})
    resp_cuisine.raise_for_status()
    cuisines = Counter(tag for rest in resp_cuisine.json() for tag in rest.get("cuisine", []))
    assert cuisines["Seafood"] > 0


def test_list_reservations_exposes_created_records():
    day = _today_iso()
    start = f"{day}T18:00:00"
    end = f"{day}T19:30:00"
    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": start,
        "end": end,
        "guest_name": "List Guest",
    }
    created = SESSION.post("/reservations", json=payload)
    created.raise_for_status()

    all_reservations = SESSION.get("/reservations")
    all_reservations.raise_for_status()
    items = all_reservations.json()
    assert any(item["guest_name"] == "List Guest" for item in items)


def test_cancelled_reservations_release_availability_without_delete():
    day = _today_iso()
    availability_before = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    )
    availability_before.raise_for_status()
    slot_before = next(
        (
            slot
            for slot in availability_before.json()["slots"]
            if slot["start"].endswith("T12:00:00")
        ),
        None,
    )
    assert slot_before is not None, "Expected a 12:00 slot in availability feed"

    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": slot_before["start"],
        "end": slot_before["end"],
        "guest_name": "Cancel Flow",
    }
    created = SESSION.post("/reservations", json=payload)
    created.raise_for_status()
    rid = created.json()["id"]

    during = SESSION.get(f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2})
    during.raise_for_status()
    slot_during = next(
        (slot for slot in during.json()["slots"] if slot["start"] == slot_before["start"]),
        None,
    )
    assert slot_during is not None
    assert slot_during["count"] == max(0, slot_before["count"] - 1)

    cancel = SESSION.post(f"/reservations/{rid}/cancel")
    cancel.raise_for_status()

    after = SESSION.get(f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2})
    after.raise_for_status()
    slot_after = next(
        (slot for slot in after.json()["slots"] if slot["start"] == slot_before["start"]),
        None,
    )
    assert slot_after is not None
    assert slot_after["count"] == slot_before["count"]
    assert payload["restaurant_id"] == cancel.json()["restaurant_id"]
    assert cancel.json()["status"] == "cancelled"


def test_autopick_scales_with_party_size_and_selects_smallest_capacity():
    day = _today_iso()
    start = f"{day}T19:00:00"
    end = f"{day}T20:30:00"
    payload = {
        "restaurant_id": RID,
        "party_size": 5,
        "start": start,
        "end": end,
        "guest_name": "Auto Scale",
    }
    created = SESSION.post("/reservations", json=payload)
    created.raise_for_status()
    table_id = created.json()["table_id"]
    assert table_id is not None
    tables = DB._table_lookup(RID)  # type: ignore[attr-defined]
    chosen_capacity = tables[table_id]["capacity"]
    assert chosen_capacity >= payload["party_size"]
    eligible_capacities = [
        t["capacity"] for t in tables.values() if t["capacity"] >= payload["party_size"]
    ]
    assert eligible_capacities, "Expected at least one eligible table"
    assert chosen_capacity == min(eligible_capacities)
    delete_resp = SESSION.delete(f"/reservations/{created.json()['id']}")
    delete_resp.raise_for_status()


def test_invalid_status_transitions_and_missing_records():
    missing_cancel = SESSION.post(f"/reservations/{uuid4()}/cancel")
    assert missing_cancel.status_code == 404

    create_day = _today_iso()
    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": f"{create_day}T21:00:00",
        "end": f"{create_day}T22:30:00",
        "guest_name": "Status Guard",
    }
    created = SESSION.post("/reservations", json=payload)
    created.raise_for_status()
    rid = created.json()["id"]

    with pytest.raises(HTTPException):
        DB.set_status(rid, "seated")  # type: ignore[attr-defined]

    delete_resp = SESSION.delete(f"/reservations/{rid}")
    delete_resp.raise_for_status()

    repeat_delete = SESSION.delete(f"/reservations/{rid}")
    assert repeat_delete.status_code == 404


def test_availability_endpoint_requires_valid_restaurant():
    day = _today_iso()
    resp = SESSION.get(
        "/restaurants/00000000-0000-0000-0000-000000000000/availability",
        params={"date": day, "party_size": 2},
    )
    assert resp.status_code == 404

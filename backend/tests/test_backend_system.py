from __future__ import annotations

import datetime as dt
from typing import Any
from uuid import uuid4

import pytest
from backend.app.availability import availability_for_day
from backend.app.main import absolute_media_list, absolute_media_url
from backend.app.models import ReservationCreate
from backend.app.storage import DB
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

RID = "fc34a984-0b39-4f0a-afa2-5b677c61f044"  # Sahil Bar & Restaurant


def _viable_slot(client: TestClient, day: str, party_size: int = 2) -> dict[str, Any]:
    response = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": party_size},
    )
    assert response.status_code == 200
    for slot in response.json()["slots"]:
        if slot["available_table_ids"]:
            return slot
    raise AssertionError("Expected at least one available slot for the seeded data")


def _iso_today() -> str:
    return dt.date.today().isoformat()


def test_health_and_documentation_endpoints_present(client: TestClient) -> None:
    payload = client.get("/health").json()
    assert payload == {
        "ok": True,
        "service": "baku-reserve",
        "version": "0.1.0",
    }
    for path in ("/docs", "/openapi.json"):
        resp = client.get(path)
        assert resp.status_code == 200


def test_root_redirects_to_booking_console(client: TestClient) -> None:
    resp = client.get("/", follow_redirects=False)
    assert resp.status_code in (307, 308)
    assert resp.headers["location"].startswith("/book")


def test_restaurant_catalog_search_and_detail_media(client: TestClient) -> None:
    listing = client.get("/restaurants")
    assert listing.status_code == 200
    restaurants = listing.json()
    assert any(r["id"] == RID for r in restaurants)
    assert all("slug" in r for r in restaurants)
    sahil_summary = next(r for r in restaurants if r["id"] == RID)
    assert sahil_summary["slug"] == "sahil"

    filtered = client.get("/restaurants", params={"q": "Seafood"})
    assert filtered.status_code == 200
    assert all("Seafood" in " ".join(rest.get("cuisine", [])) for rest in filtered.json())

    detail = client.get(f"/restaurants/{RID}").json()
    assert detail["id"] == RID
    assert detail["slug"] == "sahil"
    assert detail["areas"], "Expected fully hydrated area/layout payload"
    assert detail["cover_photo"].startswith("http://api.testserver")
    assert all(photo.startswith("http://api.testserver") for photo in detail["photos"])


def test_floorplan_payload_contains_geometry(client: TestClient) -> None:
    resp = client.get(f"/restaurants/{RID}/floorplan")
    assert resp.status_code == 200
    data = resp.json()
    assert data["canvas"] == {"width": 1000, "height": 1000}
    assert data["areas"], "Expected at least one seating area"
    first = data["areas"][0]
    assert first["tables"], "Expected tables in seating area"
    assert {"id", "position", "capacity"}.issubset(first["tables"][0].keys())


def test_photo_assets_are_served_via_static_mount(client: TestClient) -> None:
    resp = client.get("/assets/restaurants/sahil/1.jpg")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/")


def test_availability_reflects_reservation_lifecycle(client: TestClient) -> None:
    day = _iso_today()
    slot_before = _viable_slot(client, day)
    table_id = slot_before["available_table_ids"][0]

    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": slot_before["start"],
        "end": slot_before["end"],
        "guest_name": "Availability Guard",
        "table_id": table_id,
    }
    created = client.post("/reservations", json=payload)
    assert created.status_code == 201
    resid = created.json()["id"]

    during = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": 2},
    )
    slot_during = next(s for s in during.json()["slots"] if s["start"] == slot_before["start"])
    assert slot_during["count"] == slot_before["count"] - 1
    assert table_id not in slot_during["available_table_ids"]

    delete = client.delete(f"/reservations/{resid}")
    assert delete.status_code == 200

    after = client.get(
        f"/restaurants/{RID}/availability",
        params={"date": day, "party_size": 2},
    )
    slot_after = next(s for s in after.json()["slots"] if s["start"] == slot_before["start"])
    assert slot_after["count"] == slot_before["count"]
    assert table_id in slot_after["available_table_ids"]


def test_reservation_lifecycle_and_conflict_detection(client: TestClient) -> None:
    day = _iso_today()
    slot = _viable_slot(client, day)
    table_id = slot["available_table_ids"][0]

    payload = {
        "restaurant_id": RID,
        "party_size": 2,
        "start": slot["start"],
        "end": slot["end"],
        "guest_name": "Lifecycle",
        "table_id": table_id,
    }
    created = client.post("/reservations", json=payload)
    assert created.status_code == 201
    reservation = created.json()

    listed = client.get("/reservations").json()
    assert any(item["id"] == reservation["id"] for item in listed)

    arrival_payload = {
        "lead_minutes": 10,
        "prep_scope": "starters",
        "share_location": True,
        "eta_source": "user",
    }
    intent = client.post(
        f"/reservations/{reservation['id']}/arrival_intent",
        json=arrival_payload,
    )
    assert intent.status_code == 200
    assert intent.json()["arrival_intent"]["status"] == "requested"
    location_ping = client.post(
        f"/reservations/{reservation['id']}/arrival_intent/location",
        json={"latitude": 40.3777, "longitude": 49.892},
    )
    assert location_ping.status_code == 200
    predicted = location_ping.json()["arrival_intent"].get("predicted_eta_minutes")
    assert predicted and predicted >= 5
    confirmation = client.post(
        f"/reservations/{reservation['id']}/arrival_intent/eta",
        json={"eta_minutes": predicted},
    )
    assert confirmation.status_code == 200
    approve = client.post(
        f"/reservations/{reservation['id']}/arrival_intent/decision",
        json={"action": "approve", "notes": "Chef notified"},
    )
    assert approve.status_code == 200
    assert approve.json()["arrival_intent"]["status"] == "approved"

    conflict = client.post("/reservations", json=payload)
    assert conflict.status_code == 409

    confirm = client.post(f"/reservations/{reservation['id']}/confirm")
    assert confirm.status_code == 200
    cancel = client.post(f"/reservations/{reservation['id']}/cancel")
    assert cancel.status_code == 200
    cancel_again = client.post(f"/reservations/{reservation['id']}/cancel")
    assert cancel_again.status_code == 200

    delete = client.delete(f"/reservations/{reservation['id']}")
    assert delete.status_code == 200
    missing = client.delete(f"/reservations/{reservation['id']}")
    assert missing.status_code == 404


def test_validation_and_unknown_restaurant_rejections(client: TestClient) -> None:
    day = _iso_today()
    start = f"{day}T18:00:00"
    end = f"{day}T19:30:00"

    bad_party = {
        "restaurant_id": RID,
        "party_size": 0,
        "start": start,
        "end": end,
        "guest_name": "TooSmall",
    }
    assert client.post("/reservations", json=bad_party).status_code == 422

    unknown_restaurant = {
        "restaurant_id": str(uuid4()),
        "party_size": 2,
        "start": start,
        "end": end,
        "guest_name": "Unknown",
    }
    assert client.post("/reservations", json=unknown_restaurant).status_code == 404


def test_database_autopick_selects_smallest_fitting_table() -> None:
    day = dt.date.today()
    start = dt.datetime.combine(day, dt.time(19, 0))
    end = start + dt.timedelta(hours=2)
    payload = ReservationCreate(
        restaurant_id=RID,
        party_size=5,
        start=start,
        end=end,
        guest_name="AutoPick",
    )

    reservation = DB.create_reservation(payload)
    try:
        assert reservation.table_id is not None
        tables = DB._table_lookup(RID)  # type: ignore[attr-defined]
        chosen_capacity = tables[reservation.table_id]["capacity"]
        eligible = [t["capacity"] for t in tables.values() if t["capacity"] >= payload.party_size]
        assert chosen_capacity == min(eligible)
    finally:
        DB.cancel_reservation(reservation.id)


def test_absolute_media_helpers_normalize_relative_values() -> None:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
        "scheme": "https",
        "server": ("demo.example", 443),
    }
    request = Request(scope)
    assert absolute_media_url(request, "/assets/r/1.jpg") == "https://demo.example/assets/r/1.jpg"
    assert absolute_media_url(request, "https://cdn.example/r.jpg") == "https://cdn.example/r.jpg"
    assert absolute_media_list(request, ["/a.jpg", "https://b.jpg"]) == [
        "https://demo.example/a.jpg",
        "https://b.jpg",
    ]


def test_availability_helper_blocks_shared_reservations() -> None:
    class FakeDb:
        def __init__(self) -> None:
            self.reservations = {
                "specific": {
                    "restaurant_id": RID,
                    "table_id": "t-specific",
                    "party_size": 2,
                    "start": "2025-01-01T18:00:00",
                    "end": "2025-01-01T19:30:00",
                    "status": "booked",
                },
                "shared": {
                    "restaurant_id": RID,
                    "table_id": "",
                    "party_size": 4,
                    "start": "2025-01-01T19:30:00",
                    "end": "2025-01-01T21:00:00",
                    "status": "booked",
                },
            }

        def eligible_tables(self, rid: str, party_size: int):
            return [
                {"id": "t-specific", "capacity": 2},
                {"id": "t-shared", "capacity": 4},
            ]

    fake_db = FakeDb()
    restaurant = {"id": RID}
    day = dt.date(2025, 1, 1)
    result = availability_for_day(restaurant, 2, day, fake_db)
    slots = {slot["start"]: slot for slot in result["slots"]}
    specific_slot = slots.get("2025-01-01T18:00:00")
    assert specific_slot is not None
    assert specific_slot["available_table_ids"] == ["t-shared"]

    shared_slot = slots.get("2025-01-01T19:30:00")
    assert shared_slot is not None
    assert shared_slot["available_table_ids"] == []


def test_conflicting_status_changes_are_rejected() -> None:
    day = dt.date.today()
    start = dt.datetime.combine(day, dt.time(22, 0))
    end = start + dt.timedelta(hours=1, minutes=30)
    payload = ReservationCreate(
        restaurant_id=RID,
        party_size=2,
        start=start,
        end=end,
        guest_name="Status",
    )
    reservation = DB.create_reservation(payload)
    try:
        with pytest.raises(HTTPException):
            DB.set_status(reservation.id, "seated")  # type: ignore[arg-type]
    finally:
        DB.cancel_reservation(reservation.id)

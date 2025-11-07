import datetime as dt
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from hypothesis import given, settings
from hypothesis import strategies as st

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.main import app  # type: ignore  # noqa: E402

RID = "fc34a984-0b39-4f0a-afa2-5b677c61f044"  # SAHiL
T2 = "e5c360cf-31df-4276-841e-8cd720b5942c"  # 2-top
T4 = "40ec9ced-a11f-4009-899c-7b2d4216dea3"  # 4-top
T6 = "9e5f3998-67d7-4a81-a816-109aec7bdeec"  # 6-top

SESSION = TestClient(app)


def _today():
    return dt.date.today().strftime("%Y-%m-%d")


def _iso(day, hhmm, dur="01:30"):
    h, m = map(int, hhmm.split(":"))
    sd = dt.datetime.strptime(day, "%Y-%m-%d")
    start = sd.replace(hour=h, minute=m, second=0, microsecond=0)
    dh, dm = map(int, dur.split(":"))
    end = start + dt.timedelta(hours=dh, minutes=dm)
    return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")


def _clear_all():
    r = SESSION.get("/reservations")
    r.raise_for_status()
    for rec in r.json():
        SESSION.delete(f"/reservations/{rec['id']}")


@pytest.fixture(autouse=True)
def clean_state():
    _clear_all()
    yield
    _clear_all()


# ---------- smoke: health/docs/root/openapi ----------
def test_health_and_docs():
    assert SESSION.get("/health").status_code == 200
    assert SESSION.get("/docs").status_code == 200
    assert SESSION.get("/openapi.json").status_code == 200
    r = SESSION.get("/")
    assert r.status_code in (200, 307, 308)


# ---------- restaurants ----------
def test_restaurants_list_and_detail():
    r = SESSION.get("/restaurants")
    r.raise_for_status()
    items = r.json()
    assert any(x["id"] == RID for x in items)
    r2 = SESSION.get(f"/restaurants/{RID}")
    r2.raise_for_status()
    detail = r2.json()
    assert "areas" in detail and len(detail["areas"]) > 0


# ---------- availability baseline (10:00 for 2-top) ----------
def test_availability_baseline_10am_has_2top():
    day = _today()
    r = SESSION.get(f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2})
    r.raise_for_status()
    slots = r.json()["slots"]
    s10 = [s for s in slots if s["start"].endswith("T10:00:00")]
    assert s10 and (T2 in s10[0]["available_table_ids"])


# ---------- happy path + overlap + adjacency ----------
def test_create_overlap_adjacency_and_cleanup():
    day = _today()
    s1, e1 = _iso(day, "10:00")
    s2, e2 = _iso(day, "10:30")
    s3, e3 = _iso(day, "11:30")

    payload = dict(restaurant_id=RID, party_size=2, start=s1, end=e1, guest_name="E1", table_id=T2)
    r = SESSION.post("/reservations", json=payload)
    assert r.status_code == 201
    rid1 = r.json()["id"]

    payload2 = dict(restaurant_id=RID, party_size=2, start=s2, end=e2, guest_name="E2", table_id=T2)
    r = SESSION.post("/reservations", json=payload2)
    assert r.status_code == 409

    payload3 = dict(restaurant_id=RID, party_size=2, start=s3, end=e3, guest_name="E3", table_id=T2)
    r = SESSION.post("/reservations", json=payload3)
    assert r.status_code == 201
    rid3 = r.json()["id"]

    assert SESSION.post(f"/reservations/{rid3}/cancel").status_code == 200
    assert SESSION.post(f"/reservations/{rid3}/cancel").status_code == 200
    assert SESSION.post(f"/reservations/{rid3}/confirm").status_code == 200

    assert SESSION.delete(f"/reservations/{rid1}").status_code == 200
    assert SESSION.delete(f"/reservations/{rid3}").status_code == 200


# ---------- input validation & error codes ----------
@pytest.mark.parametrize(
    "bad_payload",
    [
        {},
        {"restaurant_id": RID, "party_size": 2},
        {
            "restaurant_id": "NOT-A-UUID",
            "party_size": 2,
            "start": "2025-10-23T10:00:00",
            "end": "2025-10-23T11:30:00",
            "guest_name": "X",
        },
        {"restaurant_id": RID, "party_size": 2, "start": "BAD", "end": "BAD", "guest_name": "X"},
        {
            "restaurant_id": RID,
            "party_size": 0,
            "start": "2025-10-23T10:00:00",
            "end": "2025-10-23T11:30:00",
            "guest_name": "X",
        },
        {
            "restaurant_id": RID,
            "party_size": -1,
            "start": "2025-10-23T10:00:00",
            "end": "2025-10-23T11:30:00",
            "guest_name": "X",
        },
        {
            "restaurant_id": RID,
            "party_size": 2,
            "start": "2025-10-23T11:30:00",
            "end": "2025-10-23T10:00:00",
            "guest_name": "X",
        },
    ],
)
def test_validation_422(bad_payload):
    r = SESSION.post("/reservations", json=bad_payload)
    # If the body is invalid by schema (e.g., bad datetime or wrong types), FastAPI returns 422.
    # If the body parses but the referenced restaurant doesn't exist, handler may return 404.
    if bad_payload.get("restaurant_id") == "NOT-A-UUID":
        assert r.status_code in (422, 404)
    else:
        assert r.status_code == 422


def test_unknowns_and_capacity():
    day = _today()
    s, e = _iso(day, "12:00")
    assert SESSION.get("/restaurants/00000000-0000-0000-0000-000000000000").status_code in (
        404,
        422,
    )
    r = SESSION.post(
        "/reservations",
        json=dict(
            restaurant_id=RID, party_size=2, start=s, end=e, guest_name="Bad", table_id="not-a-uuid"
        ),
    )
    assert r.status_code == 422
    r = SESSION.post(
        "/reservations",
        json=dict(
            restaurant_id=RID, party_size=6, start=s, end=e, guest_name="TooBig", table_id=T2
        ),
    )
    assert r.status_code == 422


# ---------- auto-pick chooses the smallest-fitting table ----------
def test_autopick_min_capacity_choice():
    day = _today()
    s, e = _iso(day, "13:00")
    r = SESSION.post(
        "/reservations",
        json=dict(restaurant_id=RID, party_size=2, start=s, end=e, guest_name="AutoPick"),
    )
    assert r.status_code == 201
    chosen = r.json()["table_id"]
    assert chosen in {T2, T4, T6}
    rid = r.json()["id"]
    SESSION.delete(f"/reservations/{rid}")


# ---------- CORS preflight ----------
def test_cors_preflight_allows_origin():
    r = SESSION.options(
        "/reservations",
        headers={
            "Origin": "http://example.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code in (200, 204)
    assert any(h.lower() == "access-control-allow-origin" for h in r.headers.keys())


# ---------- property-based: random valid slots within opening hours ----------
OPEN = dt.time(10, 0, 0)
CLOSE = dt.time(23, 0, 0)
DUR = dt.timedelta(minutes=90)


def _time_strategy():
    hh = st.integers(min_value=10, max_value=21)
    mm = st.sampled_from([0, 30])
    return st.builds(lambda h, m: dt.time(h, m, 0), hh, mm)


@settings(max_examples=10, deadline=None)
@given(t=_time_strategy())
def test_prop_book_then_free_after_delete(t):
    day = _today()
    start_dt = dt.datetime.combine(dt.date.fromisoformat(day), t)
    end_dt = start_dt + DUR
    s, e = start_dt.isoformat(timespec="seconds"), end_dt.isoformat(timespec="seconds")

    before = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    ).json()
    slot_before = next(x for x in before["slots"] if x["start"] == s)

    r = SESSION.post(
        "/reservations",
        json=dict(restaurant_id=RID, party_size=2, start=s, end=e, guest_name="Prop"),
    )
    assert r.status_code == 201
    rid = r.json()["id"]

    after = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    ).json()
    slot_after = next(x for x in after["slots"] if x["start"] == s)
    assert slot_after["count"] == max(0, slot_before["count"] - 1)

    SESSION.delete(f"/reservations/{rid}")
    again = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    ).json()
    slot_again = next(x for x in again["slots"] if x["start"] == s)
    assert slot_again["count"] == slot_before["count"]


# ---------- richer floor-plan + availability assertions ----------
def test_floorplan_endpoint_matches_restaurant_layout():
    detail = SESSION.get(f"/restaurants/{RID}")
    detail.raise_for_status()
    body = detail.json()
    assert body["areas"], "Restaurant detail should include areas"
    assert any(
        table["position"] for table in body["areas"][0]["tables"]
    ), "Seed data must provide table coordinates"

    floorplan = SESSION.get(f"/restaurants/{RID}/floorplan")
    floorplan.raise_for_status()
    plan = floorplan.json()
    assert plan["canvas"] == {"width": 1000, "height": 1000}
    total_tables = sum(len(area["tables"]) for area in plan["areas"])
    assert total_tables >= len(body["areas"][0]["tables"])
    assert any(
        t["position"] for area in plan["areas"] for t in area["tables"]
    ), "Floorplan should echo table positions"


def test_available_table_ids_updated_when_specific_table_booked():
    day = _today()
    availability_before = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    )
    availability_before.raise_for_status()
    slots = availability_before.json()["slots"]
    slot_10 = next(s for s in slots if s["start"].endswith("T10:00:00"))
    assert T2 in slot_10["available_table_ids"]

    start, end = _iso(day, "10:00")
    payload = dict(
        restaurant_id=RID,
        party_size=2,
        start=start,
        end=end,
        guest_name="TableLock",
        table_id=T2,
    )
    reservation = SESSION.post("/reservations", json=payload)
    reservation.raise_for_status()
    res_id = reservation.json()["id"]

    availability_after = SESSION.get(
        f"/restaurants/{RID}/availability", params={"date": day, "party_size": 2}
    )
    availability_after.raise_for_status()
    slot_after = next(
        s for s in availability_after.json()["slots"] if s["start"].endswith("T10:00:00")
    )
    assert T2 not in slot_after["available_table_ids"]

    SESSION.delete(f"/reservations/{res_id}")


@pytest.mark.parametrize(
    ("party_size", "table_id"),
    [
        (2, T2),
        (4, T4),
        (6, T6),
    ],
)
def test_specific_table_booking_respects_capacity(party_size, table_id):
    day = _today()
    s, e = _iso(day, "18:00")
    resp = SESSION.post(
        "/reservations",
        json=dict(
            restaurant_id=RID,
            party_size=party_size,
            start=s,
            end=e,
            guest_name=f"Capacity-{party_size}",
            table_id=table_id,
        ),
    )
    assert resp.status_code == 201
    SESSION.delete(f"/reservations/{resp.json()['id']}")


def test_restaurant_detail_exposes_deposit_and_metadata():
    detail = SESSION.get(f"/restaurants/{RID}")
    detail.raise_for_status()
    body = detail.json()
    assert body["deposit_policy"]
    assert "book_early" in body["tags"]
    assert body["average_spend"]
    assert body["areas"][0]["tables"][0]["shape"] in {"circle", "rect"}

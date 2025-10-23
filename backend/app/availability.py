from datetime import datetime, time, timedelta, date
from typing import Any, Dict, List

RES_DURATION = timedelta(minutes=90)
INTERVAL = timedelta(minutes=30)
OPEN = time(10, 0)
CLOSE = time(23, 0)

def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return not (a_end <= b_start or a_start >= b_end)

def _iso_parse(s: str) -> datetime:
    return datetime.fromisoformat(s)

def availability_for_day(restaurant: Any, party_size: int, day: date, db) -> Dict[str, Any]:
    """
    Returns: {"slots":[{"start":iso,"end":iso,"available_table_ids":[...],"count":N}, ...]}
    Only considers reservations with status == "booked".
    """
    rid = str(restaurant.get("id"))

    # Tables that fit the party
    tables: List[Dict[str, Any]] = []
    for area in (restaurant.get("areas") or []):
        for t in (area.get("tables") or []):
            cap = int(t.get("capacity", 2) or 2)
            if cap >= party_size:
                tables.append(t)

    # Existing booked reservations for that date, same restaurant
    todays = []
    for r in db.reservations.values():
        if str(r.get("restaurant_id")) != rid:
            continue
        if r.get("status", "booked") != "booked":
            continue
        try:
            rs = _iso_parse(str(r["start"]))
            re = _iso_parse(str(r["end"]))
        except Exception:
            continue
        if rs.date() == day:
            todays.append({"table_id": str(r.get("table_id")), "start": rs, "end": re})

    slots = []
    cur = datetime.combine(day, OPEN)
    last_start = datetime.combine(day, CLOSE) - RES_DURATION

    while cur <= last_start:
        slot_end = cur + RES_DURATION
        free_ids: List[str] = []
        for t in tables:
            tid = str(t.get("id"))
            taken = any(
                (rt["table_id"] == tid) and _overlaps(cur, slot_end, rt["start"], rt["end"])
                for rt in todays
            )
            if not taken:
                free_ids.append(tid)

        slots.append({
            "start": cur.isoformat(timespec="seconds"),
            "end": slot_end.isoformat(timespec="seconds"),
            "available_table_ids": free_ids,
            "count": len(free_ids),
        })
        cur += INTERVAL

    return {"slots": slots}

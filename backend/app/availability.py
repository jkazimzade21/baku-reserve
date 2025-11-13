from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

RES_DURATION = timedelta(minutes=90)
INTERVAL = timedelta(minutes=30)
OPEN = time(10, 0)
CLOSE = time(23, 0)
DEFAULT_TIMEZONE = "Asia/Baku"


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return not (a_end <= b_start or a_start >= b_end)


def _iso_parse(s: str) -> datetime:
    return datetime.fromisoformat(s)


def _resolve_timezone(tz_name: str | None) -> ZoneInfo:
    name = tz_name or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TIMEZONE)


def _normalize_timezone(dt: datetime, tz: ZoneInfo) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def availability_for_day(restaurant: Any, party_size: int, day: date, db) -> dict[str, Any]:
    """
    Returns: {"slots":[{"start":iso,"end":iso,"available_table_ids":[...],"count":N}, ...]}
    Only considers reservations with status == "booked".
    """
    if isinstance(restaurant, dict):
        rid = str(restaurant.get("id"))
        restaurant_tz = restaurant.get("timezone") or DEFAULT_TIMEZONE
    else:
        rid = str(getattr(restaurant, "id"))
        restaurant_tz = getattr(restaurant, "timezone", DEFAULT_TIMEZONE) or DEFAULT_TIMEZONE
    tzinfo = _resolve_timezone(restaurant_tz)

    # Tables that fit the party
    tables: list[dict[str, Any]] = db.eligible_tables(rid, party_size)

    # Existing booked reservations for that date, same restaurant
    todays: list[dict[str, Any]] = []
    for r in db.reservations.values():
        if str(r.get("restaurant_id")) != rid:
            continue
        if r.get("status", "booked") != "booked":
            continue
        try:
            rs = _normalize_timezone(_iso_parse(str(r["start"])), tzinfo)
            re = _normalize_timezone(_iso_parse(str(r["end"])), tzinfo)
        except Exception:
            continue
        if rs.date() == day:
            todays.append({"table_id": str(r.get("table_id") or ""), "start": rs, "end": re})

    bookings_by_table: dict[str, list[tuple[datetime, datetime]]] = {}
    shared_blocks: list[tuple[datetime, datetime]] = []
    for booking in todays:
        block = (booking["start"], booking["end"])
        tid = booking["table_id"]
        if tid:
            bookings_by_table.setdefault(tid, []).append(block)
        else:
            shared_blocks.append(block)

    slots = []
    cur = datetime.combine(day, OPEN, tzinfo=tzinfo)
    last_start = datetime.combine(day, CLOSE, tzinfo=tzinfo) - RES_DURATION

    while cur <= last_start:
        slot_end = cur + RES_DURATION
        free_ids: list[str] = []
        for t in tables:
            tid = str(t.get("id"))
            taken = False
            for rs, re in bookings_by_table.get(tid, ()):
                if _overlaps(cur, slot_end, rs, re):
                    taken = True
                    break
            if not taken:
                for rs, re in shared_blocks:
                    if _overlaps(cur, slot_end, rs, re):
                        taken = True
                        break
            if not taken:
                free_ids.append(tid)

        slots.append(
            {
                "start": cur.isoformat(timespec="seconds"),
                "end": slot_end.isoformat(timespec="seconds"),
                "available_table_ids": free_ids,
                "count": len(free_ids),
            }
        )
        cur += INTERVAL

    return {"slots": slots, "restaurant_timezone": restaurant_tz}

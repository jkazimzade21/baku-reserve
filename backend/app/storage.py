from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from shutil import copy2
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from .models import ArrivalIntent, Reservation, ReservationCreate
from .settings import settings

DATA_DIR = settings.data_dir
LEGACY_DATA_DIR = Path(__file__).resolve().parent / "data"
RES_PATH = DATA_DIR / "reservations.json"
PREP_FIELDS = (
    "prep_eta_minutes",
    "prep_request_time",
    "prep_items",
    "prep_scope",
    "prep_status",
    "prep_deposit_amount_minor",
    "prep_deposit_currency",
    "prep_deposit_txn_id",
    "prep_policy",
)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


def _dump_intent(intent: ArrivalIntent | None) -> dict[str, Any] | None:
    if not intent:
        return None
    payload = intent.model_dump()
    for key in ("last_signal", "traffic_updated_at"):
        value = payload.get(key)
        if isinstance(value, datetime):
            payload[key] = _iso(value)
    return payload


def _bootstrap_file(filename: str, fallback: str | None = None) -> None:
    target = DATA_DIR / filename
    if target.exists():
        return
    legacy_file = LEGACY_DATA_DIR / filename
    if legacy_file.exists():
        copy2(legacy_file, target)
        return
    if fallback is not None:
        target.write_text(fallback, encoding="utf-8")
    else:
        target.touch()


_bootstrap_file("restaurants.json", "[]\n")
_bootstrap_file("reservations.json", '{"reservations": []}\n')


class Database:
    """
    Demo DB:
      - Restaurants seeded here with stable ids.
      - Reservations persist to the configured data directory (defaults to ~/.baku-reserve-data)
    """

    def __init__(self) -> None:
        seed_path = DATA_DIR / "restaurants.json"
        try:
            raw = seed_path.read_text(encoding="utf-8")
        except FileNotFoundError:
            seed_restaurants: list[dict[str, Any]] = []
        else:
            raw = raw.strip()
            if not raw:
                seed_restaurants = []
            else:
                try:
                    seed_restaurants = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise RuntimeError(f"Invalid restaurant seed data: {seed_path}") from exc

        normalised: list[dict[str, Any]] = []
        for item in seed_restaurants:
            if not isinstance(item, dict):
                continue
            entry = dict(item)
            entry_id = entry.get("id") or uuid4()
            entry["id"] = str(entry_id)
            slug = entry.get("slug")
            if slug:
                entry["slug"] = str(slug)
            elif entry.get("name"):
                entry["slug"] = str(entry["name"]).lower().replace(" ", "-")
            entry.setdefault("city", "Baku")
            entry["requires_deposit"] = bool(
                entry.get("requires_deposit") or entry.get("deposit_policy")
            )
            normalised.append(entry)

        self.restaurants: dict[str, dict[str, Any]] = {r["id"]: r for r in normalised}
        self._restaurants_by_slug: dict[str, dict[str, Any]] = {
            str(r.get("slug")).lower(): r for r in normalised if r.get("slug")
        }

        self._restaurant_summaries: list[dict[str, Any]] = []
        self._summary_index: list[tuple[dict[str, Any], str]] = []
        self._tables_cache: dict[str, list[tuple[dict[str, Any], int]]] = {}
        self._table_lookup_cache: dict[str, dict[str, dict[str, Any]]] = {}

        for r in normalised:
            rid = r["id"]
            cover = r.get("cover_photo") or (r["photos"][0] if r.get("photos") else "")
            summary = {
                "id": rid,
                "name": r["name"],
                "slug": r.get("slug"),
                "cuisine": r.get("cuisine", []),
                "city": r.get("city"),
                "cover_photo": cover,
                "short_description": r.get("short_description"),
                "price_level": r.get("price_level"),
                "tags": r.get("tags", []),
                "average_spend": r.get("average_spend"),
                "requires_deposit": bool(r.get("requires_deposit")),
            }
            self._restaurant_summaries.append(summary)
            search_text = " ".join(
                [
                    r.get("name", ""),
                    r.get("city", ""),
                    r.get("slug", ""),
                    " ".join(r.get("cuisine", []) or []),
                ]
            ).lower()
            self._summary_index.append((summary, search_text))

            table_entries: list[tuple[dict[str, Any], int]] = []
            for area in r.get("areas") or []:
                for t in area.get("tables") or []:
                    cap = int(t.get("capacity", 2) or 2)
                    table_entries.append((t, cap))
            table_entries.sort(key=lambda entry: entry[1])
            self._tables_cache[rid] = table_entries
            self._table_lookup_cache[rid] = {str(t.get("id")): t for t, _ in table_entries}

        self.reservations: dict[str, dict[str, Any]] = {}
        self._load()

    # -------- helpers --------
    def _tables_for_restaurant(self, rid: str) -> list[dict[str, Any]]:
        return [table for table, _ in self._tables_cache.get(rid, [])]

    def _table_lookup(self, rid: str) -> dict[str, dict[str, Any]]:
        return self._table_lookup_cache.get(rid, {})

    def eligible_tables(self, rid: str, party_size: int) -> list[dict[str, Any]]:
        return [table for table, cap in self._tables_cache.get(rid, []) if cap >= party_size]

    @staticmethod
    def _overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
        return not (a_end <= b_start or b_end <= a_start)

    # -------- restaurants --------
    def list_restaurants(self, q: str | None = None) -> list[dict[str, Any]]:
        if not q:
            return [dict(summary) for summary in self._restaurant_summaries]
        qlow = q.lower().strip()
        if not qlow:
            return [dict(summary) for summary in self._restaurant_summaries]
        return [dict(summary) for summary, search in self._summary_index if qlow in search]

    def get_restaurant(self, rid: str) -> dict[str, Any] | None:
        rid_str = str(rid)
        if rid_str in self.restaurants:
            return self.restaurants[rid_str]
        return self._restaurants_by_slug.get(rid_str.lower())

    # -------- reservations --------
    def list_reservations(self) -> list[dict[str, Any]]:
        return list(self.reservations.values())

    def create_reservation(self, payload: ReservationCreate) -> Reservation:
        rid = str(payload.restaurant_id)

        if payload.party_size < 1:
            raise HTTPException(status_code=422, detail="party_size must be >= 1")
        start = (
            payload.start if isinstance(payload.start, datetime) else _parse_iso(str(payload.start))
        )
        end = payload.end if isinstance(payload.end, datetime) else _parse_iso(str(payload.end))
        if end <= start:
            raise HTTPException(status_code=422, detail="end must be after start")

        if rid not in self.restaurants:
            raise HTTPException(status_code=404, detail="Restaurant not found")

        tables_by_id = self._table_lookup(rid)
        # resolve table
        if payload.table_id:
            tid = str(payload.table_id)
            if tid not in tables_by_id:
                raise HTTPException(
                    status_code=422, detail="table_id does not belong to restaurant"
                )
            if tables_by_id[tid].get("capacity", 1) < payload.party_size:
                raise HTTPException(status_code=422, detail="party_size exceeds table capacity")
            table_id = tid
        else:
            table_id = None
            for table, cap in self._tables_cache.get(rid, []):
                if cap >= payload.party_size:
                    table_id = str(table.get("id"))
                    break
            if not table_id and self._tables_cache.get(rid):
                table_id = str(self._tables_cache[rid][-1][0].get("id"))

        # conflict check (booked only)
        for r in self.reservations.values():
            if str(r["restaurant_id"]) != rid:
                continue
            if r.get("status", "booked") != "booked":
                continue
            if table_id and r.get("table_id") and str(r["table_id"]) != table_id:
                continue
            rs = _parse_iso(r["start"]) if isinstance(r["start"], str) else r["start"]
            re = _parse_iso(r["end"]) if isinstance(r["end"], str) else r["end"]
            if self._overlap(start, end, rs, re):
                raise HTTPException(status_code=409, detail="Selected table/time is already booked")

        new_id = str(uuid4())
        base_rec = {
            "id": new_id,
            "restaurant_id": rid,
            "table_id": table_id,
            "party_size": payload.party_size,
            "start": _iso(start),
            "end": _iso(end),
            "guest_name": payload.guest_name,
            "guest_phone": payload.guest_phone or "",
            "status": "booked",
            "arrival_intent": _dump_intent(ArrivalIntent()) or {},
        }
        for field in PREP_FIELDS:
            base_rec[field] = None
        rec = base_rec
        self.reservations[new_id] = rec
        self._save()

        return Reservation(**{**rec, "start": start, "end": end, "arrival_intent": ArrivalIntent()})

    def set_status(self, resid: str, status: str) -> dict[str, Any] | None:
        if resid not in self.reservations:
            return None
        if status not in ("booked", "cancelled"):
            raise HTTPException(status_code=422, detail="invalid status")
        self.reservations[resid]["status"] = status
        self._save()
        return self.reservations[resid]

    def cancel_reservation(self, resid: str) -> dict[str, Any] | None:
        # Hard delete (used by existing DELETE route)
        out = self.reservations.pop(str(resid), None)
        if out is not None:
            self._save()
        return out

    def get_reservation(self, resid: str) -> dict[str, Any] | None:
        return self.reservations.get(str(resid))

    def set_arrival_intent(self, resid: str, intent: ArrivalIntent) -> dict[str, Any] | None:
        record = self.reservations.get(str(resid))
        if not record:
            return None
        record["arrival_intent"] = _dump_intent(intent) or {}
        self._save()
        return record

    def update_reservation(self, resid: str, **fields: Any) -> dict[str, Any] | None:
        record = self.reservations.get(str(resid))
        if not record:
            return None
        for key, value in fields.items():
            record[key] = value
        self._save()
        return record

    # -------- persistence --------
    def _save(self) -> None:
        reservations: list[dict[str, Any]] = []
        for r in self.reservations.values():
            record = dict(r)
            for key in ("start", "end", "prep_request_time"):
                if key in record and isinstance(record[key], datetime):
                    record[key] = _iso(record[key])
            reservations.append(record)
        data = {"reservations": reservations}
        RES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def _load(self) -> None:
        if not RES_PATH.exists():
            return
        try:
            raw = json.loads(RES_PATH.read_text() or "{}")
        except Exception:
            self.reservations = {}
            return

        cleaned: dict[str, dict[str, Any]] = {}
        for r in raw.get("reservations", []):
            try:
                rid = str(r.get("id") or uuid4())
                rest_id = str(r["restaurant_id"])
                start = _parse_iso(str(r["start"]))
                end = _parse_iso(str(r["end"]))
                if end <= start:
                    continue
                party = int(r["party_size"])
                if party < 1:
                    continue
                status = r.get("status", "booked")
                if status not in ("booked", "cancelled"):
                    status = "booked"
                cleaned_record = {
                    "id": rid,
                    "restaurant_id": rest_id,
                    "table_id": r.get("table_id"),
                    "party_size": party,
                    "start": _iso(start),
                    "end": _iso(end),
                    "guest_name": str(r.get("guest_name", "")),
                    "guest_phone": str(r.get("guest_phone", "")),
                    "status": status,
                    "arrival_intent": r.get("arrival_intent")
                    or _dump_intent(ArrivalIntent())
                    or {},
                }
                for field in PREP_FIELDS:
                    cleaned_record[field] = r.get(field)
                cleaned[rid] = cleaned_record
            except Exception:
                continue
        self.reservations = cleaned


# Single instance
DB = Database()

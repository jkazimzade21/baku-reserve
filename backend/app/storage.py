from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import HTTPException
from .models import Reservation, ReservationCreate

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
RES_PATH = DATA_DIR / "reservations.json"

def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")

def _parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)

class Database:
    """
    Demo DB:
      - Restaurants seeded here with stable ids.
      - Reservations persist to app/data/reservations.json
    """
    def __init__(self) -> None:
        # --- restaurants ---
        self.restaurants: Dict[str, Dict[str, Any]] = {
            "fc34a984-0b39-4f0a-afa2-5b677c61f044": {
                "id": "fc34a984-0b39-4f0a-afa2-5b677c61f044",
                "name": "SAHiL Bar & Restaurant",
                "cuisine": ["Azerbaijani", "Seafood"],
                "city": "Baku",
                "address": "Seaside Boulevard, Baku",
                "phone": "+994 12 000 00 00",
                "photos": ["https://picsum.photos/seed/sahil/800/500"],
                "cover_photo": "https://picsum.photos/seed/sahil/800/500",
                "areas": [
                    {
                        "id": "a-sahil-main",
                        "name": "Main Hall",
                        "tables": [
                            {"id": "e5c360cf-31df-4276-841e-8cd720b5942c", "name": "T1", "capacity": 2},
                            {"id": "cc67ebfe-9fad-427f-87c1-d591304fcce5", "name": "T2", "capacity": 2},
                            {"id": "40ec9ced-a11f-4009-899c-7b2d4216dea3", "name": "T3", "capacity": 4},
                            {"id": "b79563ac-0f21-4b3a-9b50-c2b6ba2a3b18", "name": "T4", "capacity": 4},
                            {"id": "9e5f3998-67d7-4a81-a816-109aec7bdeec", "name": "T5", "capacity": 6},
                        ],
                    }
                ],
            },
            "e43356ca-448a-4257-a76c-716b9f13937b": {
                "id": "e43356ca-448a-4257-a76c-716b9f13937b",
                "name": "Günaydın Steakhouse (Bulvar)",
                "cuisine": ["Steakhouse", "Turkish"],
                "city": "Baku",
                "address": "Bulvar Mall, Baku",
                "phone": "+994 12 111 11 11",
                "photos": ["https://picsum.photos/seed/gunaydin/800/500"],
                "cover_photo": "https://picsum.photos/seed/gunaydin/800/500",
                "areas": [
                    {
                        "id": "a-gunaydin-main",
                        "name": "Main Hall",
                        "tables": [
                            {"id": "f1e1b8e1-aaaa-4b11-9aaa-111111111111", "name": "A1", "capacity": 2},
                            {"id": "f1e1b8e1-bbbb-4b22-9bbb-222222222222", "name": "A2", "capacity": 4},
                            {"id": "f1e1b8e1-cccc-4b33-9ccc-333333333333", "name": "A3", "capacity": 6},
                        ],
                    }
                ],
            },
            "7cb45fee-78d6-46cf-a9fd-a8299e47e4fa": {
                "id": "7cb45fee-78d6-46cf-a9fd-a8299e47e4fa",
                "name": "Mari Vanna",
                "cuisine": ["Eastern European", "Russian"],
                "city": "Baku",
                "address": "Old City, Baku",
                "phone": "+994 12 222 22 22",
                "photos": ["https://picsum.photos/seed/marivanna/800/500"],
                "cover_photo": "https://picsum.photos/seed/marivanna/800/500",
                "areas": [
                    {
                        "id": "a-marivanna-main",
                        "name": "Main Hall",
                        "tables": [
                            {"id": "mvt-1", "name": "M1", "capacity": 2},
                            {"id": "mvt-2", "name": "M2", "capacity": 4},
                            {"id": "mvt-3", "name": "M3", "capacity": 6},
                        ],
                    }
                ],
            },
        }

        self.reservations: Dict[str, Dict[str, Any]] = {}
        self._load()

    # -------- helpers --------
    def _tables_for_restaurant(self, rid: str) -> List[Dict[str, Any]]:
        r = self.restaurants.get(rid)
        tables: List[Dict[str, Any]] = []
        if not r:
            return tables
        for area in (r.get("areas") or []):
            for t in (area.get("tables") or []):
                tables.append(t)
        return tables

    def _table_lookup(self, rid: str) -> Dict[str, Dict[str, Any]]:
        return {str(t["id"]): t for t in self._tables_for_restaurant(rid)}

    @staticmethod
    def _overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
        return not (a_end <= b_start or b_end <= a_start)

    # -------- restaurants --------
    def list_restaurants(self, q: Optional[str] = None) -> List[Dict[str, Any]]:
        items = list(self.restaurants.values())
        if q:
            qlow = q.lower()
            items = [
                r for r in items
                if qlow in r["name"].lower()
                or any(qlow in c.lower() for c in r.get("cuisine", []))
                or qlow in r.get("city", "").lower()
            ]
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "cuisine": r["cuisine"],
                "city": r["city"],
                "cover_photo": r.get("cover_photo") or (r["photos"][0] if r.get("photos") else ""),
            }
            for r in items
        ]

    def get_restaurant(self, rid: str) -> Optional[Dict[str, Any]]:
        return self.restaurants.get(str(rid))

    # -------- reservations --------
    def list_reservations(self) -> List[Dict[str, Any]]:
        return list(self.reservations.values())

    def create_reservation(self, payload: ReservationCreate) -> Reservation:
        rid = str(payload.restaurant_id)

        if payload.party_size < 1:
            raise HTTPException(status_code=422, detail="party_size must be >= 1")
        start = payload.start if isinstance(payload.start, datetime) else _parse_iso(str(payload.start))
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
                raise HTTPException(status_code=422, detail="table_id does not belong to restaurant")
            if tables_by_id[tid].get("capacity", 1) < payload.party_size:
                raise HTTPException(status_code=422, detail="party_size exceeds table capacity")
            table_id = tid
        else:
            table_id = None
            candidates = sorted(tables_by_id.values(), key=lambda t: t.get("capacity", 2))
            for t in candidates:
                if t.get("capacity", 2) >= payload.party_size:
                    table_id = str(t["id"])
                    break
            if not table_id and candidates:
                table_id = str(candidates[-1]["id"])

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
        rec = {
            "id": new_id,
            "restaurant_id": rid,
            "table_id": table_id,
            "party_size": payload.party_size,
            "start": _iso(start),
            "end": _iso(end),
            "guest_name": payload.guest_name,
            "guest_phone": payload.guest_phone or "",
            "status": "booked",
        }
        self.reservations[new_id] = rec
        self._save()

        return Reservation(**{**rec, "start": start, "end": end})

    def set_status(self, resid: str, status: str) -> Optional[Dict[str, Any]]:
        if resid not in self.reservations:
            return None
        if status not in ("booked", "cancelled"):
            raise HTTPException(status_code=422, detail="invalid status")
        self.reservations[resid]["status"] = status
        self._save()
        return self.reservations[resid]

    def cancel_reservation(self, resid: str) -> Optional[Dict[str, Any]]:
        # Hard delete (used by existing DELETE route)
        out = self.reservations.pop(str(resid), None)
        if out is not None:
            self._save()
        return out

    # -------- persistence --------
    def _save(self) -> None:
        data = {
            "reservations": [
                {
                    **{k: v for k, v in r.items() if k not in ("start", "end")},
                    "start": r["start"] if isinstance(r["start"], str) else _iso(r["start"]),
                    "end": r["end"] if isinstance(r["end"], str) else _iso(r["end"]),
                }
                for r in self.reservations.values()
            ]
        }
        RES_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    def _load(self) -> None:
        if not RES_PATH.exists():
            return
        try:
            raw = json.loads(RES_PATH.read_text() or "{}")
        except Exception:
            self.reservations = {}
            return

        cleaned: Dict[str, Dict[str, Any]] = {}
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
                cleaned[rid] = {
                    "id": rid,
                    "restaurant_id": rest_id,
                    "table_id": r.get("table_id"),
                    "party_size": party,
                    "start": _iso(start),
                    "end": _iso(end),
                    "guest_name": str(r.get("guest_name", "")),
                    "guest_phone": str(r.get("guest_phone", "")),
                    "status": status,
                }
            except Exception:
                continue
        self.reservations = cleaned

# Single instance
DB = Database()

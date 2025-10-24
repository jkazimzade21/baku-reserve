from fastapi import FastAPI, HTTPException, Query
from uuid import UUID
from typing import Optional, Any, Dict
from datetime import date, datetime

from .schemas import RestaurantListItem
from .models import ReservationCreate, Reservation

from .storage import DB
from .utils import add_cors
from .availability import availability_for_day
from .ui import router as ui_router

app = FastAPI(title="Baku Reserve API", version="0.1.0")
add_cors(app)
app.include_router(ui_router)

@app.get("/health")
def health():
    return {"ok": True, "service": "baku-reserve", "version": "0.1.0"}

# ---------- helpers ----------
def get_attr(o: Any, key: str, default=None):
    if isinstance(o, dict):
        return o.get(key, default)
    return getattr(o, key, default)

def restaurant_to_list_item(r: Any) -> Dict[str, Any]:
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "cover_photo": (get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0]),
    }

def restaurant_to_detail(r: Any) -> Dict[str, Any]:
    areas = []
    for a in (get_attr(r, "areas", []) or []):
        tables = []
        for t in (get_attr(a, "tables", []) or []):
            tables.append({
                "id": str(get_attr(t, "id")),
                "name": get_attr(t, "name") or f"Table {str(get_attr(t, 'id'))[:6]}",
                "capacity": int(get_attr(t, "capacity", 2) or 2),
            })
        areas.append({
            "id": str(get_attr(a, "id")),
            "name": get_attr(a, "name") or "Area",
            "tables": tables,
        })
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "address": get_attr(r, "address") or "",
        "phone": get_attr(r, "phone") or "",
        "photos": list(get_attr(r, "photos", []) or []),
        "areas": areas,
    }

def rec_to_reservation(rec: Dict[str, Any]) -> Reservation:
    return Reservation(
        id=str(rec["id"]),
        restaurant_id=str(rec["restaurant_id"]),
        table_id=str(rec.get("table_id")) if rec.get("table_id") else None,
        party_size=int(rec["party_size"]),
        start=datetime.fromisoformat(str(rec["start"])) if isinstance(rec["start"], str) else rec["start"],
        end=datetime.fromisoformat(str(rec["end"])) if isinstance(rec["end"], str) else rec["end"],
        guest_name=str(rec.get("guest_name", "")),
        guest_phone=str(rec.get("guest_phone", "")) if rec.get("guest_phone") else None,
        status=str(rec.get("status", "booked")),
    )

# ---------- root redirect to docs ----------
@app.get("/", include_in_schema=False)
def root_redirect():
    # Redirect to docs for convenience when you hit the base URL in a browser.
    return {"detail": "See /docs"}, 307

# ---------- endpoints ----------
@app.get("/restaurants", response_model=list[RestaurantListItem])
def list_restaurants(q: Optional[str] = None):
    items = DB.list_restaurants(q)
    return [restaurant_to_list_item(r) for r in items]

@app.get("/restaurants/{rid}")
def get_restaurant(rid: UUID):
    r = DB.get_restaurant(str(rid))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return restaurant_to_detail(r)

@app.get("/restaurants/{rid}/floorplan")
def get_floorplan(rid: UUID):
    r = DB.get_restaurant(str(rid))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    canvas = {"width": 1000, "height": 1000}
    areas = []
    for a in (get_attr(r, "areas", []) or []):
        tables = []
        for t in (get_attr(a, "tables", []) or []):
            tables.append({
                "id": str(get_attr(t, "id")),
                "name": get_attr(t, "name"),
                "capacity": int(get_attr(t, "capacity", 2) or 2),
                "position": get_attr(t, "position"),
                "shape": get_attr(t, "shape"),
            })
        areas.append({"id": str(get_attr(a, "id")), "name": get_attr(a, "name"), "tables": tables})
    return {"canvas": canvas, "areas": areas}

@app.post("/reservations", response_model=Reservation, status_code=201)
def create_reservation(payload: ReservationCreate):
    try:
        res = DB.create_reservation(payload)
        return res
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(409, str(e))

@app.post("/reservations/{resid}/cancel", response_model=Reservation)
def soft_cancel_reservation(resid: UUID):
    rec = DB.set_status(str(resid), "cancelled")
    if not rec:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(rec)

@app.post("/reservations/{resid}/confirm", response_model=Reservation)
def confirm_reservation(resid: UUID):
    rec = DB.set_status(str(resid), "booked")
    if not rec:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(rec)

@app.delete("/reservations/{resid}", response_model=Reservation)
def hard_delete_reservation(resid: UUID):
    r = DB.cancel_reservation(str(resid))
    if not r:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(r)

@app.get("/restaurants/{rid}/availability")
def availability(rid: UUID, date_: date = Query(..., alias="date"), party_size: int = 2):
    r = DB.get_restaurant(str(rid))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return availability_for_day(r, party_size, date_, DB)

@app.get("/reservations")
def list_reservations():
    return DB.list_reservations()

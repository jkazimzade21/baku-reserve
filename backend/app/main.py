from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse

from .availability import availability_for_day
from .models import Reservation, ReservationCreate
from .schemas import RestaurantListItem
from .storage import DB
from .ui import router as ui_router
from .utils import add_cors

DateQuery = Annotated[date, Query(alias="date")]

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


def restaurant_to_list_item(r: Any) -> dict[str, Any]:
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "cover_photo": (get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0]),
        "short_description": get_attr(r, "short_description"),
        "price_level": get_attr(r, "price_level"),
        "tags": list(get_attr(r, "tags", []) or []),
        "average_spend": get_attr(r, "average_spend"),
        "requires_deposit": bool(get_attr(r, "deposit_policy")),
    }


def restaurant_to_detail(r: Any) -> dict[str, Any]:
    areas = []
    for a in get_attr(r, "areas", []) or []:
        tables = []
        for t in get_attr(a, "tables", []) or []:
            geometry = get_attr(t, "geometry") or {}
            footprint = get_attr(t, "footprint")
            if not footprint and isinstance(geometry, dict):
                footprint = geometry.get("footprint")
            table_payload = {
                "id": str(get_attr(t, "id")),
                "name": get_attr(t, "name") or f"Table {str(get_attr(t, 'id'))[:6]}",
                "capacity": int(get_attr(t, "capacity", 2) or 2),
                "position": (
                    get_attr(t, "position") or geometry.get("position")
                    if isinstance(geometry, dict)
                    else None
                ),
                "shape": get_attr(t, "shape"),
                "tags": list(get_attr(t, "tags", []) or []),
                "category": get_attr(t, "category"),
                "noise_level": get_attr(t, "noise_level"),
                "featured": bool(get_attr(t, "featured")),
                "rotation": get_attr(t, "rotation"),
                "footprint": footprint,
            }
            if isinstance(geometry, dict) and geometry:
                table_payload["geometry"] = geometry
            tables.append(table_payload)
        landmarks = []
        for landmark in get_attr(a, "landmarks", []) or []:
            landmarks.append(
                {
                    "id": str(get_attr(landmark, "id")),
                    "label": get_attr(landmark, "label"),
                    "type": get_attr(landmark, "type"),
                    "position": get_attr(landmark, "position"),
                    "footprint": get_attr(landmark, "footprint"),
                }
            )
        area_payload = {
            "id": str(get_attr(a, "id")),
            "name": get_attr(a, "name") or "Area",
            "tables": tables,
        }
        theme = get_attr(a, "theme")
        if isinstance(theme, dict) and theme:
            area_payload["theme"] = theme
        if landmarks:
            area_payload["landmarks"] = landmarks
        areas.append(area_payload)
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "address": get_attr(r, "address") or "",
        "phone": get_attr(r, "phone") or "",
        "photos": list(get_attr(r, "photos", []) or []),
        "cover_photo": (get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0]),
        "short_description": get_attr(r, "short_description") or "",
        "neighborhood": get_attr(r, "neighborhood"),
        "price_level": get_attr(r, "price_level"),
        "tags": list(get_attr(r, "tags", []) or []),
        "highlights": list(get_attr(r, "highlights", []) or []),
        "deposit_policy": get_attr(r, "deposit_policy"),
        "map_images": list(get_attr(r, "map_images", []) or []),
        "latitude": get_attr(r, "latitude"),
        "longitude": get_attr(r, "longitude"),
        "menu_url": get_attr(r, "menu_url"),
        "instagram": get_attr(r, "instagram"),
        "whatsapp": get_attr(r, "whatsapp"),
        "average_spend": get_attr(r, "average_spend"),
        "dress_code": get_attr(r, "dress_code"),
        "experiences": list(get_attr(r, "experiences", []) or []),
        "areas": areas,
    }


def rec_to_reservation(rec: dict[str, Any]) -> Reservation:
    return Reservation(
        id=str(rec["id"]),
        restaurant_id=str(rec["restaurant_id"]),
        table_id=str(rec.get("table_id")) if rec.get("table_id") else None,
        party_size=int(rec["party_size"]),
        start=(
            datetime.fromisoformat(str(rec["start"]))
            if isinstance(rec["start"], str)
            else rec["start"]
        ),
        end=datetime.fromisoformat(str(rec["end"])) if isinstance(rec["end"], str) else rec["end"],
        guest_name=str(rec.get("guest_name", "")),
        guest_phone=str(rec.get("guest_phone", "")) if rec.get("guest_phone") else None,
        status=str(rec.get("status", "booked")),
    )


# ---------- root redirect to docs ----------
@app.get("/", include_in_schema=False)
def root_redirect():
    # Redirect browsers straight to the booking console.
    return RedirectResponse(url="/book/", status_code=307)


# ---------- endpoints ----------
@app.get("/restaurants", response_model=list[RestaurantListItem])
def list_restaurants(q: str | None = None):
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
    for a in get_attr(r, "areas", []) or []:
        tables = []
        for t in get_attr(a, "tables", []) or []:
            geometry = get_attr(t, "geometry") or {}
            tables.append(
                {
                    "id": str(get_attr(t, "id")),
                    "name": get_attr(t, "name"),
                    "capacity": int(get_attr(t, "capacity", 2) or 2),
                    "position": (
                        get_attr(t, "position") or geometry.get("position")
                        if isinstance(geometry, dict)
                        else None
                    ),
                    "shape": get_attr(t, "shape"),
                    "tags": list(get_attr(t, "tags", []) or []),
                    "rotation": get_attr(t, "rotation"),
                    "footprint": get_attr(t, "footprint")
                    or (geometry.get("footprint") if isinstance(geometry, dict) else None),
                    "geometry": geometry if isinstance(geometry, dict) and geometry else None,
                }
            )
        areas.append(
            {
                "id": str(get_attr(a, "id")),
                "name": get_attr(a, "name"),
                "tables": tables,
                "theme": get_attr(a, "theme"),
                "landmarks": get_attr(a, "landmarks"),
            }
        )
    return {"canvas": canvas, "areas": areas}


@app.post("/reservations", response_model=Reservation, status_code=201)
def create_reservation(payload: ReservationCreate):
    try:
        res = DB.create_reservation(payload)
        return res
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


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
def availability(rid: UUID, date_: DateQuery, party_size: int = 2):
    r = DB.get_restaurant(str(rid))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return availability_for_day(r, party_size, date_, DB)


@app.get("/reservations")
def list_reservations():
    return DB.list_reservations()

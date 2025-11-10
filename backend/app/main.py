import logging
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .auth import require_auth
from .availability import availability_for_day
from .maps import build_fallback_eta, compute_eta_with_traffic, search_places
from .models import (
    ArrivalEtaConfirmation,
    ArrivalIntent,
    ArrivalIntentDecision,
    ArrivalIntentRequest,
    ArrivalLocationPing,
    GeocodeResult,
    Reservation,
    ReservationCreate,
)
from .schemas import (
    PreorderConfirmRequest,
    PreorderQuoteResponse,
    PreorderRequest,
    RestaurantListItem,
)
from .settings import settings
from .storage import DB
from .ui import router as ui_router
from .utils import add_cors

DateQuery = Annotated[date, Query(alias="date")]
AuthClaims = Annotated[dict[str, Any], Depends(require_auth)]
REPO_ROOT = Path(__file__).resolve().parents[2]
PHOTO_DIR = (REPO_ROOT / "IGPics").resolve()

app = FastAPI(title="Baku Reserve API", version="0.1.0")
add_cors(app)
app.include_router(ui_router)
if PHOTO_DIR.exists():
    app.mount(
        "/assets/restaurants", StaticFiles(directory=str(PHOTO_DIR)), name="restaurant-photos"
    )

logger = logging.getLogger(__name__)


@app.get("/health")
def health():
    return {"ok": True, "service": "baku-reserve", "version": "0.1.0"}


@app.get("/config/features")
def feature_flags():
    gomap_ready = bool(settings.GOMAP_GUID)
    return {
        "prep_notify_enabled": settings.PREP_NOTIFY_ENABLED,
        "payments_mode": settings.PAYMENTS_MODE,
        "payment_provider": settings.PAYMENT_PROVIDER,
        "currency": settings.CURRENCY,
        "maps_api_key_present": gomap_ready,
        "gomap_ready": gomap_ready,
    }


@app.get("/maps/geocode", response_model=list[GeocodeResult])
def geocode(query: str = Query(..., min_length=2, max_length=80)):
    results = search_places(query)
    formatted: list[GeocodeResult] = []
    for item in results[:10]:
        try:
            formatted.append(
                GeocodeResult(
                    id=str(item.get("id")),
                    name=str(item.get("name")),
                    place_name=str(item.get("place_name")),
                    latitude=float(item.get("latitude")),
                    longitude=float(item.get("longitude")),
                    provider=item.get("provider"),
                )
            )
        except Exception:
            continue
    return formatted


# ---------- helpers ----------
def get_attr(o: Any, key: str, default=None):
    if isinstance(o, dict):
        return o.get(key, default)
    return getattr(o, key, default)


def absolute_media_url(request: Request | None, value: str | None) -> str | None:
    if not value:
        return value
    if not request:
        return value
    raw = str(value).strip()
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    normalized = raw if raw.startswith("/") else f"/{raw}"
    base = str(request.base_url).rstrip("/")
    return f"{base}{normalized}"


def absolute_media_list(request: Request | None, values: list[str]) -> list[str]:
    return [absolute_media_url(request, value) or value for value in values]


def _maybe_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _ensure_prep_feature_enabled() -> None:
    if not settings.PREP_NOTIFY_ENABLED:
        raise HTTPException(status_code=404, detail="Feature disabled")


def _sanitize_items(items: list[str] | None) -> list[str] | None:
    if not items:
        return None
    cleaned = [item.strip() for item in items if isinstance(item, str) and item.strip()]
    return cleaned or None


def _prep_policy(record: dict[str, Any]) -> str:
    restaurant = DB.get_restaurant(str(record.get("restaurant_id")))
    policy = None
    if restaurant:
        policy = restaurant.get("prep_policy") or restaurant.get("deposit_policy")
    resolved = (policy or settings.PREP_POLICY_TEXT or "").strip()
    return resolved or settings.PREP_POLICY_TEXT


def _build_prep_plan(record: dict[str, Any], scope: str, minutes_away: int) -> tuple[int, str]:
    policy = _prep_policy(record)
    recommended = max(5, min(int(minutes_away or 5), 90))
    if scope == "full":
        recommended = max(recommended, 10)
    return recommended, policy


def notify_restaurant(reservation: dict[str, Any], context: dict[str, Any]) -> None:
    logger.info(
        "Pre-arrival prep notify triggered",
        extra={
            "reservation_id": reservation.get("id"),
            "minutes_away": context.get("minutes_away"),
            "scope": context.get("scope"),
        },
    )


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _estimate_eta_minutes(distance_km: float, buffer_min: int = 3) -> int:
    # Assume city driving average 32 km/h.
    travel_minutes = (distance_km / 32) * 60 if distance_km else 0
    return max(5, int(travel_minutes + buffer_min))


def restaurant_to_list_item(r: Any, request: Request | None = None) -> dict[str, Any]:
    slug_value = get_attr(r, "slug")
    return {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "slug": str(slug_value) if slug_value else None,
        "cuisine": list(get_attr(r, "cuisine", []) or []),
        "city": get_attr(r, "city"),
        "neighborhood": get_attr(r, "neighborhood"),
        "address": get_attr(r, "address"),
        "cover_photo": absolute_media_url(
            request,
            get_attr(r, "cover_photo") or (get_attr(r, "photos", []) or [None])[0],
        ),
        "short_description": get_attr(r, "short_description"),
        "price_level": get_attr(r, "price_level"),
        "tags": list(get_attr(r, "tags", []) or []),
        "average_spend": get_attr(r, "average_spend"),
    }


def restaurant_to_detail(r: Any, request: Request | None = None) -> dict[str, Any]:
    slug_value = get_attr(r, "slug")
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
    payload = {
        "id": str(get_attr(r, "id")),
        "name": get_attr(r, "name"),
        "slug": str(slug_value) if slug_value else None,
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
        "map_images": list(get_attr(r, "map_images", []) or []),
        "latitude": get_attr(r, "latitude"),
        "longitude": get_attr(r, "longitude"),
        "directions_url": get_attr(r, "directions_url"),
        "menu_url": get_attr(r, "menu_url"),
        "instagram": get_attr(r, "instagram"),
        "whatsapp": get_attr(r, "whatsapp"),
        "average_spend": get_attr(r, "average_spend"),
        "dress_code": get_attr(r, "dress_code"),
        "experiences": list(get_attr(r, "experiences", []) or []),
        "areas": areas,
    }
    photos = payload.get("photos") or []
    payload["photos"] = absolute_media_list(request, photos)
    payload["cover_photo"] = absolute_media_url(request, payload.get("cover_photo"))
    payload["map_images"] = absolute_media_list(request, payload.get("map_images", []))
    return payload


def rec_to_reservation(rec: dict[str, Any]) -> Reservation:
    arrival_payload = rec.get("arrival_intent") or {}
    arrival_intent = None
    try:
        arrival_intent = ArrivalIntent(**arrival_payload)
    except Exception:
        arrival_intent = None
    raw_items = rec.get("prep_items")
    prep_items = None
    if isinstance(raw_items, list):
        prep_items = [str(item) for item in raw_items if isinstance(item, str)] or None
    elif isinstance(raw_items, str):
        prep_items = [raw_items]
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
        arrival_intent=arrival_intent,
        prep_eta_minutes=rec.get("prep_eta_minutes"),
        prep_request_time=_maybe_datetime(rec.get("prep_request_time")),
        prep_items=prep_items,
        prep_scope=rec.get("prep_scope"),
        prep_status=rec.get("prep_status"),
        prep_policy=rec.get("prep_policy"),
    )


# ---------- root redirect to docs ----------
@app.get("/", include_in_schema=False)
def root_redirect():
    # Redirect browsers straight to the booking console.
    return RedirectResponse(url="/book/", status_code=307)


# ---------- endpoints ----------
@app.get("/restaurants", response_model=list[RestaurantListItem])
def list_restaurants(request: Request, q: str | None = None):
    items = DB.list_restaurants(q)
    return [restaurant_to_list_item(r, request) for r in items]


@app.get("/restaurants/{rid}")
def get_restaurant(rid: UUID, request: Request):
    r = DB.get_restaurant(str(rid))
    if not r:
        raise HTTPException(404, "Restaurant not found")
    return restaurant_to_detail(r, request)


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
def create_reservation(payload: ReservationCreate, _: AuthClaims):
    try:
        res = DB.create_reservation(payload)
        return res
    except HTTPException as e:
        raise e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e


@app.post("/reservations/{resid}/cancel", response_model=Reservation)
def soft_cancel_reservation(resid: UUID, _: AuthClaims):
    rec = DB.set_status(str(resid), "cancelled")
    if not rec:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(rec)


@app.post("/reservations/{resid}/confirm", response_model=Reservation)
def confirm_reservation(resid: UUID, _: AuthClaims):
    rec = DB.set_status(str(resid), "booked")
    if not rec:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(rec)


@app.post("/reservations/{resid}/preorder/quote", response_model=PreorderQuoteResponse)
def preorder_quote(resid: UUID, payload: PreorderRequest, _: AuthClaims):
    _ensure_prep_feature_enabled()
    record = _require_reservation(resid)
    recommended, policy = _build_prep_plan(record, payload.scope, payload.minutes_away)
    return PreorderQuoteResponse(
        policy=policy,
        recommended_prep_minutes=recommended,
    )


@app.post("/reservations/{resid}/preorder/confirm", response_model=Reservation)
def preorder_confirm(resid: UUID, payload: PreorderConfirmRequest, _: AuthClaims):
    _ensure_prep_feature_enabled()
    record = _require_reservation(resid)
    _, policy = _build_prep_plan(record, payload.scope, payload.minutes_away)

    items = _sanitize_items(payload.normalized_items)
    now = datetime.utcnow()
    updated = DB.update_reservation(
        str(resid),
        prep_eta_minutes=payload.minutes_away,
        prep_scope=payload.scope,
        prep_request_time=now,
        prep_items=items,
        prep_status="accepted",
        prep_policy=policy,
    )
    if not updated:
        raise HTTPException(404, "Reservation not found")

    notify_restaurant(
        updated,
        {
            "minutes_away": payload.minutes_away,
            "scope": payload.scope,
            "items": items or [],
        },
    )
    return rec_to_reservation(updated)


@app.delete("/reservations/{resid}", response_model=Reservation)
def hard_delete_reservation(resid: UUID, _: AuthClaims):
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
def list_reservations(_: AuthClaims):
    return DB.list_reservations()


@app.get("/auth/session", response_model=dict)
def session_info(claims: AuthClaims):
    return {
        "user": {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "name": claims.get("name"),
        }
    }


def _require_reservation(resid: UUID) -> dict[str, Any]:
    record = DB.get_reservation(str(resid))
    if not record:
        raise HTTPException(404, "Reservation not found")
    if record.get("status") != "booked":
        raise HTTPException(409, "Reservation is not active")
    return record


@app.post("/reservations/{resid}/arrival_intent", response_model=Reservation)
def request_arrival_intent(resid: UUID, payload: ArrivalIntentRequest, _: AuthClaims):
    _require_reservation(resid)
    intent = ArrivalIntent(
        status="requested",
        lead_minutes=payload.lead_minutes,
        prep_scope=payload.prep_scope,
        eta_source=payload.eta_source,
        share_location=payload.share_location,
        last_signal=datetime.utcnow(),
        notes=payload.notes,
        auto_charge=payload.auto_charge,
    )
    updated = DB.set_arrival_intent(str(resid), intent)
    return rec_to_reservation(updated)


@app.post("/reservations/{resid}/arrival_intent/decision", response_model=Reservation)
def decide_arrival_intent(resid: UUID, payload: ArrivalIntentDecision, _: AuthClaims):
    record = _require_reservation(resid)
    current_payload = record.get("arrival_intent") or {}
    current = ArrivalIntent(**current_payload) if current_payload else ArrivalIntent()
    if current.status == "idle":
        raise HTTPException(409, "No arrival intent to update")
    status_map = {
        "approve": "approved",
        "queue": "queued",
        "reject": "rejected",
        "cancel": "cancelled",
    }
    intent = current.model_copy(
        update={
            "status": status_map[payload.action],
            "notes": payload.notes or current.notes,
            "last_signal": datetime.utcnow(),
        }
    )
    updated = DB.set_arrival_intent(str(resid), intent)
    return rec_to_reservation(updated)


@app.post("/reservations/{resid}/arrival_intent/location", response_model=Reservation)
def arrival_location_ping(resid: UUID, payload: ArrivalLocationPing, _: AuthClaims):
    record = _require_reservation(resid)
    restaurant = DB.get_restaurant(record["restaurant_id"])
    if not restaurant:
        raise HTTPException(404, "Restaurant not found")
    if not restaurant.get("latitude") or not restaurant.get("longitude"):
        raise HTTPException(422, "Restaurant is missing coordinates")
    dest_lat = float(restaurant["latitude"])
    dest_lon = float(restaurant["longitude"])
    distance = _haversine_km(payload.latitude, payload.longitude, dest_lat, dest_lon)
    eta_result = compute_eta_with_traffic(payload.latitude, payload.longitude, dest_lat, dest_lon)
    if not eta_result:
        eta_result = build_fallback_eta(distance, _estimate_eta_minutes(distance))
    current = ArrivalIntent(**(record.get("arrival_intent") or {}))
    signal_time = datetime.utcnow()
    intent = current.model_copy(
        update={
            "predicted_eta_minutes": eta_result.eta_minutes,
            "predicted_eta_seconds": eta_result.eta_seconds,
            "typical_eta_minutes": eta_result.typical_eta_minutes,
            "eta_source": "location",
            "share_location": True,
            "last_signal": signal_time,
            "last_location": {"latitude": payload.latitude, "longitude": payload.longitude},
            "route_distance_km": eta_result.route_distance_km or round(distance, 2),
            "route_summary": eta_result.route_summary,
            "traffic_condition": eta_result.traffic_condition,
            "traffic_source": eta_result.provider,
            "traffic_updated_at": signal_time,
        }
    )
    updated = DB.set_arrival_intent(str(resid), intent)
    return rec_to_reservation(updated)


@app.post("/reservations/{resid}/arrival_intent/eta", response_model=Reservation)
def confirm_arrival_eta(resid: UUID, payload: ArrivalEtaConfirmation, _: AuthClaims):
    record = _require_reservation(resid)
    current = ArrivalIntent(**(record.get("arrival_intent") or {}))
    if current.status == "idle":
        raise HTTPException(409, "No arrival intent to confirm")
    intent = current.model_copy(
        update={
            "confirmed_eta_minutes": payload.eta_minutes,
            "eta_source": current.eta_source or "user",
            "last_signal": datetime.utcnow(),
        }
    )
    updated = DB.set_arrival_intent(str(resid), intent)
    return rec_to_reservation(updated)

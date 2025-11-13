from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ...auth import require_auth
from ...contracts import (
    ArrivalEtaConfirmation,
    ArrivalIntent,
    ArrivalIntentDecision,
    ArrivalIntentRequest,
    ArrivalLocationPing,
    ArrivalLocationSuggestion,
    Reservation,
    ReservationCreate,
)
from ...maps import build_fallback_eta, compute_eta_with_traffic
from ...schemas import PreorderConfirmRequest, PreorderQuoteResponse, PreorderRequest
from ...settings import settings
from ...storage import DB
from ..utils import (
    build_prep_plan,
    ensure_prep_feature_enabled,
    ensure_reservation_owner,
    estimate_eta_minutes,
    haversine_km,
    notify_restaurant,
    rec_to_reservation,
    require_active_reservation,
    sanitize_items,
)

router = APIRouter(tags=["reservations"])


def _scope_tokens(claims: dict[str, Any]) -> set[str]:
    raw = claims.get("scope")
    if isinstance(raw, str):
        return {token for token in raw.split() if token}
    if isinstance(raw, list | tuple | set):
        return {str(token) for token in raw if str(token).strip()}
    return set()


def _is_reservations_admin(claims: dict[str, Any]) -> bool:
    scopes = _scope_tokens(claims)
    return any(scope in scopes for scope in ("reservations:admin", "reservations:all"))


def _owner_id_from_claims(claims: dict[str, Any]) -> str | None:
    sub = claims.get("sub")
    if isinstance(sub, str):
        trimmed = sub.strip()
        if trimmed:
            return trimmed
    return None


def _search_places_proxy(*args, **kwargs):
    from ... import main as main_module

    return main_module.search_places(*args, **kwargs)


def _route_directions_proxy(*args, **kwargs):
    from ... import main as main_module

    return main_module.route_directions(*args, **kwargs)


@router.get("/reservations")
def list_reservations(claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    if not is_admin and not owner_id:
        raise HTTPException(401, "Missing subject claim")
    return DB.list_reservations(None if is_admin else owner_id)


@router.post("/reservations", response_model=Reservation, status_code=201)
def create_reservation(payload: ReservationCreate, claims: dict[str, Any] = Depends(require_auth)):
    owner_id = _owner_id_from_claims(claims)
    if not owner_id:
        raise HTTPException(401, "Missing subject claim")
    try:
        return DB.create_reservation(payload, owner_id=owner_id)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/reservations/{resid}/cancel", response_model=Reservation)
def soft_cancel_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(DB.get_reservation(str(resid)), owner_id, is_admin)
    record = DB.set_status(str(resid), "cancelled")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.post("/reservations/{resid}/confirm", response_model=Reservation)
def confirm_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(DB.get_reservation(str(resid)), owner_id, is_admin)
    record = DB.set_status(str(resid), "booked")
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.delete("/reservations/{resid}", response_model=Reservation)
def hard_delete_reservation(resid: UUID, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    ensure_reservation_owner(DB.get_reservation(str(resid)), owner_id, is_admin)
    record = DB.cancel_reservation(str(resid))
    if not record:
        raise HTTPException(404, "Reservation not found")
    return rec_to_reservation(record)


@router.post("/reservations/{resid}/preorder/quote", response_model=PreorderQuoteResponse)
def preorder_quote(resid: UUID, payload: PreorderRequest, claims: dict[str, Any] = Depends(require_auth)):
    ensure_prep_feature_enabled()
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    recommended, policy = build_prep_plan(record, payload.scope, payload.minutes_away)
    return PreorderQuoteResponse(policy=policy, recommended_prep_minutes=recommended)


@router.post("/reservations/{resid}/preorder/confirm", response_model=Reservation)
def preorder_confirm(resid: UUID, payload: PreorderConfirmRequest, claims: dict[str, Any] = Depends(require_auth)):
    ensure_prep_feature_enabled()
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    _, policy = build_prep_plan(record, payload.scope, payload.minutes_away)
    items = sanitize_items(payload.normalized_items)
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
    notify_restaurant(updated, {"minutes_away": payload.minutes_away, "scope": payload.scope, "items": items or []})
    return rec_to_reservation(updated)


@router.get(
    "/reservations/{resid}/arrival_intent/suggestions",
    response_model=list[ArrivalLocationSuggestion],
)
async def arrival_location_suggestions(
    resid: UUID,
    q: str = Query(..., min_length=1, max_length=80),
    claims: dict[str, Any] = Depends(require_auth),
    limit: int = Query(5, ge=1, le=8),
):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    restaurant = DB.get_restaurant(record["restaurant_id"])
    if not restaurant:
        raise HTTPException(404, "Restaurant not found")
    try:
        dest_lat = float(restaurant["latitude"])
        dest_lon = float(restaurant["longitude"])
    except (TypeError, ValueError, KeyError):
        raise HTTPException(422, "Restaurant is missing coordinates")

    query = q.strip()
    if not query:
        return []

    user_lat = None
    user_lon = None
    arrival_intent = record.get("arrival_intent")
    if arrival_intent:
        loc = arrival_intent.get("current_location") or arrival_intent.get("last_location")
    else:
        loc = None
    if loc:
        user_lat = loc.get("latitude")
        user_lon = loc.get("longitude")

    try:
        raw_results = await asyncio.to_thread(
            _search_places_proxy,
            query,
            origin_lat=user_lat,
            origin_lon=user_lon,
            limit=limit,
            use_fuzzy=True,
            language=settings.GOMAP_DEFAULT_LANGUAGE,
        )
    except Exception:
        raw_results = await asyncio.to_thread(_search_places_proxy, query, limit=limit)

    suggestions: list[dict[str, Any]] = []
    for row in raw_results:
        lat = row.get("latitude")
        lon = row.get("longitude")
        if lat is None or lon is None:
            continue
        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            continue
        if "distance_meters" in row and row["distance_meters"] is not None:
            user_distance_km = row["distance_meters"] / 1000.0
        else:
            user_distance_km = None
        distance_km = round(haversine_km(lat_f, lon_f, dest_lat, dest_lon), 2)
        if distance_km > settings.MAX_SUGGESTION_DISTANCE_KM:
            continue
        # Distance text calculation removed - not used in fallback mode
        fallback_minutes = estimate_eta_minutes(distance_km)
        suggestions.append(
            {
                "id": str(row.get("id") or row.get("name") or f"{lat_f:.4f},{lon_f:.4f}"),
                "name": str(row.get("name") or row.get("place_name") or query),
                "address": row.get("address") or row.get("place_name"),
                "latitude": lat_f,
                "longitude": lon_f,
                "distance_km": distance_km,
                "eta_minutes": fallback_minutes,
                "eta_seconds": fallback_minutes * 60,
                "route_summary": None,
                "provider": str(row.get("provider") or "gomap"),
            }
        )
        if len(suggestions) >= limit:
            break

    detailed_slots = min(len(suggestions), settings.MAX_SUGGESTION_ROUTE_DETAILS)
    if detailed_slots:
        preview_tasks = [
            asyncio.to_thread(
                _route_directions_proxy,
                candidate["latitude"],
                candidate["longitude"],
                dest_lat,
                dest_lon,
            )
            for candidate in suggestions[:detailed_slots]
        ]
        previews = await asyncio.gather(*preview_tasks, return_exceptions=True)
        for idx, route in enumerate(previews):
            if isinstance(route, Exception) or not route:
                continue
            candidate = suggestions[idx]
            if route.distance_km is not None:
                candidate["distance_km"] = round(route.distance_km, 2)
            if route.duration_seconds:
                seconds = max(1, int(route.duration_seconds))
                candidate["eta_seconds"] = seconds
                candidate["eta_minutes"] = max(1, (seconds + 59) // 60)
            candidate["route_summary"] = route.notice

    return [ArrivalLocationSuggestion(**item) for item in suggestions]


@router.post("/reservations/{resid}/arrival_intent", response_model=Reservation)
def request_arrival_intent(resid: UUID, payload: ArrivalIntentRequest, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
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


@router.post("/reservations/{resid}/arrival_intent/decision", response_model=Reservation)
def decide_arrival_intent(resid: UUID, payload: ArrivalIntentDecision, claims: dict[str, Any] = Depends(require_auth)):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
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


@router.post("/reservations/{resid}/arrival_intent/location", response_model=Reservation)
async def arrival_location_ping(
    resid: UUID, payload: ArrivalLocationPing, claims: dict[str, Any] = Depends(require_auth)
):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
    restaurant = DB.get_restaurant(record["restaurant_id"])
    if not restaurant:
        raise HTTPException(404, "Restaurant not found")
    if not restaurant.get("latitude") or not restaurant.get("longitude"):
        raise HTTPException(422, "Restaurant is missing coordinates")
    dest_lat = float(restaurant["latitude"])
    dest_lon = float(restaurant["longitude"])

    current_intent = ArrivalIntent(**(record.get("arrival_intent") or {}))
    if current_intent.last_signal and current_intent.last_location:
        time_since_last = (datetime.utcnow() - current_intent.last_signal).total_seconds()
        if time_since_last < settings.LOCATION_PING_MIN_INTERVAL_SECONDS:
            raise HTTPException(
                429,
                f"Location updates are limited to once every {settings.LOCATION_PING_MIN_INTERVAL_SECONDS} seconds. "
                f"Please wait {int(settings.LOCATION_PING_MIN_INTERVAL_SECONDS - time_since_last)} more seconds.",
            )
        last_lat = current_intent.last_location.get("latitude")
        last_lon = current_intent.last_location.get("longitude")
        if last_lat and last_lon:
            distance_moved = haversine_km(payload.latitude, payload.longitude, last_lat, last_lon) * 1000
            if distance_moved < settings.LOCATION_PING_MIN_DISTANCE_METERS:
                current_intent.last_signal = datetime.utcnow()
                updated = DB.set_arrival_intent(str(resid), current_intent)
                return rec_to_reservation(updated)

    distance = haversine_km(payload.latitude, payload.longitude, dest_lat, dest_lon)
    eta_result = await asyncio.to_thread(
        compute_eta_with_traffic,
        payload.latitude,
        payload.longitude,
        dest_lat,
        dest_lon,
    )
    if not eta_result:
        eta_result = build_fallback_eta(distance, estimate_eta_minutes(distance))
    signal_time = datetime.utcnow()
    summary = eta_result.route_summary
    if eta_result.calibration_note:
        summary = f"{summary} · {eta_result.calibration_note}" if summary else eta_result.calibration_note
    location_payload = {"latitude": payload.latitude, "longitude": payload.longitude}
    intent = current_intent.model_copy(
        update={
            "predicted_eta_minutes": eta_result.eta_minutes,
            "predicted_eta_seconds": eta_result.eta_seconds,
            "typical_eta_minutes": eta_result.typical_eta_minutes,
            "eta_source": "location",
            "share_location": True,
            "last_signal": signal_time,
            "last_location": location_payload,
            "current_location": location_payload,
            "route_distance_km": eta_result.route_distance_km or round(distance, 2),
            "route_summary": summary,
            "traffic_condition": eta_result.traffic_condition,
            "traffic_source": eta_result.provider,
            "traffic_updated_at": signal_time,
        }
    )
    updated = DB.set_arrival_intent(str(resid), intent)
    return rec_to_reservation(updated)


@router.post("/reservations/{resid}/arrival_intent/eta", response_model=Reservation)
def confirm_arrival_eta(
    resid: UUID, payload: ArrivalEtaConfirmation, claims: dict[str, Any] = Depends(require_auth)
):
    is_admin = _is_reservations_admin(claims)
    owner_id = _owner_id_from_claims(claims)
    record = require_active_reservation(str(resid), owner_id=owner_id, allow_admin=is_admin)
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

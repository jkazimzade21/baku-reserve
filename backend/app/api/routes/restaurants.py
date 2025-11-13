from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from ...availability import availability_for_day
from ...contracts import GeocodeResult, Restaurant, RestaurantListItem
from ...input_validation import sanitize_query
from ...maps import build_fallback_eta, compute_eta_with_traffic, search_places
from ...serializers import get_attr, restaurant_to_detail, restaurant_to_list_item
from ...storage import DB
from ..types import CoordinateString, DateQuery, RestaurantSearch
from ..utils import estimate_eta_minutes, haversine_km, parse_coordinate_string

router = APIRouter(tags=["restaurants"])


@router.get("/restaurants", response_model=list[RestaurantListItem])
def list_restaurants(request: Request, q: RestaurantSearch = None):
    items = DB.list_restaurants(q)
    return [restaurant_to_list_item(r, request) for r in items]


@router.get("/restaurants/{rid}", response_model=Restaurant)
def get_restaurant(rid: UUID, request: Request):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return restaurant_to_detail(record, request)


@router.get("/restaurants/{rid}/floorplan")
def get_floorplan(rid: UUID):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    canvas = {"width": 1000, "height": 1000}
    areas = []
    for area in get_attr(record, "areas", []) or []:
        tables = []
        for table in get_attr(area, "tables", []) or []:
            geometry = get_attr(table, "geometry") or {}
            tables.append(
                {
                    "id": str(get_attr(table, "id")),
                    "name": get_attr(table, "name"),
                    "capacity": int(get_attr(table, "capacity", 2) or 2),
                    "position": (
                        get_attr(table, "position") or geometry.get("position")
                        if isinstance(geometry, dict)
                        else None
                    ),
                    "shape": get_attr(table, "shape"),
                    "tags": list(get_attr(table, "tags", []) or []),
                    "rotation": get_attr(table, "rotation"),
                    "footprint": get_attr(table, "footprint")
                    or (geometry.get("footprint") if isinstance(geometry, dict) else None),
                    "geometry": geometry if isinstance(geometry, dict) and geometry else None,
                }
            )
        areas.append(
            {
                "id": str(get_attr(area, "id")),
                "name": get_attr(area, "name"),
                "tables": tables,
                "theme": get_attr(area, "theme"),
                "landmarks": get_attr(area, "landmarks"),
            }
        )
    return {"canvas": canvas, "areas": areas}


@router.get("/restaurants/{rid}/availability")
def restaurant_availability(rid: UUID, date_: DateQuery, party_size: int = 2):
    record = DB.get_restaurant(str(rid))
    if not record:
        raise HTTPException(404, "Restaurant not found")
    return availability_for_day(record, party_size, date_, DB)


@router.get("/directions")
async def get_directions(origin: CoordinateString, destination: CoordinateString):
    try:
        origin_lat, origin_lon = parse_coordinate_string(origin)
        dest_lat, dest_lon = parse_coordinate_string(destination)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except HTTPException as exc:
        raise HTTPException(400, exc.detail) from exc

    eta = await asyncio.to_thread(
        compute_eta_with_traffic,
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon,
    )
    if not eta:
        distance_km = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
        fallback_minutes = estimate_eta_minutes(distance_km)
        eta = build_fallback_eta(distance_km or 1.0, fallback_minutes)

    response: dict[str, Any] = {
        "eta_minutes": eta.eta_minutes,
        "eta_seconds": eta.eta_seconds,
        "route_distance_km": eta.route_distance_km,
        "provider": eta.provider,
        "route_summary": eta.route_summary,
        "traffic_condition": eta.traffic_condition,
        "traffic_delay_minutes": eta.traffic_delay_minutes,
        "typical_eta_minutes": eta.typical_eta_minutes,
    }
    if eta.route_geometry:
        response["route_geometry"] = eta.route_geometry

    return response


@router.get("/maps/geocode", response_model=list[GeocodeResult])
async def geocode(query: str = Query(..., min_length=2, max_length=80)) -> list[GeocodeResult]:
    sanitized_query = sanitize_query(query, context="geocode query")

    results = await asyncio.to_thread(search_places, sanitized_query)
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

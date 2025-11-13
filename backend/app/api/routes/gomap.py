from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from ...gomap import (
    gomap_enabled,
    route_directions_by_type,
    route_directions_detailed,
    search_nearby_pois,
    search_nearby_pois_paginated,
    search_objects_smart,
)
from ...maps import compute_eta_with_traffic
from ...settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["gomap"])


@router.get("/search/smart", response_model=list[dict[str, Any]])
async def smart_search_endpoint(
    q: str = Query(..., min_length=1, max_length=100),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    limit: int = Query(10, ge=1, le=50),
    fuzzy: bool = Query(True),
    language: str | None = Query(None, regex="^(az|en|ru)$"),
):
    try:
        return await asyncio.to_thread(
            search_objects_smart,
            q,
            origin_lat=lat,
            origin_lon=lon,
            limit=limit,
            use_fuzzy_fallback=fuzzy,
            language=language,
        )
    except Exception as exc:  # pragma: no cover - network faults
        logger.error("Smart search failed: %s", exc)
        raise HTTPException(500, "Search service temporarily unavailable") from exc


@router.get("/search/nearby", response_model=list[dict[str, Any]])
async def nearby_pois_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(2.0, gt=0, le=50),
    limit: int = Query(20, ge=1, le=50),
    category: str | None = Query(None, max_length=50),
    language: str | None = Query(None, regex="^(az|en|ru)$"),
):
    try:
        return await asyncio.to_thread(
            search_nearby_pois,
            lat,
            lon,
            radius_km=radius_km,
            limit=limit,
            category=category,
            language=language,
        )
    except Exception as exc:
        logger.error("Nearby POI search failed: %s", exc)
        raise HTTPException(500, "Nearby search service temporarily unavailable") from exc


@router.get("/search/nearby/paginated", response_model=dict[str, Any])
async def nearby_pois_paginated_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(2.0, gt=0, le=50),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    category: str | None = Query(None, max_length=50),
    language: str | None = Query(None, regex="^(az|en|ru)$"),
):
    try:
        return await asyncio.to_thread(
            search_nearby_pois_paginated,
            lat,
            lon,
            radius_km=radius_km,
            page=page,
            per_page=per_page,
            category=category,
            language=language,
        )
    except Exception as exc:
        logger.error("Paginated nearby search failed: %s", exc)
        raise HTTPException(500, "Nearby search service temporarily unavailable") from exc


@router.get("/route/calculate")
async def calculate_route_endpoint(
    origin_lat: float = Query(..., ge=-90, le=90),
    origin_lon: float = Query(..., ge=-180, le=180),
    dest_lat: float = Query(..., ge=-90, le=90),
    dest_lon: float = Query(..., ge=-180, le=180),
    route_type: Literal["fastest", "shortest", "pedestrian"] = Query("fastest"),
    include_polyline: bool = Query(False),
    language: str | None = Query(None, regex="^(az|en|ru)$"),
):
    try:
        route = await asyncio.to_thread(
            route_directions_by_type,
            origin_lat,
            origin_lon,
            dest_lat,
            dest_lon,
            route_type,
            language,
        )
        if not route:
            raise HTTPException(404, "No route found")
        if include_polyline and route_type != "pedestrian":
            detailed = await asyncio.to_thread(
                route_directions_detailed,
                origin_lat,
                origin_lon,
                dest_lat,
                dest_lon,
                True,
                language,
            )
            if detailed and detailed.geometry:
                route.geometry = detailed.geometry
        return {
            "distance_km": route.distance_km,
            "duration_minutes": round(route.duration_seconds / 60) if route.duration_seconds else None,
            "route_type": route_type,
            "summary": route.notice,
            "geometry": route.geometry if include_polyline else None,
            "provider": "gomap",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Route calculation failed: %s", exc)
        raise HTTPException(500, "Routing service temporarily unavailable") from exc


@router.get("/route/eta-with-traffic")
async def calculate_eta_with_traffic_endpoint(
    origin_lat: float = Query(..., ge=-90, le=90),
    origin_lon: float = Query(..., ge=-180, le=180),
    dest_lat: float = Query(..., ge=-90, le=90),
    dest_lon: float = Query(..., ge=-180, le=180),
    route_type: Literal["fastest", "shortest"] = Query("fastest"),
    include_polyline: bool = Query(False),
):
    try:
        eta_result = await asyncio.to_thread(
            compute_eta_with_traffic,
            origin_lat,
            origin_lon,
            dest_lat,
            dest_lon,
        )
        if not eta_result:
            raise HTTPException(404, "No route found")
        if route_type != "fastest":
            typed_route = await asyncio.to_thread(
                route_directions_by_type,
                origin_lat,
                origin_lon,
                dest_lat,
                dest_lon,
                route_type,
                None,
            )
            if typed_route:
                eta_result.route_distance_km = typed_route.distance_km
                if typed_route.duration_seconds:
                    eta_result.typical_eta_minutes = round(typed_route.duration_seconds / 60)
        return {
            "eta_minutes": eta_result.eta_minutes,
            "eta_seconds": eta_result.eta_seconds,
            "distance_km": eta_result.route_distance_km,
            "typical_eta_minutes": eta_result.typical_eta_minutes,
            "traffic_condition": eta_result.traffic_condition,
            "traffic_delay_minutes": eta_result.traffic_delay_minutes,
            "route_type": route_type,
            "geometry": eta_result.route_geometry if include_polyline else None,
            "provider": eta_result.provider,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Traffic ETA calculation failed: %s", exc)
        raise HTTPException(500, "Traffic service temporarily unavailable") from exc


@router.get("/features/gomap")
def gomap_features_endpoint():
    return {
        "enabled": gomap_enabled(),
        "features": {
            "smart_search": True,
            "fuzzy_search": True,
            "distance_aware_search": True,
            "nearby_discovery": True,
            "route_types": ["fastest", "shortest", "pedestrian"],
            "traffic_data": settings.GOMAP_TRAFFIC_ENABLED,
            "polyline_visualization": True,
            "pagination": True,
            "max_search_results": 50,
            "max_nearby_radius_km": 50,
            "supported_languages": ["az", "en", "ru"],
            "default_language": settings.GOMAP_DEFAULT_LANGUAGE,
        },
        "limits": {
            "search_limit": 50,
            "nearby_limit": 50,
            "nearby_radius_km": 50,
            "cache_ttl_seconds": settings.GOMAP_CACHE_TTL_SECONDS,
            "timeout_seconds": settings.GOMAP_TIMEOUT_SECONDS,
        },
        "version": "2.0.0",
        "api_version": "1.6.0",
    }

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any, Literal

from .gomap import (
    GoMapRoute,
)
from .gomap import (
    get_traffic_conditions as gomap_traffic,
)
from .gomap import (
    route_directions as gomap_route,
)
from .gomap import (
    search_objects as gomap_search,  # noqa: F401 - re-export for tests
)
from .osrm import OsrmRoute
from .osrm import route as osrm_route
from .settings import settings

logger = logging.getLogger(__name__)

RouteCandidate = GoMapRoute | OsrmRoute


@dataclass
class EtaComputation:
    eta_minutes: int
    eta_seconds: int
    route_distance_km: float | None = None
    typical_eta_minutes: int | None = None
    traffic_condition: Literal["smooth", "moderate", "heavy", "severe", "unknown"] | None = None
    route_summary: str | None = None
    provider: str = "gomap"
    traffic_delay_minutes: int | None = None
    route_geometry: list[tuple[float, float]] | None = None
    calibration_note: str | None = None


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def compute_eta_with_traffic(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> EtaComputation | None:
    """Call GoMap routing to fetch driving ETA with optional traffic conditions."""

    # Get base route information
    gomap = gomap_route(origin_lat, origin_lon, dest_lat, dest_lon)
    osrm = osrm_route(origin_lat, origin_lon, dest_lat, dest_lon)

    if not gomap and not osrm:
        return None

    haversine_km = _haversine(origin_lat, origin_lon, dest_lat, dest_lon)

    def _distance_error(distance: float | None) -> float | None:
        if distance is None or not haversine_km:
            return None
        return abs(distance - haversine_km) / max(haversine_km, 0.001)

    gomap_error = _distance_error(gomap.distance_km if gomap else None)
    osrm_error = _distance_error(osrm.distance_km if osrm else None)

    base_route: RouteCandidate | None = gomap or osrm
    base_provider = "gomap" if base_route is gomap else "osrm"
    calibration_note = None

    if gomap and osrm and gomap.distance_km and osrm.distance_km:
        dist_diff = abs(gomap.distance_km - osrm.distance_km) / max(osrm.distance_km, 1e-3)
        gomap_far = gomap_error is not None and gomap_error > settings.MAP_HAVERSINE_TOLERANCE
        osrm_far = osrm_error is not None and osrm_error > settings.MAP_HAVERSINE_TOLERANCE

        if gomap_far and not osrm_far:
            base_route = osrm
            base_provider = "osrm"
            calibration_note = "calibrated via OSRM (GoMap distance high)"
        elif dist_diff > settings.MAP_DISTANCE_TOLERANCE and osrm.distance_km < gomap.distance_km:
            base_route = osrm
            base_provider = "osrm"
            calibration_note = f"calibrated via OSRM (Δ{int(dist_diff * 100)}%)"
        else:
                if gomap.duration_seconds and osrm.duration_seconds:
                    avg_seconds = int(round((gomap.duration_seconds + osrm.duration_seconds) / 2))
                    base_route = GoMapRoute(
                        distance_km=gomap.distance_km,
                        duration_seconds=avg_seconds,
                        geometry=getattr(gomap, "geometry", None),
                        notice=gomap.notice,
                    )
                base_provider = "gomap"

    distance_km = (
        base_route.distance_km
        if base_route and base_route.distance_km is not None
        else (osrm.distance_km if osrm else None)
    )
    duration_seconds = (
        base_route.duration_seconds
        if base_route and base_route.duration_seconds
        else (osrm.duration_seconds if osrm else gomap.duration_seconds if gomap else None)
    )
    if duration_seconds is None:
        return None

    # Calculate base ETA
    base_eta_seconds = max(1, duration_seconds)
    base_eta_minutes = max(1, math.ceil(base_eta_seconds / 60))

    # Initialize with base values
    eta_minutes = base_eta_minutes
    eta_seconds = base_eta_seconds
    traffic_condition = None
    traffic_delay_minutes = None

    # Try to get traffic conditions if enabled
    if settings.GOMAP_TRAFFIC_ENABLED and gomap:
        try:
            # Check traffic at origin
            origin_traffic = gomap_traffic(origin_lat, origin_lon, radius_km=2.0)
            # Check traffic at destination
            dest_traffic = gomap_traffic(dest_lat, dest_lon, radius_km=2.0)

            # Use the worse traffic condition between origin and destination
            traffic_severity = 0
            if origin_traffic and origin_traffic.severity:
                traffic_severity = origin_traffic.severity
            if dest_traffic and dest_traffic.severity:
                traffic_severity = max(traffic_severity, dest_traffic.severity)

            # Apply traffic adjustments based on severity
            if traffic_severity > 0:
                # Map severity to condition
                delays = settings.parsed_traffic_delay_factors
                if traffic_severity == 1:
                    traffic_condition = "smooth"
                elif traffic_severity == 2:
                    traffic_condition = "moderate"
                elif traffic_severity == 3:
                    traffic_condition = "heavy"
                else:
                    traffic_condition = "severe"
                delay_factor = delays.get(traffic_condition, 1.0)

                # Calculate adjusted ETA with traffic
                if delay_factor > 1.0:
                    adjusted_seconds = int(base_eta_seconds * delay_factor)
                    traffic_delay_minutes = max(0, math.ceil((adjusted_seconds - base_eta_seconds) / 60))
                    eta_seconds = adjusted_seconds
                    eta_minutes = max(1, math.ceil(eta_seconds / 60))

                    logger.info(
                        "Traffic adjustment: %s condition, %d min delay added to %d min base",
                        traffic_condition, traffic_delay_minutes, base_eta_minutes
                    )
            else:
                traffic_condition = "unknown"

        except Exception as exc:
            logger.warning("Failed to fetch traffic conditions: %s", exc)
            # Continue with base ETA if traffic check fails

    # Add configured buffer minutes
    buffer_minutes = settings.ETA_BUFFER_MINUTES
    if traffic_condition in {"heavy", "severe"}:
        buffer_minutes += settings.ETA_HEAVY_BUFFER_MINUTES
    if buffer_minutes > 0:
        eta_minutes += buffer_minutes
        eta_seconds += buffer_minutes * 60

    gomap_geometry = getattr(gomap, "geometry", None) if gomap else None
    osrm_geometry = getattr(osrm, "geometry", None) if osrm else None
    geometry = gomap_geometry if gomap_geometry is not None else osrm_geometry

    return EtaComputation(
        eta_minutes=eta_minutes,
        eta_seconds=eta_seconds,
        route_distance_km=distance_km,
        typical_eta_minutes=base_eta_minutes,
        traffic_condition=traffic_condition,
        traffic_delay_minutes=traffic_delay_minutes,
        route_summary=gomap.notice if gomap else osrm.notice if osrm else None,
        route_geometry=geometry,
        provider=base_provider,
        calibration_note=calibration_note,
    )


def build_fallback_eta(distance_km: float, fallback_minutes: int) -> EtaComputation:
    seconds = max(1, fallback_minutes * 60)
    return EtaComputation(
        eta_minutes=fallback_minutes,
        eta_seconds=seconds,
        route_distance_km=round(distance_km, 2),
        provider="fallback",
    )


__all__ = [
    "EtaComputation",
    "compute_eta_with_traffic",
    "build_fallback_eta",
    "search_places",
]


def search_places(
    query: str,
    *,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
    limit: int = 5,
    use_fuzzy: bool = True,
    language: str | None = None
) -> list[dict[str, Any]]:
    """Smart search for places with distance calculations and fuzzy matching.

    Uses an intelligent search strategy:
    1. Distance-aware search if origin coordinates provided
    2. Exact search as fallback
    3. Fuzzy search for typo tolerance if enabled

    Args:
        query: Search query (can contain typos if fuzzy enabled)
        origin_lat: Optional origin latitude for distance calculations
        origin_lon: Optional origin longitude for distance calculations
        limit: Maximum number of results
        use_fuzzy: Whether to enable fuzzy search for typo tolerance
        language: Language for results

    Returns:
        List of search results with best matching strategy
    """
    from .gomap import search_objects_smart

    # Use smart search that combines all strategies
    return search_objects_smart(
        query,
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        limit=limit,
        use_fuzzy_fallback=use_fuzzy,
        language=language
    )

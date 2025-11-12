from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any, Literal

from .gomap import route_directions as gomap_route
from .gomap import search_objects as gomap_search
from .gomap import get_traffic_conditions as gomap_traffic
from .settings import settings

logger = logging.getLogger(__name__)


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


def compute_eta_with_traffic(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> EtaComputation | None:
    """Call GoMap routing to fetch driving ETA with optional traffic conditions."""

    # Get base route information
    route = gomap_route(origin_lat, origin_lon, dest_lat, dest_lon)
    if not route or route.duration_seconds is None:
        return None

    # Calculate base ETA
    base_eta_seconds = max(1, route.duration_seconds)
    base_eta_minutes = max(1, math.ceil(base_eta_seconds / 60))

    # Initialize with base values
    eta_minutes = base_eta_minutes
    eta_seconds = base_eta_seconds
    traffic_condition = None
    traffic_delay_minutes = None

    # Try to get traffic conditions if enabled
    if settings.GOMAP_TRAFFIC_ENABLED:
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
                if traffic_severity == 1:
                    traffic_condition = "smooth"
                    delay_factor = 1.0  # No delay
                elif traffic_severity == 2:
                    traffic_condition = "moderate"
                    delay_factor = 1.15  # 15% delay
                elif traffic_severity == 3:
                    traffic_condition = "heavy"
                    delay_factor = 1.35  # 35% delay
                else:  # severity >= 4
                    traffic_condition = "severe"
                    delay_factor = 1.6  # 60% delay

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
    if settings.ETA_BUFFER_MINUTES > 0:
        eta_minutes += settings.ETA_BUFFER_MINUTES
        eta_seconds += settings.ETA_BUFFER_MINUTES * 60

    return EtaComputation(
        eta_minutes=eta_minutes,
        eta_seconds=eta_seconds,
        route_distance_km=route.distance_km,
        typical_eta_minutes=base_eta_minutes,
        traffic_condition=traffic_condition,
        traffic_delay_minutes=traffic_delay_minutes,
        route_summary=route.notice,
        route_geometry=route.geometry,
        provider="gomap",
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
    query: str, *, limit: int = 5, language: str | None = None
) -> list[dict[str, Any]]:
    return gomap_search(query, limit=limit, language=language)

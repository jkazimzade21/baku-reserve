from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

from .gomap import route_directions as gomap_route
from .gomap import search_objects as gomap_search

logger = logging.getLogger(__name__)


@dataclass
class EtaComputation:
    eta_minutes: int
    eta_seconds: int
    route_distance_km: float | None = None
    typical_eta_minutes: int | None = None
    traffic_condition: str | None = None
    route_summary: str | None = None
    provider: str = "gomap"


def compute_eta_with_traffic(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
) -> EtaComputation | None:
    """Call GoMap routing to fetch a driving ETA (ideal conditions)."""

    route = gomap_route(origin_lat, origin_lon, dest_lat, dest_lon)
    if not route or route.duration_seconds is None:
        return None

    eta_seconds = max(1, route.duration_seconds)
    eta_minutes = max(1, math.ceil(eta_seconds / 60))

    return EtaComputation(
        eta_minutes=eta_minutes,
        eta_seconds=eta_seconds,
        route_distance_km=route.distance_km,
        typical_eta_minutes=eta_minutes,
        traffic_condition=None,
        route_summary=route.notice,
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

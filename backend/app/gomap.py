from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx

from .settings import settings
from .circuit_breaker import with_circuit_breaker, CircuitOpenError
from .cache import (
    cache_route, get_cached_route,
    cache_geocode, get_cached_geocode,
    cache_traffic, get_cached_traffic,
)

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {"az", "en", "ru"}


@dataclass(slots=True)
class GoMapRoute:
    distance_km: float | None
    duration_seconds: int | None
    geometry: list[tuple[float, float]] | None = None
    notice: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(slots=True)
class GoMapTraffic:
    """Traffic conditions from GoMap API"""
    severity: int | None  # 0-4 scale: 0=no data, 1=smooth, 2=moderate, 3=heavy, 4=severe
    speed_kmh: float | None  # Current traffic speed if available
    delay_minutes: int | None  # Estimated delay due to traffic
    congestion_level: float | None  # 0.0-1.0 congestion percentage
    raw: dict[str, Any] | None = None

    @property
    def condition(self) -> str:
        """Convert severity to human-readable condition"""
        if self.severity is None or self.severity == 0:
            return "unknown"
        elif self.severity == 1:
            return "smooth"
        elif self.severity == 2:
            return "moderate"
        elif self.severity == 3:
            return "heavy"
        else:
            return "severe"


def gomap_enabled() -> bool:
    return bool(settings.GOMAP_GUID and settings.GOMAP_BASE_URL)


def _endpoint(path: str) -> str:
    base = settings.GOMAP_BASE_URL.rstrip("/")
    return f"{base}/{path.lstrip('/')}"


def _coerce_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return number


def _resolve_language(language: str | None) -> str:
    preferred = (language or settings.GOMAP_DEFAULT_LANGUAGE or "az").strip().lower()
    if preferred not in SUPPORTED_LANGUAGES:
        return settings.GOMAP_DEFAULT_LANGUAGE
    return preferred


def _parse_wrapped_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if not stripped:
        return {}
    if stripped.startswith("<") and "</" in stripped:
        inner = re.sub(r"^.*?>", "", stripped, count=1, flags=re.S)
        inner = re.sub(r"</string>.*$", "", inner, flags=re.S)
        stripped = inner.strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
        return {"data": parsed}
    except json.JSONDecodeError:
        return {"success": False, "msg": stripped}


def _post_internal(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Internal post function that actually makes the HTTP request."""
    response = httpx.post(
        _endpoint(path),
        data=payload,
        timeout=settings.GOMAP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    try:
        body = response.json()
        if not isinstance(body, dict):
            body = {"data": body}
    except json.JSONDecodeError:
        body = _parse_wrapped_json(response.text)
    if body.get("success") is False:
        logger.warning("GoMap %s returned non-success payload: %s", path, body)
    return body


def _post_with_retry(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Execute post with retry logic and exponential backoff."""
    import time

    last_error = None
    backoff = settings.GOMAP_RETRY_BACKOFF_SECONDS

    for attempt in range(settings.GOMAP_RETRY_ATTEMPTS + 1):
        if attempt > 0:
            # Exponential backoff for retries
            sleep_time = backoff * (2 ** (attempt - 1))
            logger.debug(
                "Retrying GoMap %s after %.1f seconds (attempt %d/%d)",
                path, sleep_time, attempt + 1, settings.GOMAP_RETRY_ATTEMPTS + 1
            )
            time.sleep(sleep_time)

        try:
            # Use circuit breaker for the actual HTTP call
            return with_circuit_breaker(
                _post_internal,
                "gomap_api",
                path,
                payload
            )
        except CircuitOpenError:
            # Circuit is open, don't retry
            raise
        except Exception as exc:
            last_error = exc
            if attempt < settings.GOMAP_RETRY_ATTEMPTS:
                logger.warning(
                    "GoMap %s failed (attempt %d/%d): %s",
                    path, attempt + 1, settings.GOMAP_RETRY_ATTEMPTS + 1, exc
                )
            else:
                # Final attempt failed
                logger.error("GoMap %s failed after all retry attempts: %s", path, exc)

    # All retries exhausted
    raise last_error


def _post(path: str, data: dict[str, Any], *, language: str | None = None) -> dict[str, Any]:
    """Post to GoMap API with circuit breaker and retry logic."""
    if not gomap_enabled():
        raise RuntimeError("GoMap API is not configured")
    payload = {
        **data,
        "guid": settings.GOMAP_GUID,
        "lng": _resolve_language(language),
    }
    return _post_with_retry(path, payload)


def search_objects(
    term: str, *, limit: int = 10, language: str | None = None
) -> list[dict[str, Any]]:
    if not gomap_enabled():
        return []
    query = term.strip()
    if not query:
        return []
    limit = max(1, min(limit, 10))

    # Check cache first
    cache_key = f"{query}|{limit}|{_resolve_language(language)}"
    cached_results = get_cached_geocode(cache_key)
    if cached_results is not None:
        logger.debug("Using cached geocode results for '%s'", query)
        return cached_results[:limit]

    try:
        payload = _post("searchObj", {"name": query}, language=language)
    except Exception as exc:  # pragma: no cover - network/runtime
        logger.warning("GoMap search failed: %s", exc)
        return []
    rows: Iterable[dict[str, Any]] = payload.get("rows") or payload.get("result") or []
    results: list[dict[str, Any]] = []
    for row in rows:
        lat = _coerce_float(row.get("y") or row.get("lat"))
        lon = _coerce_float(row.get("x") or row.get("lon"))
        if lat is None or lon is None:
            continue
        name = row.get("nm") or row.get("name") or row.get("poiName")
        address = row.get("addr") or row.get("address") or row.get("fullAddress")
        place_name = address or name
        results.append(
            {
                "id": row.get("id") or row.get("object_id") or row.get("poiGuid") or name,
                "name": name or place_name or query,
                "place_name": place_name or name or query,
                "address": address,
                "latitude": lat,
                "longitude": lon,
                "provider": "gomap",
                "raw": row,
            }
        )
        if len(results) >= limit:
            break

    # Cache the results
    if results:
        cache_key = f"{query}|{limit}|{_resolve_language(language)}"
        cache_geocode(cache_key, results)

    return results


def reverse_geocode(
    latitude: float, longitude: float, *, language: str | None = None
) -> dict[str, Any] | None:
    if not gomap_enabled():
        return None
    try:
        payload = _post(
            "getAddressByCoords",
            {
                "x": f"{float(longitude):.6f}",
                "y": f"{float(latitude):.6f}",
            },
            language=language,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("GoMap reverse geocode failed: %s", exc)
        return None
    if payload.get("success") is False:
        return None
    return {
        "formatted_address": payload.get("addr") or payload.get("formatted_address"),
        "components": payload.get("addr_components") or payload.get("address_components") or [],
        "provider": "gomap",
    }


def _parse_geometry(points: Any) -> list[tuple[float, float]] | None:
    if not points:
        return None
    coords: list[tuple[float, float]] = []
    iterable: Iterable[Any]
    if isinstance(points, str):
        chunks = [chunk.strip() for chunk in points.split(";") if chunk.strip()]
        iterable = [chunk.split(",") for chunk in chunks]
    elif isinstance(points, dict):
        iterable = points.get("points") or points.get("route") or points.get("coords") or []
    else:
        iterable = points  # assume list-like
    for item in iterable:
        lon = lat = None
        if isinstance(item, dict):
            lon = _coerce_float(item.get("x") or item.get("lon"))
            lat = _coerce_float(item.get("y") or item.get("lat"))
        elif isinstance(item, list | tuple) and len(item) >= 2:
            lon = _coerce_float(item[0])
            lat = _coerce_float(item[1])
        elif isinstance(item, str) and "," in item:
            lon, lat = (_coerce_float(part) for part in item.split(",", 1))
        if lat is None or lon is None:
            continue
        coords.append((lat, lon))
    return coords or None


def _normalize_distance(value: Any) -> float | None:
    distance = _coerce_float(value)
    if distance is None:
        return None
    if distance > 500:  # likely meters
        return round(distance / 1000.0, 3)
    return round(distance, 3)


def _normalize_duration_seconds(value: Any) -> int | None:
    duration = _coerce_float(value)
    if duration is None:
        return None
    if duration > 200:  # assume already seconds
        return max(1, int(round(duration)))
    return max(1, int(round(duration * 60)))


def route_directions(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    *,
    language: str | None = None,
) -> GoMapRoute | None:
    if not gomap_enabled():
        return None

    # Check cache first
    cached = get_cached_route(origin_lat, origin_lon, dest_lat, dest_lon)
    if cached is not None:
        logger.debug("Using cached route for %.4f,%.4f to %.4f,%.4f",
                    origin_lat, origin_lon, dest_lat, dest_lon)
        return cached

    try:
        payload = _post(
            "getRoute",
            {
                "Ax": f"{float(origin_lon):.6f}",
                "Ay": f"{float(origin_lat):.6f}",
                "Bx": f"{float(dest_lon):.6f}",
                "By": f"{float(dest_lat):.6f}",
            },
            language=language,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("GoMap route failed: %s", exc)
        return None
    if payload.get("success") is False:
        return None

    distance_keys = ("distance", "Distance", "len", "length", "route_distance", "path_length")
    duration_keys = ("time", "Time", "duration", "eta", "travel_time")

    distance_km = None
    for key in distance_keys:
        distance_km = _normalize_distance(payload.get(key))
        if distance_km is not None:
            break

    duration_seconds = None
    for key in duration_keys:
        duration_seconds = _normalize_duration_seconds(payload.get(key))
        if duration_seconds is not None:
            break

    geometry = _parse_geometry(
        payload.get("route")
        or payload.get("geometry")
        or payload.get("points")
        or payload.get("coords")
    )

    notice = payload.get("msg") or payload.get("message") or payload.get("comment")

    route = GoMapRoute(
        distance_km=distance_km,
        duration_seconds=duration_seconds,
        geometry=geometry,
        notice=notice,
        raw=payload,
    )

    # Cache the result
    cache_route(origin_lat, origin_lon, dest_lat, dest_lon, route)

    return route


def get_traffic_conditions(
    latitude: float,
    longitude: float,
    radius_km: float = 2.0,
    *,
    language: str | None = None,
) -> GoMapTraffic | None:
    """Get traffic conditions for a specific coordinate from GoMap API.

    Args:
        latitude: Latitude of the point
        longitude: Longitude of the point
        radius_km: Radius in km to check traffic (default 2km)
        language: Language for response

    Returns:
        GoMapTraffic object with traffic severity and conditions, or None if unavailable
    """
    if not gomap_enabled():
        return None

    if not settings.GOMAP_TRAFFIC_ENABLED:
        return None

    # Check cache first
    cached = get_cached_traffic(latitude, longitude, radius_km)
    if cached is not None:
        logger.debug("Using cached traffic for %.4f,%.4f", latitude, longitude)
        return cached

    try:
        # Call GoMap traffic API
        payload = _post(
            "getTrafficTilesByCoord",
            {
                "lat": f"{float(latitude):.6f}",
                "lon": f"{float(longitude):.6f}",
                "radius": str(int(radius_km * 1000)),  # Convert to meters
            },
            language=language,
        )
    except Exception as exc:
        logger.warning("GoMap traffic check failed: %s", exc)
        return None

    if payload.get("success") is False:
        return None

    # Parse traffic response
    # Note: The actual response structure may vary - this is based on typical traffic API patterns
    # We'll need to adjust based on actual GoMap response
    traffic_data = payload.get("traffic") or payload.get("data") or {}

    # Extract traffic severity (usually on a scale)
    severity = None
    if "severity" in traffic_data:
        severity = int(traffic_data["severity"])
    elif "level" in traffic_data:
        severity = int(traffic_data["level"])
    elif "congestion" in traffic_data:
        # Convert congestion percentage to severity scale
        congestion = float(traffic_data["congestion"])
        if congestion < 0.2:
            severity = 1  # smooth
        elif congestion < 0.4:
            severity = 2  # moderate
        elif congestion < 0.7:
            severity = 3  # heavy
        else:
            severity = 4  # severe

    # Extract speed if available
    speed_kmh = None
    if "speed" in traffic_data:
        speed_kmh = _coerce_float(traffic_data["speed"])
    elif "avgSpeed" in traffic_data:
        speed_kmh = _coerce_float(traffic_data["avgSpeed"])

    # Extract delay if available
    delay_minutes = None
    if "delay" in traffic_data:
        delay_minutes = int(traffic_data["delay"])
    elif "delayMinutes" in traffic_data:
        delay_minutes = int(traffic_data["delayMinutes"])

    # Extract congestion level
    congestion_level = None
    if "congestion" in traffic_data:
        congestion_level = _coerce_float(traffic_data["congestion"])
    elif "congestionLevel" in traffic_data:
        congestion_level = _coerce_float(traffic_data["congestionLevel"])

    traffic = GoMapTraffic(
        severity=severity,
        speed_kmh=speed_kmh,
        delay_minutes=delay_minutes,
        congestion_level=congestion_level,
        raw=payload,
    )

    # Cache the result
    cache_traffic(latitude, longitude, radius_km, traffic)

    return traffic


__all__ = [
    "GoMapRoute",
    "GoMapTraffic",
    "gomap_enabled",
    "route_directions",
    "search_objects",
    "reverse_geocode",
    "get_traffic_conditions",
]

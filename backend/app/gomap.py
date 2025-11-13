from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from .cache import (
    cache_geocode,
    cache_route,
    cache_traffic,
    get_cached_geocode,
    get_cached_route,
    get_cached_traffic,
)
from .circuit_breaker import CircuitOpenError, with_circuit_breaker
from .input_validation import InputValidator
from .settings import settings

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
    """
    Search for objects by name with input validation.

    Sanitizes the search term to prevent injection attacks.
    """
    if not gomap_enabled():
        return []

    # Validate and sanitize inputs (defense in depth)
    query = InputValidator.validate_search_query(term, context="object search")
    language = InputValidator.sanitize_language_code(language)
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


def search_objects_with_distance(
    term: str,
    origin_lat: float,
    origin_lon: float,
    *,
    limit: int = 10,
    language: str | None = None
) -> list[dict[str, Any]]:
    """Search for objects with distance calculations from a specific origin point.

    Uses GoMap's searchObjWithDistance API which provides built-in distance calculations,
    eliminating the need for manual Haversine calculations.

    Args:
        term: Search query
        origin_lat: Origin latitude for distance calculations
        origin_lon: Origin longitude for distance calculations
        limit: Maximum number of results (1-50)
        language: Language for results

    Returns:
        List of search results with distances from origin
    """
    if not gomap_enabled():
        return []
    query = term.strip()
    if not query:
        return []
    limit = max(1, min(limit, 50))  # searchObjWithDistance supports more results

    # Validate coordinates
    if not (-90 <= origin_lat <= 90) or not (-180 <= origin_lon <= 180):
        logger.warning("Invalid coordinates for distance search: lat=%f, lon=%f", origin_lat, origin_lon)
        return []

    # Check cache with origin coordinates included
    cache_key = f"dist|{query}|{origin_lat:.4f}|{origin_lon:.4f}|{limit}|{_resolve_language(language)}"
    cached_results = get_cached_geocode(cache_key)
    if cached_results is not None:
        logger.debug("Using cached distance search results for '%s'", query)
        return cached_results[:limit]

    try:
        payload = _post(
            "searchObjWithDistance",
            {
                "name": query,
                "lat": f"{float(origin_lat):.6f}",
                "lon": f"{float(origin_lon):.6f}",
                "limit": str(limit),
            },
            language=language
        )

        # Log response structure for debugging
        import json
        logger.debug(
            "searchObjWithDistance response sample: %s",
            json.dumps(payload, indent=2, ensure_ascii=False)[:500]
        )
    except Exception as exc:
        logger.warning("GoMap distance search failed: %s", exc)
        # Fallback to regular search without distances
        return search_objects(term, limit=limit, language=language)

    if payload.get("success") is False:
        logger.warning("Distance search failed: %s", payload.get("msg", "Unknown error"))
        # Fallback to regular search
        return search_objects(term, limit=limit, language=language)

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

        # Extract distance information - GoMap provides this directly!
        distance_meters = None
        distance_text = None

        # Try multiple possible field names for distance
        if "distance" in row:
            distance_meters = _coerce_float(row["distance"])
        elif "dist" in row:
            distance_meters = _coerce_float(row["dist"])
        elif "distanceMeters" in row:
            distance_meters = _coerce_float(row["distanceMeters"])
        elif "distance_m" in row:
            distance_meters = _coerce_float(row["distance_m"])

        # Try to get formatted distance text
        if "distanceText" in row:
            distance_text = row["distanceText"]
        elif "dist_text" in row:
            distance_text = row["dist_text"]
        elif distance_meters is not None:
            # Format distance ourselves if not provided
            if distance_meters < 1000:
                distance_text = f"{int(distance_meters)} m"
            else:
                distance_text = f"{distance_meters / 1000:.1f} km"

        results.append(
            {
                "id": row.get("id") or row.get("object_id") or row.get("poiGuid") or name,
                "name": name or place_name or query,
                "place_name": place_name or name or query,
                "address": address,
                "latitude": lat,
                "longitude": lon,
                "distance_meters": distance_meters,
                "distance_text": distance_text,
                "provider": "gomap",
                "raw": row,
            }
        )

        if len(results) >= limit:
            break

    # Sort by distance if we have distance data
    if results and results[0].get("distance_meters") is not None:
        results.sort(key=lambda x: x.get("distance_meters", float('inf')))

    # Cache the results
    if results:
        cache_geocode(cache_key, results)

    return results


def search_objects_fuzzy(
    term: str,
    *,
    limit: int = 10,
    language: str | None = None
) -> list[dict[str, Any]]:
    """Search for objects with fuzzy matching for typo tolerance.

    Uses GoMap's makeSearchCitySettlementFuzzy API which handles misspellings
    and typos using fuzzy string matching algorithms.

    Args:
        term: Search query (can contain typos)
        limit: Maximum number of results
        language: Language for results

    Returns:
        List of fuzzy-matched search results
    """
    if not gomap_enabled():
        return []
    query = term.strip()
    if not query:
        return []
    limit = max(1, min(limit, 20))

    # Check cache
    cache_key = f"fuzzy|{query}|{limit}|{_resolve_language(language)}"
    cached_results = get_cached_geocode(cache_key)
    if cached_results is not None:
        logger.debug("Using cached fuzzy search results for '%s'", query)
        return cached_results[:limit]

    try:
        payload = _post(
            "makeSearchCitySettlementFuzzy",
            {
                "q": query,  # Different parameter name for fuzzy search
                "limit": str(limit),
            },
            language=language
        )

        logger.debug("Fuzzy search for '%s' returned %d results", query, len(payload.get("rows", [])))
    except Exception as exc:
        logger.warning("GoMap fuzzy search failed: %s", exc)
        return []

    if payload.get("success") is False:
        logger.debug("Fuzzy search returned no results for '%s'", query)
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

        # Fuzzy search may include a similarity score
        similarity = row.get("similarity") or row.get("score") or row.get("confidence")

        results.append(
            {
                "id": row.get("id") or row.get("object_id") or row.get("poiGuid") or name,
                "name": name or place_name or query,
                "place_name": place_name or name or query,
                "address": address,
                "latitude": lat,
                "longitude": lon,
                "similarity": similarity,  # How closely it matched
                "provider": "gomap_fuzzy",
                "raw": row,
            }
        )

        if len(results) >= limit:
            break

    # Sort by similarity score if available
    if results and results[0].get("similarity") is not None:
        results.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    # Cache the results
    if results:
        cache_geocode(cache_key, results)

    return results


def search_objects_smart(
    term: str,
    *,
    origin_lat: float | None = None,
    origin_lon: float | None = None,
    limit: int = 10,
    use_fuzzy_fallback: bool = True,
    language: str | None = None
) -> list[dict[str, Any]]:
    """Smart search that combines distance-aware, exact, and fuzzy matching.

    Tries search strategies in this order:
    1. Distance-aware search (if origin provided)
    2. Exact search
    3. Fuzzy search (if enabled and previous searches return few results)

    All inputs are validated to prevent injection attacks and API abuse.

    Args:
        term: Search query (sanitized)
        origin_lat: Optional origin latitude (validated)
        origin_lon: Optional origin longitude (validated)
        limit: Maximum number of results
        use_fuzzy_fallback: Whether to use fuzzy search as fallback
        language: Language for results

    Returns:
        Best available search results
    """
    # Validate and sanitize inputs
    term = InputValidator.validate_search_query(term, context="search term")
    language = InputValidator.sanitize_language_code(language)

    # Validate coordinates if provided
    if origin_lat is not None and origin_lon is not None:
        origin_lat, origin_lon = InputValidator.validate_coordinates(
            origin_lat, origin_lon,
            allow_outside_baku=True,
            context="search origin coordinates"
        )

    results = []

    # Try distance-aware search if we have origin
    if origin_lat is not None and origin_lon is not None:
        logger.debug("Trying distance-aware search for '%s'", term)
        results = search_objects_with_distance(
            term, origin_lat, origin_lon,
            limit=limit, language=language
        )
        if len(results) >= min(3, limit):  # Got decent results
            return results

    # Try exact search if distance search failed or wasn't available
    if not results:
        logger.debug("Trying exact search for '%s'", term)
        results = search_objects(term, limit=limit, language=language)
        if len(results) >= min(3, limit):  # Got decent results
            return results

    # Try fuzzy search as fallback
    if use_fuzzy_fallback and len(results) < min(3, limit):
        logger.debug("Falling back to fuzzy search for '%s' (only %d exact results)", term, len(results))
        fuzzy_results = search_objects_fuzzy(term, limit=limit - len(results), language=language)

        # Merge fuzzy results with exact results, avoiding duplicates
        seen_ids = {r.get("id") for r in results}
        for fuzzy_result in fuzzy_results:
            if fuzzy_result.get("id") not in seen_ids:
                results.append(fuzzy_result)
                seen_ids.add(fuzzy_result.get("id"))

    return results[:limit]


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


def _extract_number(value: str) -> float | None:
    match = re.search(r"(-?\d+(?:[.,]\d+)?)", value)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _normalize_distance(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str):
        # Common GoMap fields like "Ümumi məsafə: 5.29 km."
        extracted = _extract_number(value)
        if extracted is not None:
            value = extracted
        elif "_" in value:
            parts = value.split("_")
            try:
                value = float(parts[-1])
            except ValueError:
                value = None
    distance = _coerce_float(value)
    if distance is None:
        return None
    if distance > 500:  # treat as meters
        return round(distance / 1000.0, 3)
    return round(distance, 3)


def _normalize_duration_seconds(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        # Patterns: "Ümumi vaxt: 00 s. 06dəq.", "0_6", "6 dəq"
        if "_" in value:
            hours_str, minutes_str = value.split("_", 1)
            try:
                hours = float(hours_str)
                minutes = float(minutes_str)
                return max(1, int(round(hours * 3600 + minutes * 60)))
            except ValueError:
                pass
        minute_match = re.search(r"(\d+)\s*(?:dəq|min)", normalized, re.IGNORECASE)
        second_match = re.search(r"(\d+)\s*(?:s|san)", normalized, re.IGNORECASE)
        total_seconds = 0
        if minute_match:
            total_seconds += int(minute_match.group(1)) * 60
        if second_match:
            total_seconds += int(second_match.group(1))
        if total_seconds > 0:
            return total_seconds
        extracted = _extract_number(normalized)
        if extracted is not None:
            value = extracted
        else:
            value = normalized
    duration = _coerce_float(value)
    if duration is None:
        return None
    if duration > 200:  # already seconds
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
    """
    Get route directions from GoMap API with input validation.

    All inputs are validated to prevent injection attacks and API abuse.
    """
    if not gomap_enabled():
        return None

    # Validate and sanitize coordinates
    origin_lat, origin_lon = InputValidator.validate_coordinates(
        origin_lat, origin_lon,
        allow_outside_baku=True,
        context="origin coordinates"
    )
    dest_lat, dest_lon = InputValidator.validate_coordinates(
        dest_lat, dest_lon,
        allow_outside_baku=True,
        context="destination coordinates"
    )

    # Validate language code
    language = InputValidator.sanitize_language_code(language)

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

    distance_keys = (
        "distance",
        "Distance",
        "len",
        "length",
        "route_distance",
        "path_length",
        "ttllength",
        "ttllength1",
    )
    duration_keys = (
        "time1",
        "time",
        "Time",
        "duration",
        "eta",
        "travel_time",
    )

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


def route_directions_by_type(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    *,
    route_type: Literal["fastest", "shortest", "pedestrian"] = "fastest",
    language: str | None = None,
) -> GoMapRoute | None:
    """Calculate route with specific routing preference.

    Uses getRouteByType API to calculate different types of routes:
    - fastest: Optimized for travel time (considers traffic, road speeds)
    - shortest: Optimized for distance (may take longer)
    - pedestrian: Walking directions (uses footpaths, avoids highways)

    Args:
        origin_lat: Origin latitude
        origin_lon: Origin longitude
        dest_lat: Destination latitude
        dest_lon: Destination longitude
        route_type: Type of route calculation
        language: Language for instructions

    Returns:
        GoMapRoute optimized for the specified type
    """
    if not gomap_enabled():
        return None

    # Validate coordinates
    if not (-90 <= origin_lat <= 90) or not (-180 <= origin_lon <= 180):
        logger.warning("Invalid origin coordinates: lat=%f, lon=%f", origin_lat, origin_lon)
        return None
    if not (-90 <= dest_lat <= 90) or not (-180 <= dest_lon <= 180):
        logger.warning("Invalid destination coordinates: lat=%f, lon=%f", dest_lat, dest_lon)
        return None


    try:
        payload = _post(
            "getRouteByType",
            {
                "Ax": f"{float(origin_lon):.6f}",
                "Ay": f"{float(origin_lat):.6f}",
                "Bx": f"{float(dest_lon):.6f}",
                "By": f"{float(dest_lat):.6f}",
                "type": route_type,
            },
            language=language,
        )

        logger.debug("Route by type '%s' response received", route_type)
    except Exception as exc:
        logger.warning("GoMap route by type failed: %s", exc)
        # Fallback to basic route
        return route_directions(origin_lat, origin_lon, dest_lat, dest_lon, language=language)

    if payload.get("success") is False:
        logger.warning("Route by type failed: %s", payload.get("msg", "Unknown error"))
        # Fallback to basic route
        return route_directions(origin_lat, origin_lon, dest_lat, dest_lon, language=language)

    # Parse response (similar structure to basic route)
    distance_keys = (
        "distance",
        "Distance",
        "len",
        "length",
        "route_distance",
        "path_length",
        "ttllength",
        "ttllength1",
    )
    duration_keys = (
        "time1",
        "time",
        "Time",
        "duration",
        "eta",
        "travel_time",
    )

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

    # Adjust duration for pedestrian routes (walking is slower)
    if route_type == "pedestrian" and distance_km and not duration_seconds:
        # Assume 5 km/h walking speed if duration not provided
        duration_seconds = int((distance_km / 5.0) * 3600)

    geometry = _parse_geometry(
        payload.get("route") or
        payload.get("geometry") or
        payload.get("points") or
        payload.get("coords")
    )

    notice = payload.get("msg") or payload.get("message") or payload.get("comment")
    if route_type == "pedestrian":
        notice = f"Walking route: {notice}" if notice else "Walking route"
    elif route_type == "shortest":
        notice = f"Shortest route: {notice}" if notice else "Shortest route"

    route = GoMapRoute(
        distance_km=distance_km,
        duration_seconds=duration_seconds,
        geometry=geometry,
        notice=notice,
        raw=payload,
    )

    return route


def route_directions_detailed(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    *,
    include_polyline: bool = True,
    language: str | None = None,
) -> GoMapRoute | None:
    """Get detailed route with full polyline coordinates.

    Uses getRouteCoords API to get dense coordinate data for smooth map rendering.

    Args:
        origin_lat: Origin latitude
        origin_lon: Origin longitude
        dest_lat: Destination latitude
        dest_lon: Destination longitude
        include_polyline: Whether to fetch full polyline coordinates
        language: Language for instructions

    Returns:
        GoMapRoute with detailed geometry for visualization
    """
    if not gomap_enabled():
        return None

    # Get base route first
    route = route_directions(origin_lat, origin_lon, dest_lat, dest_lon, language=language)
    if not route or not include_polyline:
        return route

    # Fetch detailed polyline coordinates
    try:
        payload = _post(
            "getRouteCoords",
            {
                "Ax": f"{float(origin_lon):.6f}",
                "Ay": f"{float(origin_lat):.6f}",
                "Bx": f"{float(dest_lon):.6f}",
                "By": f"{float(dest_lat):.6f}",
            },
            language=language,
        )

        # Parse detailed coordinates
        if payload.get("success") is not False:
            detailed_geometry = _parse_geometry(
                payload.get("coordinates") or
                payload.get("coords") or
                payload.get("polyline") or
                payload.get("points")
            )

            if detailed_geometry and len(detailed_geometry) > len(route.geometry or []):
                # Use the more detailed geometry
                route.geometry = detailed_geometry
                logger.debug(
                    "Enhanced route with %d polyline points (was %d)",
                    len(detailed_geometry),
                    len(route.geometry) if route.geometry else 0
                )
    except Exception as exc:
        logger.warning("Failed to fetch detailed route coordinates: %s", exc)
        # Continue with basic route

    return route


def search_nearby_pois(
    latitude: float,
    longitude: float,
    *,
    radius_km: float = 2.0,
    limit: int = 10,
    category: str | None = None,
    language: str | None = None
) -> list[dict[str, Any]]:
    """Discover POIs near a specific location.

    Uses searchNearBy/searchNearBy50 APIs to find places within a radius,
    sorted by distance from the origin point.

    Args:
        latitude: Center point latitude
        longitude: Center point longitude
        radius_km: Search radius in kilometers (default 2km)
        limit: Maximum results (10 or 50)
        category: Optional category filter (restaurant, cafe, etc.)
        language: Language for results

    Returns:
        List of nearby POIs sorted by distance
    """
    if not gomap_enabled():
        return []

    # Validate and sanitize inputs
    latitude, longitude = InputValidator.validate_coordinates(
        latitude, longitude,
        allow_outside_baku=True,
        context="nearby POI search coordinates"
    )
    radius_km = InputValidator.validate_radius(radius_km, max_km=50.0)
    language = InputValidator.sanitize_language_code(language)

    # Determine which API to use based on limit
    api_method = "searchNearBy50" if limit > 10 else "searchNearBy"
    actual_limit = min(50 if limit > 10 else 10, limit)

    # Cache key includes location and radius
    cache_key = f"nearby|{latitude:.4f}|{longitude:.4f}|{radius_km:.1f}|{actual_limit}|{category}|{_resolve_language(language)}"
    cached_results = get_cached_geocode(cache_key)
    if cached_results is not None:
        logger.debug("Using cached nearby POI results")
        return cached_results[:actual_limit]

    try:
        request_data = {
            "lat": f"{float(latitude):.6f}",
            "lon": f"{float(longitude):.6f}",
            "radius": str(int(radius_km * 1000)),  # Convert to meters
        }

        # Add category filter if specified
        if category:
            request_data["category"] = category

        payload = _post(api_method, request_data, language=language)

        logger.debug(
            "Nearby POI search at %.4f,%.4f (radius %.1fkm) returned %d results",
            latitude, longitude, radius_km, len(payload.get("rows", []))
        )
    except Exception as exc:
        logger.warning("GoMap nearby search failed: %s", exc)
        return []

    if payload.get("success") is False:
        logger.debug("Nearby search returned no results")
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

        # Extract distance (should be provided by nearby API)
        distance_meters = None
        distance_text = None

        if "distance" in row:
            distance_meters = _coerce_float(row["distance"])
        elif "dist" in row:
            distance_meters = _coerce_float(row["dist"])
        elif "distanceMeters" in row:
            distance_meters = _coerce_float(row["distanceMeters"])

        # Format distance text
        if distance_meters is not None:
            if distance_meters < 1000:
                distance_text = f"{int(distance_meters)} m"
            else:
                distance_text = f"{distance_meters / 1000:.1f} km"

        # Extract category/type if available
        poi_category = row.get("category") or row.get("type") or row.get("poi_type")

        results.append(
            {
                "id": row.get("id") or row.get("object_id") or row.get("poiGuid") or name,
                "name": name or place_name,
                "place_name": place_name or name,
                "address": address,
                "latitude": lat,
                "longitude": lon,
                "distance_meters": distance_meters,
                "distance_text": distance_text,
                "category": poi_category,
                "provider": "gomap_nearby",
                "raw": row,
            }
        )

        if len(results) >= actual_limit:
            break

    # Results should already be sorted by distance from the API
    # But ensure they are sorted if distance data exists
    if results and results[0].get("distance_meters") is not None:
        results.sort(key=lambda x: x.get("distance_meters", float('inf')))

    # Cache the results
    if results:
        cache_geocode(cache_key, results)

    return results[:actual_limit]


def search_nearby_pois_paginated(
    latitude: float,
    longitude: float,
    *,
    radius_km: float = 2.0,
    page: int = 1,
    per_page: int = 20,
    category: str | None = None,
    language: str | None = None
) -> dict[str, Any]:
    """Discover POIs near a location with pagination support.

    Uses searchNearByPage API for paginated results.

    Args:
        latitude: Center point latitude
        longitude: Center point longitude
        radius_km: Search radius in kilometers
        page: Page number (1-indexed)
        per_page: Results per page
        category: Optional category filter
        language: Language for results

    Returns:
        Dict with 'items', 'total', 'page', 'pages' keys
    """
    if not gomap_enabled():
        return {"items": [], "total": 0, "page": page, "pages": 0}

    # Validate inputs
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        logger.warning("Invalid coordinates for paginated nearby search")
        return {"items": [], "total": 0, "page": page, "pages": 0}

    page = max(1, page)
    per_page = max(1, min(50, per_page))

    try:
        request_data = {
            "lat": f"{float(latitude):.6f}",
            "lon": f"{float(longitude):.6f}",
            "radius": str(int(radius_km * 1000)),
            "page": str(page),
            "limit": str(per_page),
        }

        if category:
            request_data["category"] = category

        payload = _post("searchNearByPage", request_data, language=language)

        logger.debug(
            "Paginated nearby search (page %d) returned results",
            page
        )
    except Exception as exc:
        logger.warning("GoMap paginated nearby search failed: %s", exc)
        return {"items": [], "total": 0, "page": page, "pages": 0}

    if payload.get("success") is False:
        return {"items": [], "total": 0, "page": page, "pages": 0}

    # Parse pagination info
    total_results = int(payload.get("total", 0))
    total_pages = int(payload.get("pages", 0))

    # If pagination info not provided, calculate it
    if not total_pages and total_results:
        total_pages = (total_results + per_page - 1) // per_page

    # Parse results (same as non-paginated version)
    rows: Iterable[dict[str, Any]] = payload.get("rows") or payload.get("result") or []
    items: list[dict[str, Any]] = []

    for row in rows:
        lat = _coerce_float(row.get("y") or row.get("lat"))
        lon = _coerce_float(row.get("x") or row.get("lon"))
        if lat is None or lon is None:
            continue

        name = row.get("nm") or row.get("name") or row.get("poiName")
        address = row.get("addr") or row.get("address")
        distance_meters = _coerce_float(row.get("distance") or row.get("dist"))

        distance_text = None
        if distance_meters is not None:
            if distance_meters < 1000:
                distance_text = f"{int(distance_meters)} m"
            else:
                distance_text = f"{distance_meters / 1000:.1f} km"

        items.append({
            "id": row.get("id") or row.get("object_id") or name,
            "name": name,
            "address": address,
            "latitude": lat,
            "longitude": lon,
            "distance_meters": distance_meters,
            "distance_text": distance_text,
            "category": row.get("category") or row.get("type"),
            "provider": "gomap_nearby",
        })

    return {
        "items": items,
        "total": total_results,
        "page": page,
        "pages": total_pages,
        "per_page": per_page,
    }


def get_poi_details(
    poi_guid: str,
    *,
    include_images: bool = False,
    language: str | None = None
) -> dict[str, Any] | None:
    """Get detailed information about a specific POI.

    Uses getDetailsByPoi_GUID API to fetch comprehensive POI metadata including:
    - Full name and description
    - Complete address
    - Contact information (phone, email, website)
    - Opening hours
    - Category/type
    - Ratings and reviews count (if available)

    Args:
        poi_guid: Unique identifier of the POI
        include_images: Whether to fetch POI images
        language: Language for descriptions

    Returns:
        Detailed POI information or None if not found
    """
    if not gomap_enabled():
        return None

    if not poi_guid:
        return None

    # Cache key for POI details
    cache_key = f"poi_details|{poi_guid}|{_resolve_language(language)}"
    cached = get_cached_geocode(cache_key)
    if cached is not None:
        logger.debug("Using cached POI details for GUID %s", poi_guid)
        # Add images if requested and not in cache
        if include_images and "images" not in cached:
            images = get_poi_images(poi_guid)
            if images:
                cached["images"] = images
        return cached

    try:
        payload = _post(
            "getDetailsByPoi_GUID",
            {"guid": poi_guid},
            language=language
        )

        logger.debug("POI details fetched for GUID %s", poi_guid)
    except Exception as exc:
        logger.warning("Failed to fetch POI details for %s: %s", poi_guid, exc)
        return None

    if payload.get("success") is False:
        logger.debug("No POI details found for GUID %s", poi_guid)
        return None

    # Parse POI details
    poi_data = payload.get("poi") or payload.get("data") or payload

    # Extract all available information
    details = {
        "guid": poi_guid,
        "name": poi_data.get("name") or poi_data.get("nm"),
        "description": poi_data.get("description") or poi_data.get("desc"),
        "address": poi_data.get("address") or poi_data.get("addr"),
        "latitude": _coerce_float(poi_data.get("lat") or poi_data.get("y")),
        "longitude": _coerce_float(poi_data.get("lon") or poi_data.get("x")),
        "category": poi_data.get("category") or poi_data.get("type"),
        "subcategory": poi_data.get("subcategory"),
        "phone": poi_data.get("phone") or poi_data.get("tel"),
        "email": poi_data.get("email"),
        "website": poi_data.get("website") or poi_data.get("url"),
        "opening_hours": poi_data.get("opening_hours") or poi_data.get("hours"),
        "rating": _coerce_float(poi_data.get("rating")),
        "reviews_count": _coerce_int(poi_data.get("reviews_count") or poi_data.get("reviews")),
        "price_level": poi_data.get("price_level") or poi_data.get("price"),
        "features": poi_data.get("features") or poi_data.get("amenities"),
        "provider": "gomap",
        "raw": poi_data,
    }

    # Clean up None values
    details = {k: v for k, v in details.items() if v is not None}

    # Fetch images if requested
    if include_images:
        images = get_poi_images(poi_guid)
        if images:
            details["images"] = images

    # Cache the result
    cache_geocode(cache_key, details)

    return details


def get_poi_images(
    poi_guid: str,
    *,
    limit: int = 10
) -> list[dict[str, Any]] | None:
    """Get images for a specific POI.

    Uses getImageByPoi_GUID API to fetch POI photos.

    Args:
        poi_guid: Unique identifier of the POI
        limit: Maximum number of images to return

    Returns:
        List of image information or None if no images
    """
    if not gomap_enabled():
        return None

    if not poi_guid:
        return None

    try:
        payload = _post(
            "getImageByPoi_GUID",
            {
                "guid": poi_guid,
                "limit": str(limit),
            }
        )

        logger.debug("POI images fetched for GUID %s", poi_guid)
    except Exception as exc:
        logger.warning("Failed to fetch POI images for %s: %s", poi_guid, exc)
        return None

    if payload.get("success") is False:
        return None

    # Parse image data
    images_data = payload.get("images") or payload.get("photos") or payload.get("result") or []
    if not isinstance(images_data, list):
        images_data = [images_data]

    images = []
    for img in images_data:
        if isinstance(img, dict):
            image_info = {
                "url": img.get("url") or img.get("src"),
                "thumbnail": img.get("thumbnail") or img.get("thumb"),
                "caption": img.get("caption") or img.get("title"),
                "width": _coerce_int(img.get("width")),
                "height": _coerce_int(img.get("height")),
                "size": img.get("size"),
            }
        elif isinstance(img, str):
            # Simple URL string
            image_info = {"url": img}
        else:
            continue

        # Clean up None values
        image_info = {k: v for k, v in image_info.items() if v is not None}
        if image_info.get("url"):
            images.append(image_info)

        if len(images) >= limit:
            break

    return images if images else None


def get_poi_description(
    poi_guid: str,
    *,
    language: str | None = None
) -> str | None:
    """Get detailed description for a POI.

    Uses getDescriptionByPoi_GUID API for longer descriptions.

    Args:
        poi_guid: Unique identifier of the POI
        language: Language for description

    Returns:
        POI description text or None
    """
    if not gomap_enabled():
        return None

    try:
        payload = _post(
            "getDescriptionByPoi_GUID",
            {"guid": poi_guid},
            language=language
        )

        return payload.get("description") or payload.get("text")
    except Exception as exc:
        logger.warning("Failed to fetch POI description for %s: %s", poi_guid, exc)
        return None


def _coerce_int(value: Any) -> int | None:
    """Convert value to int if possible."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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

        # DEBUG: Log the actual API response structure
        import json
        logger.info(
            "Traffic API raw response for lat=%.4f, lon=%.4f: %s",
            latitude, longitude,
            json.dumps(payload, indent=2, ensure_ascii=False)[:1000]  # Truncate for logging
        )
    except Exception as exc:
        logger.warning("GoMap traffic check failed: %s", exc)
        return None

    if payload.get("success") is False:
        logger.warning("Traffic API returned success=false: %s", payload.get("msg", "Unknown error"))
        return None

    # Parse traffic response - enhanced parsing with multiple fallback strategies
    # Try multiple possible response structures
    traffic_data = (
        payload.get("traffic") or
        payload.get("data") or
        payload.get("result") or
        payload.get("trafficInfo") or
        payload.get("tiles") or
        {}
    )

    # If traffic_data is a list, try to get the first item or aggregate
    if isinstance(traffic_data, list) and traffic_data:
        traffic_data = traffic_data[0] if len(traffic_data) == 1 else {"items": traffic_data}

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

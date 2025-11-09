from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import httpx

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


def _post(path: str, data: dict[str, Any], *, language: str | None = None) -> dict[str, Any]:
    if not gomap_enabled():
        raise RuntimeError("GoMap API is not configured")
    payload = {
        **data,
        "guid": settings.GOMAP_GUID,
        "lng": _resolve_language(language),
    }
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


def search_objects(
    term: str, *, limit: int = 10, language: str | None = None
) -> list[dict[str, Any]]:
    if not gomap_enabled():
        return []
    query = term.strip()
    if not query:
        return []
    limit = max(1, min(limit, 10))
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

    return GoMapRoute(
        distance_km=distance_km,
        duration_seconds=duration_seconds,
        geometry=geometry,
        notice=notice,
        raw=payload,
    )


__all__ = [
    "GoMapRoute",
    "gomap_enabled",
    "route_directions",
    "search_objects",
    "reverse_geocode",
]

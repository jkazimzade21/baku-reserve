from __future__ import annotations

from backend.app import gomap


def test_route_directions_parses_distance_and_duration(monkeypatch):
    monkeypatch.setattr(gomap, "gomap_enabled", lambda: True)

    sample_payload = {
        "success": True,
        "distance": 6.4,
        "time": 7,
        "route": [[49.83, 40.37], [49.84, 40.38]],
        "msg": "Ideal road conditions",
    }

    monkeypatch.setattr(gomap, "_post", lambda *args, **kwargs: sample_payload)

    route = gomap.route_directions(40.37, 49.83, 40.38, 49.84)
    assert route is not None
    assert route.distance_km == 6.4
    assert route.duration_seconds == 420  # minutes converted to seconds
    assert route.geometry and len(route.geometry) == 2
    assert route.notice == "Ideal road conditions"


def test_route_directions_returns_none_on_failure(monkeypatch):
    monkeypatch.setattr(gomap, "gomap_enabled", lambda: True)
    monkeypatch.setattr(
        gomap, "_post", lambda *args, **kwargs: {"success": False, "msg": "Invalid"}
    )

    assert gomap.route_directions(0, 0, 0, 0) is None

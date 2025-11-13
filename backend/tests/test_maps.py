from __future__ import annotations

from backend.app import maps


def test_compute_eta_with_gomap(monkeypatch):
    class DummyRoute:
        distance_km = 5.2
        duration_seconds = 600
        notice = "Ideal road conditions"

    monkeypatch.setattr(maps, "gomap_route", lambda *args, **kwargs: DummyRoute())
    monkeypatch.setattr(maps, "osrm_route", lambda *args, **kwargs: None)
    monkeypatch.setattr(maps, "gomap_traffic", lambda *args, **kwargs: None)
    monkeypatch.setattr(maps.settings, "GOMAP_TRAFFIC_ENABLED", False)
    monkeypatch.setattr(maps.settings, "ETA_BUFFER_MINUTES", 0)
    monkeypatch.setattr(maps.settings, "ETA_HEAVY_BUFFER_MINUTES", 0)

    eta = maps.compute_eta_with_traffic(40.0, 49.0, 40.5, 49.5)
    assert eta is not None
    assert eta.provider == "gomap"
    assert eta.route_distance_km == 5.2
    assert eta.eta_minutes == 10
    assert eta.eta_seconds == 600
    assert eta.route_summary == "Ideal road conditions"


def test_compute_eta_with_gomap_none(monkeypatch):
    monkeypatch.setattr(maps, "gomap_route", lambda *args, **kwargs: None)
    assert maps.compute_eta_with_traffic(0, 0, 0, 0) is None

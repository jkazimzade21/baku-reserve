from pathlib import Path
from typing import Any
from uuid import UUID

import sentry_sdk
from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from sentry_sdk.integrations.fastapi import FastApiIntegration

from .api.routes import concierge as concierge_routes
from .api.routes import gomap as gomap_routes
from .api.routes import reservations as reservations_routes
from .api.routes import restaurants as restaurants_routes
from .api.types import CoordinateString
from .api.utils import haversine_km, parse_coordinate_string
from .api_v1 import v1_router
from .auth import require_auth
from .backup import backup_manager
from .cache import clear_all_caches, get_all_cache_stats
from .concierge_service import concierge_service
from .gomap import route_directions
from .health import health_checker
from .logging_config import configure_structlog, get_logger
from .maps import search_places
from .metrics import PrometheusMiddleware, get_metrics
from .settings import settings
from .storage import DB
from .ui import router as ui_router
from .utils import add_cors, add_rate_limiting, add_request_id_tracing, add_security_headers
from .versioning import APIVersionMiddleware

REPO_ROOT = Path(__file__).resolve().parents[2]
PHOTO_DIR = (REPO_ROOT / "IGPics").resolve()

# Configure structured logging (must be done before any logging calls)
configure_structlog(json_logs=not settings.DEBUG)

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=settings.SENTRY_RELEASE or "baku-reserve@dev",
        integrations=[FastApiIntegration()],
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
    )

app = FastAPI(
    title="Baku Reserve API",
    version="0.1.0",
    description="Restaurant reservation system for Baku, Azerbaijan",
)
add_cors(app)
add_security_headers(app)
add_request_id_tracing(app)
add_rate_limiting(app)
app.add_middleware(APIVersionMiddleware, current_version="1.0", latest_version="1.0")
app.add_middleware(PrometheusMiddleware)


@app.on_event("startup")
async def concierge_startup() -> None:
    await concierge_service.startup()


@app.on_event("shutdown")
async def concierge_shutdown() -> None:
    await concierge_service.shutdown()


# Include v1 API router (versioned endpoints)
def include_router_on_both(router: APIRouter):
    app.include_router(router)
    app.include_router(router, prefix="/v1")


include_router_on_both(restaurants_routes.router)
include_router_on_both(reservations_routes.router)
include_router_on_both(gomap_routes.router)
include_router_on_both(concierge_routes.router)
app.include_router(v1_router)

# Include UI router (admin/booking console)
app.include_router(ui_router)
if PHOTO_DIR.exists():
    app.mount(
        "/assets/restaurants", StaticFiles(directory=str(PHOTO_DIR)), name="restaurant-photos"
    )

# Use structlog for structured logging
logger = get_logger(__name__)


def register_on_both(method: str, path: str, **kwargs):
    """Register endpoint on legacy and versioned routers."""

    def decorator(func):
        getattr(app, method)(path, **kwargs)(func)
        getattr(v1_router, method)(path, **kwargs)(func)
        return func

    return decorator


@register_on_both("get", "/health")
async def health():
    """Return service health including upstream dependency checks."""
    health_status = await health_checker.check_all()
    status_code = 200 if health_status["status"] == "healthy" else 503
    health_status["service"] = "baku-reserve"
    health_status["version"] = "0.1.0"

    from fastapi.responses import JSONResponse

    return JSONResponse(content=health_status, status_code=status_code)


@register_on_both("get", "/metrics")
def metrics():
    """Expose Prometheus metrics."""
    return get_metrics()


if settings.DEBUG:

    @app.post("/dev/sentry-test")
    def dev_sentry_test(message: str = Body("manual ping", embed=True)):
        sentry_sdk.capture_message(f"[dev-sentry-test] {message}")
        return {"ok": True, "message": message}

    @app.post("/dev/cache/clear")
    def dev_clear_caches():
        clear_all_caches()
        return {"ok": True, "cleared": True}

    @app.get("/dev/cache/stats")
    def dev_cache_stats():
        return get_all_cache_stats()

    @app.post("/dev/backup/create")
    def dev_create_backup(description: str | None = None):
        """Create a manual backup of the database."""
        try:
            backup_path = backup_manager.create_backup(description=description)
            return {
                "ok": True,
                "backup_path": str(backup_path),
                "message": "Backup created successfully",
            }
        except Exception as exc:
            raise HTTPException(500, f"Backup failed: {exc}")

    @app.get("/dev/backup/list")
    def dev_list_backups():
        """List all available backups."""
        backups = backup_manager.list_backups()
        return {"ok": True, "backups": backups, "count": len(backups)}

    @app.post("/dev/backup/restore/{backup_name}")
    def dev_restore_backup(backup_name: str):
        """Restore database from a backup."""
        try:
            backup_manager.restore_backup(backup_name)
            return {
                "ok": True,
                "message": f"Database restored from {backup_name}",
            }
        except FileNotFoundError:
            raise HTTPException(404, f"Backup not found: {backup_name}")
        except Exception as exc:
            raise HTTPException(500, f"Restore failed: {exc}")

    @app.get("/dev/routes/compare")
    def dev_route_compare(
        origin: CoordinateString,
        destination: CoordinateString,
    ):
        o_lat, o_lon = parse_coordinate_string(origin)
        d_lat, d_lon = parse_coordinate_string(destination)
        from .gomap import route_directions as _gomap_route
        from .osrm import route as _osrm_route

        gomap_result = _gomap_route(o_lat, o_lon, d_lat, d_lon)
        osrm_result = _osrm_route(o_lat, o_lon, d_lat, d_lon)
        return {
            "origin": {"lat": o_lat, "lon": o_lon},
            "destination": {"lat": d_lat, "lon": d_lon},
            "gomap": {
                "distance_km": gomap_result.distance_km if gomap_result else None,
                "duration_seconds": gomap_result.duration_seconds if gomap_result else None,
            },
            "osrm": {
                "distance_km": osrm_result.distance_km if osrm_result else None,
                "duration_seconds": osrm_result.duration_seconds if osrm_result else None,
            },
            "haversine_km": haversine_km(o_lat, o_lon, d_lat, d_lon),
        }


@app.get("/config/features")
def feature_flags():
    gomap_ready = bool(settings.GOMAP_GUID)
    return {
        "prep_notify_enabled": settings.PREP_NOTIFY_ENABLED,
        "payments_mode": settings.PAYMENTS_MODE,
        "payment_provider": settings.PAYMENT_PROVIDER,
        "currency": settings.CURRENCY,
        "maps_api_key_present": gomap_ready,
        "gomap_ready": gomap_ready,
    }


# ---------- root redirect to docs ----------
@app.get("/", include_in_schema=False)
def root_redirect():
    # Redirect browsers straight to the booking console.
    return RedirectResponse(url="/book/", status_code=307)


# ---------- endpoints ----------


@app.get("/auth/session", response_model=dict)
def session_info(claims: dict[str, Any] = Depends(require_auth)):
    return {
        "user": {
            "sub": claims.get("sub"),
            "email": claims.get("email"),
            "name": claims.get("name"),
        }
    }


def _require_reservation(resid: UUID) -> dict[str, Any]:
    record = DB.get_reservation(str(resid))
    if not record:
        raise HTTPException(404, "Reservation not found")
    if record.get("status") != "booked":
        raise HTTPException(409, "Reservation is not active")
    return record

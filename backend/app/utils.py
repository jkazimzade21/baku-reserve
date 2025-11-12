from __future__ import annotations

import asyncio
import math
import time
from collections import defaultdict, deque

from fastapi import Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .settings import settings


def add_cors(app):
    origins = settings.allow_origins
    if not origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        response = await call_next(request)
        headers = {
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        }
        if request.url.scheme in {"https", "wss"}:
            headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        for key, value in headers.items():
            response.headers.setdefault(key, value)
        return response


def add_security_headers(app):
    app.add_middleware(SecurityHeadersMiddleware)


class RateLimiter:
    def __init__(self) -> None:
        self._history: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next):
        limit = settings.RATE_LIMIT_REQUESTS
        window = settings.RATE_LIMIT_WINDOW_SECONDS
        if (
            not settings.RATE_LIMIT_ENABLED
            or limit <= 0
            or window <= 0
        ):
            return await call_next(request)

        identifier = self._identifier_for(request)
        now = time.monotonic()
        async with self._lock:
            bucket = self._history[identifier]
            cutoff = now - window
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = max(1, math.ceil(window - (now - bucket[0])))
                headers = {
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(retry_after),
                }
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests"},
                    headers=headers,
                )
            bucket.append(now)
            remaining = max(0, limit - len(bucket))
            reset_in = max(0, math.ceil(window - (now - bucket[0])))

        response = await call_next(request)
        response.headers.setdefault("X-RateLimit-Limit", str(limit))
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_in)
        return response

    def reset(self) -> None:
        self._history.clear()

    def _identifier_for(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "anonymous"


def add_rate_limiting(app):
    limiter = RateLimiter()
    app.state.rate_limiter = limiter

    @app.middleware("http")
    async def _rate_limit(request: Request, call_next):  # type: ignore[override]
        return await limiter.dispatch(request, call_next)

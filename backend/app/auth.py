from __future__ import annotations

import time
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt

from .settings import settings

security = HTTPBearer(auto_error=False)
AuthCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(security)]


class Auth0Verifier:
    def __init__(self) -> None:
        self._jwks: dict[str, Any] | None = None
        self._jwks_expiry: float = 0.0

    def _fetch_jwks(self) -> dict[str, Any]:
        issuer = settings.auth0_issuer
        if not issuer:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AUTH0_DOMAIN is not configured",
            )
        url = issuer.rstrip("/") + "/.well-known/jwks.json"
        try:
            resp = httpx.get(url, timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # pragma: no cover - network failures
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to fetch Auth0 JWKS",
            ) from exc

    def _get_jwks(self) -> dict[str, Any]:
        now = time.time()
        if self._jwks and now < self._jwks_expiry:
            return self._jwks
        jwks = self._fetch_jwks()
        self._jwks = jwks
        self._jwks_expiry = now + 60 * 15  # cache for 15 minutes
        return jwks

    def verify(self, token: str) -> dict[str, Any]:
        audience = settings.AUTH0_AUDIENCE
        issuer = settings.auth0_issuer
        if not audience or not issuer:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Auth0 audience/domain not configured",
            )

        jwks = self._get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header")
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown token signature")
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=audience,
                issuer=issuer.rstrip("/") + "/",
            )
        except Exception as exc:  # pragma: no cover - jose already well-tested
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
        return payload


auth0_verifier = Auth0Verifier()


async def require_auth(credentials: AuthCredentials) -> dict[str, Any]:
    """FastAPI dependency enforcing Auth0 authentication."""

    if settings.AUTH0_BYPASS:
        # Use deterministic local claims for development/tests
        return {
            "sub": "local-dev-user",
            "scope": "demo",
            "email": "dev@bakureserve.local",
            "name": "Local Dev",
        }

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")

    token = credentials.credentials
    return auth0_verifier.verify(token)

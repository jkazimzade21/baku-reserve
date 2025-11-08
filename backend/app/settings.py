from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # whether to expose the debug config endpoint
    DEBUG: bool = True

    # persistence directory (defaults to app/data)
    DATA_DIR: Path | None = None

    # CORS allow origins (comma-separated). Default "*" for dev.
    CORS_ALLOW_ORIGINS: str = "*"

    # Feature flags
    PREP_NOTIFY_ENABLED: bool = False

    # Payments / deposits
    PAYMENTS_MODE: Literal["mock", "live"] = "mock"
    PAYMENT_PROVIDER: Literal["mock", "paymentwall", "azericard"] = "mock"
    CURRENCY: str = "AZN"
    DEFAULT_STARTERS_DEPOSIT_PER_GUEST: int = 10  # in major units
    DEFAULT_FULL_DEPOSIT_PER_GUEST: int = 30  # in major units
    MAPS_API_KEY: str | None = None
    PREP_POLICY_TEXT: str = (
        "Deposit applied to the final bill; may be forfeited if arrival is delayed beyond the grace window."
    )

    # Auth0 integration
    AUTH0_DOMAIN: str | None = None
    AUTH0_AUDIENCE: str | None = None
    AUTH0_BYPASS: bool = True  # allow local/dev without SSO

    @property
    def allow_origins(self) -> list[str]:
        s = (self.CORS_ALLOW_ORIGINS or "").strip()
        if s == "" or s == "*":
            return ["*"]
        return [part.strip() for part in s.split(",") if part.strip()]

    def deposit_amount_minor(self, scope: str, party_size: int) -> int:
        """Return deposit amount for given scope (in minor currency units)."""
        per_guest_major = (
            self.DEFAULT_STARTERS_DEPOSIT_PER_GUEST
            if scope == "starters"
            else self.DEFAULT_FULL_DEPOSIT_PER_GUEST
        )
        party = max(1, int(party_size or 1))
        return per_guest_major * party * 100

    @property
    def data_dir(self) -> Path:
        # default to <this file>/data when not set
        if self.DATA_DIR:
            return Path(self.DATA_DIR).expanduser().resolve()
        return (Path(__file__).resolve().parent / "data").resolve()

    @property
    def auth0_issuer(self) -> str | None:
        if not self.AUTH0_DOMAIN:
            return None
        domain = self.AUTH0_DOMAIN.removeprefix("https://").removeprefix("http://")
        return f"https://{domain}/"


settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)

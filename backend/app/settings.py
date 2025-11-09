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

    # Payments / currency metadata (no deposits required)
    PAYMENTS_MODE: Literal["mock", "live"] = "mock"
    PAYMENT_PROVIDER: Literal["mock", "paymentwall", "azericard"] = "mock"
    CURRENCY: str = "AZN"
    GOMAP_GUID: str | None = None
    GOMAP_BASE_URL: str = "https://api.gomap.az/Main.asmx"
    GOMAP_DEFAULT_LANGUAGE: Literal["az", "en", "ru"] = "az"
    GOMAP_TIMEOUT_SECONDS: float = 4.0
    PREP_POLICY_TEXT: str = (
        "We ping the kitchen once you're en route; cancel or adjust if your plans change."
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

    @property
    def data_dir(self) -> Path:
        if self.DATA_DIR:
            return Path(self.DATA_DIR).expanduser().resolve()
        return (Path.home() / ".baku-reserve-data").resolve()

    @property
    def auth0_issuer(self) -> str | None:
        if not self.AUTH0_DOMAIN:
            return None
        domain = self.AUTH0_DOMAIN.removeprefix("https://").removeprefix("http://")
        return f"https://{domain}/"


settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)

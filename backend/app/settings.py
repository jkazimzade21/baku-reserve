from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE), env_file_encoding="utf-8", extra="ignore"
    )

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

    # Concierge AI
    OPENAI_API_KEY: str | None = None
    CONCIERGE_GPT_MODEL: str = "gpt-3.5-turbo-0125"
    CONCIERGE_EMBED_MODEL: str = "text-embedding-3-small"
    CONCIERGE_MODE: Literal["local", "ai", "ab"] = "local"
    CONCIERGE_WEIGHTS: str = "alpha=1.0,beta=1.2,gamma=1.0,delta=0.8,epsilon=0.8,zeta=0.4,eta=1.0"
    AI_SCORE_FLOOR: float = 0.0

    # Observability
    SENTRY_DSN: str | None = None
    SENTRY_ENVIRONMENT: str = "development"
    SENTRY_RELEASE: str | None = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2

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

    @property
    def parsed_concierge_weights(self) -> "ConciergeWeights":
        return ConciergeWeights.from_string(self.CONCIERGE_WEIGHTS)


@dataclass(slots=True)
class ConciergeWeights:
    alpha: float = 1.0
    beta: float = 1.2
    gamma: float = 1.0
    delta: float = 0.8
    epsilon: float = 0.8
    zeta: float = 0.4
    eta: float = 1.0

    @classmethod
    def from_string(cls, payload: str | None) -> "ConciergeWeights":
        base = cls()
        if not payload:
            return base
        mapping: dict[str, float] = {}
        for part in payload.split(","):
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            key = key.strip().lower()
            try:
                mapping[key] = float(value.strip())
            except ValueError:
                continue
        return cls(
            alpha=mapping.get("alpha", base.alpha),
            beta=mapping.get("beta", base.beta),
            gamma=mapping.get("gamma", base.gamma),
            delta=mapping.get("delta", base.delta),
            epsilon=mapping.get("epsilon", base.epsilon),
            zeta=mapping.get("zeta", base.zeta),
            eta=mapping.get("eta", base.eta),
        )


settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)

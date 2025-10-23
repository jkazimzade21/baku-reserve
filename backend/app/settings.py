from __future__ import annotations
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AnyHttpUrl, field_validator
from typing import List, Optional
from pathlib import Path

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # whether to expose the debug config endpoint
    DEBUG: bool = True

    # persistence directory (defaults to app/data)
    DATA_DIR: Optional[Path] = None

    # CORS allow origins (comma-separated). Default "*" for dev.
    CORS_ALLOW_ORIGINS: str = "*"

    @property
    def allow_origins(self) -> List[str]:
        s = (self.CORS_ALLOW_ORIGINS or "").strip()
        if s == "" or s == "*":
            return ["*"]
        return [part.strip() for part in s.split(",") if part.strip()]

    @property
    def data_dir(self) -> Path:
        # default to <this file>/data when not set
        if self.DATA_DIR:
            return Path(self.DATA_DIR).expanduser().resolve()
        return (Path(__file__).resolve().parent / "data").resolve()

settings = Settings()
# make sure directory exists when imported
settings.data_dir.mkdir(parents=True, exist_ok=True)

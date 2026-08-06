from pathlib import Path
from typing import Any

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .constants import (
    DEFAULT_API_PREFIX,
    DEFAULT_APP_NAME,
    DEFAULT_APP_VERSION,
    DEFAULT_CORS_ORIGINS,
    DEFAULT_DEBUG,
    DEFAULT_ENVIRONMENT,
    DEFAULT_LOG_LEVEL,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_nested_delimiter="__",
        populate_by_name=True,
    )

    app_name: str = Field(default=DEFAULT_APP_NAME)
    app_version: str = Field(default=DEFAULT_APP_VERSION)
    environment: str = Field(default=DEFAULT_ENVIRONMENT)
    debug: bool = Field(default=DEFAULT_DEBUG)
    api_prefix: str = Field(default=DEFAULT_API_PREFIX)
    cors_origins: str = Field(default=",".join(DEFAULT_CORS_ORIGINS))
    utl_email: str
    utl_password: str
    utl_device_id: str
    database_url: str
    weather_provider: str
    weather_api_key: str
    log_level: str = Field(default=DEFAULT_LOG_LEVEL)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> str:
        if value is None:
            return ",".join(DEFAULT_CORS_ORIGINS)
        if isinstance(value, list):
            return ",".join(str(item).strip() for item in value if str(item).strip())
        return str(value)

    @property
    def cors_origins_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in {"1", "true", "yes", "on"}
        return bool(value)


try:
    settings = Settings()
except ValidationError as exc:
    raise RuntimeError(f"Invalid application configuration: {exc}") from exc

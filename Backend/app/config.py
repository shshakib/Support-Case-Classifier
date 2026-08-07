"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    """Runtime settings for the API and model providers."""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Support Case Classifier API"
    environment: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    data_dir: Path = BACKEND_DIR / "data"
    log_dir: Path = BACKEND_DIR / "logs"
    log_level: str = "INFO"

    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4o-mini"
    openai_max_concurrency: int = Field(default=4, ge=1, le=20)

    google_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash-lite"
    gemini_max_concurrency: int = Field(default=4, ge=1, le=20)

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    ollama_max_concurrency: int = Field(default=1, ge=1, le=8)

    model_timeout_seconds: float = Field(default=90, ge=5, le=600)
    model_max_retries: int = Field(default=2, ge=0, le=6)
    max_cases_per_request: int = Field(default=200, ge=1, le=2_000)

    @property
    def allowed_origins(self) -> list[str]:
        """Return normalized CORS origins."""

        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""

    return Settings()

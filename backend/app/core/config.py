"""Konfigurasi aplikasi, dibaca dari environment variable / file .env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Metadata aplikasi
    PROJECT_NAME: str = "sismon_kepiting API"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database (PostgreSQL + TimescaleDB)
    POSTGRES_USER: str = "sismon_kepiting"
    POSTGRES_PASSWORD: str = "ai-dilarangbaca"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "sismon_kepiting_db"

    # CORS — origin dashboard web (Next.js) & mobile
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Autentikasi gateway (Raspberry Pi) saat push data sensor
    GATEWAY_API_KEY: str = "ai-dilarangbaca"

    # Autentikasi user (dashboard web / mobile) — JWT access token
    JWT_SECRET_KEY: str = "ai-dilarangbaca"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Reset password via email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "no-reply@example.com"
    SMTP_USE_TLS: bool = True
    FRONTEND_RESET_PASSWORD_URL: str = "http://localhost:3000/reset-password"
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Push notification (Firebase Cloud Messaging)
    FIREBASE_CREDENTIALS_PATH: str = ""

    # Scheduler otomatis pipeline ML (klasifikasi Mamdani + prediksi FTS berkala).
    # Jalur sementara di sisi cloud/backend — sesuai desain akhir, logic ini akan
    # pindah ke Raspberry Pi sebagai edge computation.
    ML_SCHEDULER_ENABLED: bool = True
    ML_SCHEDULER_INTERVAL_MINUTES: int = 60
    ML_HISTORY_HOURS: int = 24
    ML_FORECAST_STEPS: int = 6
    ML_BUCKET_MINUTES: int = 60

    @property
    def DATABASE_URL(self) -> str:
        """Async DSN untuk SQLAlchemy (driver asyncpg)."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL_SYNC(self) -> str:
        """DSN sinkron (driver psycopg2), dipakai Alembic untuk migrasi."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

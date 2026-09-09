"""Konfigurasi aplikasi, dibaca dari environment variable / file .env."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Seluruh setelan aplikasi. Nilai di bawah = default kalau .env tidak mengisinya."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Metadata aplikasi
    PROJECT_NAME: str = "KrabCare API"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database (PostgreSQL + TimescaleDB)
    POSTGRES_USER: str = "krabcare"
    POSTGRES_PASSWORD: str = "ai-dilarangbaca"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "krabcare_db"

    # CORS, origin dashboard web (Next.js) & mobile
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Autentikasi gateway (Raspberry Pi) saat push data sensor
    GATEWAY_API_KEY: str = "ai-dilarangbaca"

    # Autentikasi user (dashboard web / mobile), JWT access token
    JWT_SECRET_KEY: str = "ai-dilarangbaca"
    # 30 hari. Sebelumnya 24 jam, dan karena tidak ada refresh token, tiap
    # pemakai praktis harus login ulang tiap hari, terbaca seperti "tiap
    # menutup browser jadi logout". Token disimpan di localStorage (bukan
    # sessionStorage), jadi menutup tab memang tidak pernah jadi penyebabnya.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30

    # Reset password via email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "no-reply@example.com"
    SMTP_USE_TLS: bool = True
    FRONTEND_RESET_PASSWORD_URL: str = "http://localhost:3000/reset-password"
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    FRONTEND_VERIFY_EMAIL_URL: str = "http://localhost:3000/verifikasi-email"
    # Sengaja pendek. Konsekuensinya link sering keburu kedaluwarsa karena
    # pengiriman email saja bisa memakan sebagian jatahnya, jadi tombol kirim
    # ulang di halaman /verifikasi-email itu bagian penting dari alurnya,
    # bukan pelengkap. Bisa ditimpa lewat .env tanpa mengubah kode.
    EMAIL_VERIFY_TOKEN_EXPIRE_MINUTES: int = 5

    # Push notification (Firebase Cloud Messaging)
    FIREBASE_CREDENTIALS_PATH: str = ""

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """Tolak start kalau production masih pakai secret placeholder / DEBUG on.

        Placeholder `ai-dilarangbaca` ada di repo publik, kalau terbawa ke VPS,
        API dan database praktis terbuka. Dev tidak terpengaruh.
        """
        if self.ENVIRONMENT != "production":
            return self
        weak = {"ai-dilarangbaca", "change-me", "change-me-too", ""}
        problems = []
        if self.JWT_SECRET_KEY in weak:
            problems.append("JWT_SECRET_KEY")
        if self.GATEWAY_API_KEY in weak:
            problems.append("GATEWAY_API_KEY")
        if self.POSTGRES_PASSWORD in weak:
            problems.append("POSTGRES_PASSWORD")
        if self.DEBUG:
            problems.append("DEBUG harus false di production")
        if problems:
            raise ValueError(
                "Konfigurasi production tidak aman, masih memakai nilai placeholder "
                f"atau setelan development: {', '.join(problems)}"
            )
        return self

    @property
    def DATABASE_URL(self) -> str:
        """DSN async (asyncpg), dipakai aplikasi."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL_SYNC(self) -> str:
        """DSN sinkron (psycopg2), dipakai Alembic."""
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


@lru_cache
def get_settings() -> Settings:
    """Settings dibaca sekali lalu di-cache; import `settings` di bawah untuk pakai."""
    return Settings()


settings = get_settings()

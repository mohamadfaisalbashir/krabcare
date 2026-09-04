"""Entry point aplikasi FastAPI — KrabCare Backend."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, devices, health, ingest, kolam, notifications, quality, readings
from app.services.scheduler import shutdown_scheduler, start_scheduler

# Root logger default-nya WARNING — tanpa ini logger.info() modul lain (scheduler) tidak tampil.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Nyalakan scheduler ML saat startup, matikan saat shutdown."""
    start_scheduler()
    yield
    shutdown_scheduler()


def create_app() -> FastAPI:
    """Rakit app: middleware CORS + semua router (v1 di-prefix /api/v1)."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    # Di DEVELOPMENT saja: terima juga origin LAN (mis. http://192.168.1.7:3000)
    # supaya dashboard bisa dibuka dari HP di WiFi yang sama. Tanpa ini setiap
    # POST dari alamat non-localhost mati di preflight dan browser cuma melapor
    # "Failed to fetch" — yang di UI menyamar jadi "gagal membuat kolam".
    # PRODUCTION tidak berubah: hanya CORS_ORIGINS eksplisit yang diterima.
    origin_regex = (
        r"^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+"
        r"|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
        if settings.ENVIRONMENT == "development"
        else None
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
    app.include_router(kolam.router, prefix=settings.API_V1_PREFIX)
    app.include_router(devices.router, prefix=settings.API_V1_PREFIX)
    app.include_router(ingest.router, prefix=settings.API_V1_PREFIX)
    app.include_router(readings.router, prefix=settings.API_V1_PREFIX)
    app.include_router(quality.router, prefix=settings.API_V1_PREFIX)
    app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()

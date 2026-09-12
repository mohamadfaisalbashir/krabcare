"""Entry point aplikasi FastAPI, KrabCare Backend."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, devices, health, ingest, kolam, notifications, quality, readings

# Root logger default-nya WARNING, tanpa ini logger.info() modul lain tidak tampil.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    """Rakit app: middleware CORS + semua router (v1 di-prefix /api/v1).

    Tidak ada lifespan atau scheduler. Klasifikasi Mamdani, forecast, dan
    risiko amonia dihitung di edge (raspi/edge_pipeline.py) lalu masuk lewat
    POST /ingest/quality; backend cuma menyimpan dan melayani permintaan.
    """
    app = FastAPI(
        title=settings.PROJECT_NAME,
        debug=settings.DEBUG,
    )

    # Development saja: terima juga origin LAN (misal http://192.168.1.7:3000)
    # supaya dashboard bisa dibuka dari HP di WiFi yang sama. Tanpa ini POST
    # dari alamat non-localhost mati di preflight sebagai "Failed to fetch".
    # Production tetap hanya menerima CORS_ORIGINS eksplisit.
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

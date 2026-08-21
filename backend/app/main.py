"""Entry point aplikasi FastAPI — sismon_kepiting Backend."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import auth, health, ingest, kolam, notifications, quality, readings
from app.services.scheduler import shutdown_scheduler, start_scheduler

# Tanpa ini logger.info() di modul lain (mis. scheduler) tidak tampil —
# root logger default-nya WARNING.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    shutdown_scheduler()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
    app.include_router(kolam.router, prefix=settings.API_V1_PREFIX)
    app.include_router(ingest.router, prefix=settings.API_V1_PREFIX)
    app.include_router(readings.router, prefix=settings.API_V1_PREFIX)
    app.include_router(quality.router, prefix=settings.API_V1_PREFIX)
    app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)

    return app


app = create_app()

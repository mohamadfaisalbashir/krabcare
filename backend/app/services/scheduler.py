"""Scheduler APScheduler untuk pipeline ML otomatis (klasifikasi + prediksi berkala).

Jalur sementara di sisi backend/cloud — menggantikan run manual script
ml/scripts/test_e2e_classification.py & forecast_anomaly_scan.py untuk operasi
rutin. Kedua script itu TETAP ada untuk debugging manual, tidak dihapus.
"""

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import Device, Kolam
from app.services import ml_pipeline_service

logger = logging.getLogger("app.services.scheduler")

_scheduler = AsyncIOScheduler()


async def _run_pipeline_all_devices() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device, Kolam)
            .join(Kolam, Device.kolam_id == Kolam.id)
            .where(Device.is_active.is_(True))
        )
        rows = result.all()

        if not rows:
            logger.info("Siklus ML dilewati: belum ada device yang diklaim ke kolam mana pun.")
            return

        logger.info("Mulai siklus ML untuk %d device terklaim.", len(rows))
        for device, kolam in rows:
            try:
                summary = await ml_pipeline_service.run_pipeline_for_device(
                    db,
                    device,
                    kolam=kolam,
                    history_hours=settings.ML_HISTORY_HOURS,
                    bucket_minutes=settings.ML_BUCKET_MINUTES,
                    forecast_steps=settings.ML_FORECAST_STEPS,
                )
                logger.info("[%s] %s", device.device_code, summary)
            except Exception:
                logger.exception("Siklus ML gagal untuk device '%s'", device.device_code)


def start_scheduler() -> None:
    if not settings.ML_SCHEDULER_ENABLED:
        logger.info("ML_SCHEDULER_ENABLED=false — scheduler tidak dijalankan.")
        return
    _scheduler.add_job(
        _run_pipeline_all_devices,
        trigger=IntervalTrigger(minutes=settings.ML_SCHEDULER_INTERVAL_MINUTES),
        id="ml_pipeline_cycle",
        coalesce=True,
        max_instances=1,
        # next_run_time=None di APScheduler = job tidak dijadwalkan sama sekali,
        # jadi harus eksplisit "sekarang" biar siklus pertama langsung jalan.
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    logger.info(
        "ML scheduler aktif, interval %d menit.", settings.ML_SCHEDULER_INTERVAL_MINUTES
    )


def shutdown_scheduler() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)

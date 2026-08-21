"""Pipeline ML otomatis: klasifikasi Mamdani + prediksi FTS per device.

Dipanggil scheduler (scheduler.py). Sementara jalan di backend/cloud — di desain
akhir pindah ke Raspberry Pi. Manggil service ingest langsung (bukan lewat HTTP)
karena satu proses, jadi idempotensi ON CONFLICT DO NOTHING-nya ikut gratis.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Kolam, SensorReading
from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn
from app.services import notification_service, quality_ingest_service
from ml.fuzzy.aggregation import aggregate_by_time_bucket
from ml.fuzzy.fts import forecast_multi_step
from ml.fuzzy.mamdani import classify_water_quality

logger = logging.getLogger("app.services.ml_pipeline_service")

_ANOMALY_CATEGORIES = {"sedang", "buruk"}


async def _fetch_readings_as_dicts(
    db: AsyncSession, device_id: int, history_hours: int
) -> list[dict]:
    """Reading mentah device ini, urut ASC, siap pakai aggregate_by_time_bucket().

    Query langsung, bukan reuse reading_service.get_readings (itu urut DESC +
    join device_code, beda bentuk). Numeric SQLAlchemy balik sebagai Decimal,
    di-cast float supaya bisa dihitung aggregate_by_time_bucket/forecast_next.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=history_hours)
    stmt = (
        select(SensorReading)
        .where(SensorReading.device_id == device_id, SensorReading.time >= since)
        .order_by(SensorReading.time.asc())
    )
    result = await db.execute(stmt)
    readings = result.scalars().all()

    return [
        {
            "time": r.time.isoformat(),
            "ph": float(r.ph) if r.ph is not None else None,
            "temperature_c": float(r.temperature_c) if r.temperature_c is not None else None,
            "salinity_ppt": float(r.salinity_ppt) if r.salinity_ppt is not None else None,
        }
        for r in readings
    ]


async def run_pipeline_for_device(
    db: AsyncSession,
    device: Device,
    kolam: Kolam,
    *,
    history_hours: int,
    bucket_minutes: int,
    forecast_steps: int,
) -> dict:
    """Satu siklus klasifikasi + prediksi untuk satu device.

    Exception (selain insufficient-data yang di-guard di sini) ditangkap di
    pemanggil (scheduler job), bukan di sini — satu device gagal tidak boleh
    menghentikan device lain di siklus yang sama.
    """
    readings = await _fetch_readings_as_dicts(db, device.id, history_hours)

    ph_buckets = aggregate_by_time_bucket(readings, "ph", bucket_minutes)
    temp_buckets = aggregate_by_time_bucket(readings, "temperature_c", bucket_minutes)
    salinity_buckets = aggregate_by_time_bucket(readings, "salinity_ppt", bucket_minutes)

    n_buckets = {
        "ph": len(ph_buckets),
        "suhu": len(temp_buckets),
        "salinitas": len(salinity_buckets),
    }

    if min(n_buckets.values()) < 1:
        logger.warning(
            "[%s] Data tidak cukup untuk klasifikasi (bucket per parameter: %s).",
            device.device_code,
            n_buckets,
        )
        return {
            "device_code": device.device_code,
            "status": "insufficient_data",
            "n_buckets": n_buckets,
        }

    last_ph = ph_buckets[-1][1]
    last_temp = temp_buckets[-1][1]
    last_salinity = salinity_buckets[-1][1]
    last_bucket_time = max(ph_buckets[-1][0], temp_buckets[-1][0], salinity_buckets[-1][0])

    now = datetime.now(timezone.utc)

    classification_result = classify_water_quality(
        ph=last_ph, temperature_c=last_temp, salinity_ppt=last_salinity
    )
    classification_in = FuzzyClassificationIn(
        device_code=device.device_code,
        time=now,
        sensor_reading_time=last_bucket_time,
        quality_score=classification_result["quality_score"],
        quality_category=classification_result["quality_category"],
        membership_degrees=classification_result["membership_degrees"],
        model_version="fuzzy-logic",
    )
    await quality_ingest_service.ingest_classifications(db, [classification_in])
    classification_notif = await notification_service.create_classification_notification(
        db,
        device,
        kolam,
        classification_result["quality_category"],
        classification_result["quality_score"],
        last_bucket_time,
    )

    logger.info(
        "[%s] Klasifikasi: skor=%.2f kategori=%s (bucket: %s)",
        device.device_code,
        classification_result["quality_score"],
        classification_result["quality_category"],
        n_buckets,
    )

    if min(n_buckets.values()) < 2:
        logger.info(
            "[%s] Data belum cukup untuk forecast (butuh >=2 bucket per parameter, "
            "ada %s) — lewati prediksi.",
            device.device_code,
            n_buckets,
        )
        return {
            "device_code": device.device_code,
            "status": "classified_only",
            "n_buckets": n_buckets,
            "quality_category": classification_result["quality_category"],
            "anomali_terdeteksi": [],
        }

    ph_history = [v for _, v in ph_buckets]
    temp_history = [v for _, v in temp_buckets]
    salinity_history = [v for _, v in salinity_buckets]

    ph_forecast = forecast_multi_step("ph", ph_history, forecast_steps)
    temp_forecast = forecast_multi_step("suhu", temp_history, forecast_steps)
    salinity_forecast = forecast_multi_step("salinitas", salinity_history, forecast_steps)

    predictions_in: list[FuzzyPredictionIn] = []
    anomali_terdeteksi: list[int] = []
    prediction_anomalies: list[dict] = []

    for h in range(1, forecast_steps + 1):
        result = classify_water_quality(
            ph=ph_forecast[h - 1],
            temperature_c=temp_forecast[h - 1],
            salinity_ppt=salinity_forecast[h - 1],
        )
        target_time = last_bucket_time + timedelta(minutes=h * bucket_minutes)

        predictions_in.append(
            FuzzyPredictionIn(
                device_code=device.device_code,
                time=now,
                target_time=target_time,
                horizon_minutes=h * bucket_minutes,
                predicted_quality_score=result["quality_score"],
                predicted_category=result["quality_category"],
                model_version="fts",
            )
        )

        if result["quality_category"] in _ANOMALY_CATEGORIES:
            anomali_terdeteksi.append(h)
            prediction_anomalies.append(
                {
                    "target_time": target_time,
                    "category": result["quality_category"],
                    "horizon_minutes": h * bucket_minutes,
                }
            )

    await quality_ingest_service.ingest_predictions(db, predictions_in)
    prediction_notifs = await notification_service.create_prediction_notifications(
        db, device, kolam, prediction_anomalies
    )

    if anomali_terdeteksi:
        logger.warning(
            "[%s] Anomali terdeteksi pada jam ke+%s dari sekarang (kategori sedang/buruk).",
            device.device_code,
            anomali_terdeteksi,
        )

    all_new = ([classification_notif] if classification_notif else []) + prediction_notifs
    if all_new:
        await notification_service.dispatch_push(db, all_new)

    return {
        "device_code": device.device_code,
        "status": "ok",
        "n_buckets": n_buckets,
        "quality_category": classification_result["quality_category"],
        "anomali_terdeteksi": anomali_terdeteksi,
    }

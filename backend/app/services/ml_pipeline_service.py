"""Satu siklus ML per device: klasifikasi Mamdani + prediksi FTS + notifikasi.

Dipanggil scheduler.py. Sementara jalan di backend/cloud — sesuai desain akhir
nanti pindah ke Raspberry Pi. Service ingest dipanggil langsung (bukan lewat
HTTP) karena satu proses, jadi idempotensi ON CONFLICT-nya ikut kepakai.
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
from ml.fuzzy.mamdani import ANOMALY_CATEGORIES, classify_water_quality

logger = logging.getLogger("app.services.ml_pipeline_service")


async def _load_readings(db: AsyncSession, device_id: int, history_hours: int) -> list[dict]:
    """Reading device ini (urut ASC) dalam bentuk dict siap masuk aggregate_by_time_bucket().

    Query sendiri, bukan reading_service.get_readings — itu urut DESC & ikut join
    device_code. Numeric SQLAlchemy balik sebagai Decimal, jadi di-cast float dulu.
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
    """Jalankan satu siklus klasifikasi + prediksi untuk satu device.

    Butuh >=1 bucket per parameter untuk klasifikasi dan >=2 untuk forecast; di
    bawah itu siklus berhenti lebih awal (status dilaporkan lewat return value).
    Exception lain sengaja dilempar ke pemanggil supaya device lain tetap jalan.
    """
    readings = await _load_readings(db, device.id, history_hours)

    # Reading mentah tidak selalu rapi intervalnya -> ratakan ke bucket per jam.
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

    # --- Klasifikasi kondisi sekarang ---
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
            "anomaly_steps": [],
        }

    # --- Prediksi beberapa jam ke depan ---
    # Waktu bucket ikut dilewatkan supaya FLR tidak dibentuk melintasi celah data
    # (device mati/offline beberapa jam) — lihat ml/fuzzy/fts.py:_build_flrg.
    ph_forecast = forecast_multi_step(
        "ph", [v for _, v in ph_buckets], forecast_steps,
        [t for t, _ in ph_buckets], bucket_minutes,
    )
    temp_forecast = forecast_multi_step(
        "suhu", [v for _, v in temp_buckets], forecast_steps,
        [t for t, _ in temp_buckets], bucket_minutes,
    )
    salinity_forecast = forecast_multi_step(
        "salinitas", [v for _, v in salinity_buckets], forecast_steps,
        [t for t, _ in salinity_buckets], bucket_minutes,
    )

    predictions_in: list[FuzzyPredictionIn] = []
    anomaly_steps: list[int] = []
    prediction_anomalies: list[dict] = []

    # Tiap langkah: gabungkan 3 nilai ramalan jadi satu kategori lewat Mamdani.
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
                # Nilai per parameter ikut disimpan, bukan cuma agregatnya —
                # web menampilkan tren tiap parameter, bukan satu skor gabungan.
                predicted_ph=ph_forecast[h - 1],
                predicted_temperature_c=temp_forecast[h - 1],
                predicted_salinity_ppt=salinity_forecast[h - 1],
                model_version="fts",
            )
        )

        if result["quality_category"] in ANOMALY_CATEGORIES:
            anomaly_steps.append(h)
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

    if anomaly_steps:
        logger.warning(
            "[%s] Anomali terdeteksi pada jam ke+%s dari sekarang (kategori sedang/buruk).",
            device.device_code,
            anomaly_steps,
        )

    # Push cuma untuk notifikasi yang benar-benar baru dibuat siklus ini.
    new_notifications = ([classification_notif] if classification_notif else []) + prediction_notifs
    if new_notifications:
        await notification_service.dispatch_push(db, new_notifications)

    return {
        "device_code": device.device_code,
        "status": "ok",
        "n_buckets": n_buckets,
        "quality_category": classification_result["quality_category"],
        "anomaly_steps": anomaly_steps,
    }

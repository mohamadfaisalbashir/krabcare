"""Logika penyimpanan hasil fuzzy logic (klasifikasi) & fuzzy time series (prediksi).

Mengikuti pola yang sama seperti ingest_service.py: device lookup by device_code,
insert idempoten (ON CONFLICT DO NOTHING), dan pelaporan device_code yang belum
terdaftar atau baris yang di-skip karena duplikat. Conflict target mengikuti PK
masing-masing tabel: fuzzy_classifications (device_id, time), fuzzy_predictions
(device_id, time, horizon_minutes) — prediksi butuh horizon_minutes karena satu
waktu forecast bisa menghasilkan banyak horizon sekaligus (multi-step forecast).
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, FuzzyClassification, FuzzyPrediction
from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn
from app.schemas.sensor_reading import SkippedDuplicateOut


async def _get_device_map(db: AsyncSession, device_codes: list[str]) -> dict[str, Device]:
    result = await db.execute(select(Device).where(Device.device_code.in_(device_codes)))
    return {d.device_code: d for d in result.scalars().all()}


async def ingest_classifications(
    db: AsyncSession, classifications: list[FuzzyClassificationIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    device_map = await _get_device_map(db, [c.device_code for c in classifications])
    unknown = sorted({c.device_code for c in classifications if c.device_code not in device_map})
    device_code_by_id = {d.id: code for code, d in device_map.items()}

    rows = [
        {
            "device_id": device_map[c.device_code].id,
            "time": c.time,
            "sensor_reading_time": c.sensor_reading_time,
            "quality_score": c.quality_score,
            "quality_category": c.quality_category,
            "membership_degrees": c.membership_degrees,
            "model_version": c.model_version,
        }
        for c in classifications
        if c.device_code in device_map
    ]

    inserted = 0
    skipped_duplicates: list[SkippedDuplicateOut] = []

    if rows:
        stmt = (
            pg_insert(FuzzyClassification)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=[FuzzyClassification.device_id, FuzzyClassification.time]
            )
            .returning(FuzzyClassification.device_id, FuzzyClassification.time)
        )
        result = await db.execute(stmt)
        inserted_keys: set[tuple[int, datetime]] = {(r.device_id, r.time) for r in result.all()}
        inserted = len(inserted_keys)

        skipped_duplicates = [
            SkippedDuplicateOut(device_code=device_code_by_id[row["device_id"]], time=row["time"])
            for row in rows
            if (row["device_id"], row["time"]) not in inserted_keys
        ]

        await db.commit()

    return inserted, unknown, skipped_duplicates


async def ingest_predictions(
    db: AsyncSession, predictions: list[FuzzyPredictionIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    device_map = await _get_device_map(db, [p.device_code for p in predictions])
    unknown = sorted({p.device_code for p in predictions if p.device_code not in device_map})
    device_code_by_id = {d.id: code for code, d in device_map.items()}

    rows = [
        {
            "device_id": device_map[p.device_code].id,
            "time": p.time,
            "target_time": p.target_time,
            "horizon_minutes": p.horizon_minutes,
            "predicted_quality_score": p.predicted_quality_score,
            "predicted_category": p.predicted_category,
            "model_version": p.model_version,
        }
        for p in predictions
        if p.device_code in device_map
    ]

    inserted = 0
    skipped_duplicates: list[SkippedDuplicateOut] = []

    if rows:
        # PK (device_id, time, horizon_minutes) — satu waktu forecast bisa punya
        # banyak horizon sekaligus (multi-step forecast), jadi horizon_minutes
        # WAJIB ikut jadi bagian conflict target, bukan cuma device_id+time.
        stmt = (
            pg_insert(FuzzyPrediction)
            .values(rows)
            .on_conflict_do_nothing(
                index_elements=[
                    FuzzyPrediction.device_id,
                    FuzzyPrediction.time,
                    FuzzyPrediction.horizon_minutes,
                ]
            )
            .returning(
                FuzzyPrediction.device_id, FuzzyPrediction.time, FuzzyPrediction.horizon_minutes
            )
        )
        result = await db.execute(stmt)
        inserted_keys: set[tuple[int, datetime, int]] = {
            (r.device_id, r.time, r.horizon_minutes) for r in result.all()
        }
        inserted = len(inserted_keys)

        skipped_duplicates = [
            SkippedDuplicateOut(
                device_code=device_code_by_id[row["device_id"]],
                time=row["time"],
                horizon_minutes=row["horizon_minutes"],
            )
            for row in rows
            if (row["device_id"], row["time"], row["horizon_minutes"]) not in inserted_keys
        ]

        await db.commit()

    return inserted, unknown, skipped_duplicates

"""Simpan hasil ML: klasifikasi Mamdani & prediksi FTS.

Pola sama dengan ingest_service.py (lookup device -> insert idempoten -> lapor
yang di-skip). Bedanya cuma conflict target, mengikuti PK tabel masing-masing.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FuzzyClassification, FuzzyPrediction
from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn
from app.schemas.sensor_reading import SkippedDuplicateOut
from app.services.ingest_base import find_devices_by_code, insert_skip_duplicates


async def ingest_classifications(
    db: AsyncSession, classifications: list[FuzzyClassificationIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    """Simpan batch klasifikasi; conflict target = PK (device_id, time)."""
    device_map = await find_devices_by_code(db, [c.device_code for c in classifications])
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
        inserted, skipped_rows = await insert_skip_duplicates(
            db,
            FuzzyClassification,
            rows,
            [FuzzyClassification.device_id, FuzzyClassification.time],
        )

        skipped_duplicates = [
            SkippedDuplicateOut(device_code=device_code_by_id[row["device_id"]], time=row["time"])
            for row in skipped_rows
        ]

        await db.commit()

    return inserted, unknown, skipped_duplicates


async def ingest_predictions(
    db: AsyncSession, predictions: list[FuzzyPredictionIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    """Simpan batch prediksi; conflict target ikut horizon_minutes (lihat catatan di bawah)."""
    device_map = await find_devices_by_code(db, [p.device_code for p in predictions])
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
            "predicted_ph": p.predicted_ph,
            "predicted_temperature_c": p.predicted_temperature_c,
            "predicted_salinity_ppt": p.predicted_salinity_ppt,
            "model_version": p.model_version,
        }
        for p in predictions
        if p.device_code in device_map
    ]

    inserted = 0
    skipped_duplicates: list[SkippedDuplicateOut] = []

    if rows:
        # Satu run forecast menghasilkan banyak horizon dengan `time` sama, jadi
        # horizon_minutes WAJIB ikut conflict target — kalau tidak, cuma 1 yang masuk.
        inserted, skipped_rows = await insert_skip_duplicates(
            db,
            FuzzyPrediction,
            rows,
            [FuzzyPrediction.device_id, FuzzyPrediction.time, FuzzyPrediction.horizon_minutes],
        )

        skipped_duplicates = [
            SkippedDuplicateOut(
                device_code=device_code_by_id[row["device_id"]],
                time=row["time"],
                horizon_minutes=row["horizon_minutes"],
            )
            for row in skipped_rows
        ]

        await db.commit()

    return inserted, unknown, skipped_duplicates

"""Query hasil klasifikasi (fuzzy logic) & prediksi (fuzzy time series) terbaru per device."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, FuzzyClassification, FuzzyPrediction


async def _latest_per_device(
    db: AsyncSession,
    model,
    device_id: int | None,
    allowed_device_ids: set[int] | None,
):
    # DISTINCT ON (device_id) — spesifik PostgreSQL, mengambil satu baris terbaru per device.
    stmt = select(model)
    if device_id is not None:
        stmt = stmt.where(model.device_id == device_id)
    if allowed_device_ids is not None:
        stmt = stmt.where(model.device_id.in_(allowed_device_ids))
    stmt = stmt.distinct(model.device_id).order_by(model.device_id, model.time.desc())

    result = await db.execute(stmt)
    return result.scalars().all()


async def _device_by_id(
    db: AsyncSession, allowed_device_ids: set[int] | None
) -> dict[int, Device]:
    stmt = select(Device)
    if allowed_device_ids is not None:
        stmt = stmt.where(Device.id.in_(allowed_device_ids))
    result = await db.execute(stmt)
    return {d.id: d for d in result.scalars().all()}


async def get_latest_quality(
    db: AsyncSession,
    device_id: int | None = None,
    allowed_device_ids: set[int] | None = None,
) -> list[dict]:
    """`allowed_device_ids=None` berarti tidak dibatasi (gateway/admin); kalau bukan
    None, hasil dibatasi ke device tsb (bisa kosong)."""
    classifications = await _latest_per_device(
        db, FuzzyClassification, device_id, allowed_device_ids
    )
    predictions = await _latest_per_device(db, FuzzyPrediction, device_id, allowed_device_ids)
    predictions_by_device = {p.device_id: p for p in predictions}
    device_by_id = await _device_by_id(db, allowed_device_ids)

    items: list[dict] = []
    seen_device_ids: set[int] = set()

    for classification in classifications:
        seen_device_ids.add(classification.device_id)
        device = device_by_id.get(classification.device_id)
        items.append(
            {
                "device_id": classification.device_id,
                "device_code": device.device_code if device else None,
                "classification": classification,
                "prediction": predictions_by_device.get(classification.device_id),
            }
        )

    # Device yang sudah punya prediksi tapi belum punya hasil klasifikasi.
    for pred_device_id, prediction in predictions_by_device.items():
        if pred_device_id in seen_device_ids:
            continue
        device = device_by_id.get(pred_device_id)
        items.append(
            {
                "device_id": pred_device_id,
                "device_code": device.device_code if device else None,
                "classification": None,
                "prediction": prediction,
            }
        )

    return items


async def get_latest_predictions_full(
    db: AsyncSession,
    device_id: int | None = None,
    allowed_device_ids: set[int] | None = None,
) -> list[dict]:
    """Semua baris fuzzy_predictions dari run TERAKHIR (time terbaru) per device,
    urut horizon_minutes ASC — beda dari get_latest_quality() yang cuma ambil satu
    baris (dipakai buat "status sekarang", bukan grafik multi-jam). Perlu endpoint
    terpisah karena satu siklus scheduler insert banyak baris (satu per horizon)
    dengan `time` yang SAMA — DISTINCT ON (device_id) di get_latest_quality()
    cuma mengembalikan satu baris ambigu dari semuanya, bukan horizon tertentu.
    """
    latest_time_subq = (
        select(FuzzyPrediction.device_id, func.max(FuzzyPrediction.time).label("max_time"))
        .group_by(FuzzyPrediction.device_id)
    )
    if device_id is not None:
        latest_time_subq = latest_time_subq.where(FuzzyPrediction.device_id == device_id)
    if allowed_device_ids is not None:
        latest_time_subq = latest_time_subq.where(
            FuzzyPrediction.device_id.in_(allowed_device_ids)
        )
    latest_time_subq = latest_time_subq.subquery()

    stmt = (
        select(FuzzyPrediction)
        .join(
            latest_time_subq,
            (FuzzyPrediction.device_id == latest_time_subq.c.device_id)
            & (FuzzyPrediction.time == latest_time_subq.c.max_time),
        )
        .order_by(FuzzyPrediction.device_id, FuzzyPrediction.horizon_minutes.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    device_by_id = await _device_by_id(db, allowed_device_ids)

    grouped: dict[int, list[FuzzyPrediction]] = {}
    for row in rows:
        grouped.setdefault(row.device_id, []).append(row)

    return [
        {
            "device_id": did,
            "device_code": device_by_id[did].device_code if did in device_by_id else None,
            "predictions": preds,
        }
        for did, preds in grouped.items()
    ]

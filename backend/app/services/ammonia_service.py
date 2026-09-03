"""Tulis & baca indeks risiko toksisitas amonia (tabel ammonia_risks).

Perhitungannya sendiri ada di ammonia_speciation.py — di sini cuma perakitan
baris, penyimpanan, dan query. Dipanggil dari DUA siklus yang sudah jalan:
ingest_service (kondisi terukur, horizon 0) dan ml_pipeline_service (ramalan,
horizon >0). Sengaja TIDAK punya scheduler sendiri.
"""

from datetime import datetime

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AmmoniaRisk, Device
from app.services.ammonia_speciation import MODEL_VERSION, assess_ammonia_risk
from app.services.ingest_base import insert_skip_duplicates

#: horizon_minutes untuk baris "kondisi terukur" (bukan ramalan).
HORIZON_TERUKUR = 0


def build_row(
    *,
    device_id: int,
    time: datetime,
    target_time: datetime,
    horizon_minutes: int,
    ph: float | None,
    temperature_c: float | None,
    salinity_ppt: float | None,
) -> dict | None:
    """Satu baris ammonia_risks, atau None kalau inputnya tidak lengkap.

    None (bukan nilai default palsu, bukan exception) supaya pemanggil tinggal
    melewatkan reading yang salah satu sensornya mati — amonia.md:220.
    """
    if ph is None or temperature_c is None or salinity_ppt is None:
        return None

    hasil = assess_ammonia_risk(
        ph=float(ph), temperature_c=float(temperature_c), salinity_ppt=float(salinity_ppt)
    )
    return {
        "device_id": device_id,
        "time": time,
        "horizon_minutes": horizon_minutes,
        "target_time": target_time,
        "input_ph": hasil.input_ph,
        "input_temperature_c": hasil.input_temperature_c,
        "input_salinity_ppt": hasil.input_salinity_ppt,
        "fraction_nh3_pct": round(hasil.fraction_nh3_pct, 3),
        "pka": round(hasil.pka, 4),
        "risk_level": hasil.risk_level.value,
        "in_valid_range": hasil.in_valid_range,
        "model_version": MODEL_VERSION,
    }


async def save_ammonia_risks(db: AsyncSession, rows: list[dict]) -> int:
    """Simpan idempoten pada (device_id, time, horizon_minutes).

    TIDAK commit sendiri — pemanggilnya (ingest_service / ml_pipeline_service)
    sudah punya commit-nya masing-masing, dan menumpang di situ yang membuat
    baris risiko tidak bisa tersimpan tanpa data sumbernya.
    """
    if not rows:
        return 0
    inserted, _ = await insert_skip_duplicates(
        db,
        AmmoniaRisk,
        rows,
        [AmmoniaRisk.device_id, AmmoniaRisk.time, AmmoniaRisk.horizon_minutes],
    )
    return inserted


async def _device_by_id(
    db: AsyncSession, allowed_device_ids: set[int] | None
) -> dict[int, Device]:
    stmt = select(Device)
    if allowed_device_ids is not None:
        stmt = stmt.where(Device.id.in_(allowed_device_ids))
    result = await db.execute(stmt)
    return {d.id: d for d in result.scalars().all()}


async def get_latest_and_forecast(
    db: AsyncSession,
    device_id: int | None = None,
    allowed_device_ids: set[int] | None = None,
) -> list[dict]:
    """Per device: satu baris terukur TERBARU + seluruh horizon run ramalan TERAKHIR.

    `allowed_device_ids=None` = tidak dibatasi (gateway/admin).
    """
    # Terukur: DISTINCT ON per device, pola yang sama dengan
    # quality_service._latest_per_device.
    terukur_stmt = select(AmmoniaRisk).where(
        AmmoniaRisk.horizon_minutes == HORIZON_TERUKUR
    )
    ramalan_time_subq = (
        select(AmmoniaRisk.device_id, func.max(AmmoniaRisk.time).label("max_time"))
        .where(AmmoniaRisk.horizon_minutes > HORIZON_TERUKUR)
        .group_by(AmmoniaRisk.device_id)
    )

    if device_id is not None:
        terukur_stmt = terukur_stmt.where(AmmoniaRisk.device_id == device_id)
        ramalan_time_subq = ramalan_time_subq.where(AmmoniaRisk.device_id == device_id)
    if allowed_device_ids is not None:
        terukur_stmt = terukur_stmt.where(AmmoniaRisk.device_id.in_(allowed_device_ids))
        ramalan_time_subq = ramalan_time_subq.where(
            AmmoniaRisk.device_id.in_(allowed_device_ids)
        )

    terukur_stmt = terukur_stmt.distinct(AmmoniaRisk.device_id).order_by(
        AmmoniaRisk.device_id, AmmoniaRisk.time.desc()
    )
    terukur_rows = (await db.execute(terukur_stmt)).scalars().all()

    ramalan_sub = ramalan_time_subq.subquery()
    ramalan_stmt = (
        select(AmmoniaRisk)
        .join(
            ramalan_sub,
            (AmmoniaRisk.device_id == ramalan_sub.c.device_id)
            & (AmmoniaRisk.time == ramalan_sub.c.max_time),
        )
        .where(AmmoniaRisk.horizon_minutes > HORIZON_TERUKUR)
        .order_by(AmmoniaRisk.device_id, AmmoniaRisk.horizon_minutes.asc())
    )
    ramalan_rows = (await db.execute(ramalan_stmt)).scalars().all()

    ramalan_per_device: dict[int, list[AmmoniaRisk]] = {}
    for row in ramalan_rows:
        ramalan_per_device.setdefault(row.device_id, []).append(row)

    terukur_per_device = {row.device_id: row for row in terukur_rows}
    device_by_id = await _device_by_id(db, allowed_device_ids)

    return [
        {
            "device_id": did,
            "device_code": device_by_id[did].device_code if did in device_by_id else None,
            "current": terukur_per_device.get(did),
            "forecast": ramalan_per_device.get(did, []),
        }
        for did in sorted(set(terukur_per_device) | set(ramalan_per_device))
    ]


async def get_history(
    db: AsyncSession,
    device_id: int | None,
    start_time: datetime | None,
    end_time: datetime | None,
    risk_level: str | None,
    only_measured: bool,
    limit: int,
    offset: int,
    allowed_device_ids: set[int] | None = None,
) -> list[Row]:
    """Log historis risiko amonia + device_code, terbaru dulu.

    ponytail: paginasi OFFSET, sama seperti reading_service.get_readings — baris
    baru yang masuk di antara dua halaman bisa membuat satu baris terlihat dua
    kali. Bisa diterima untuk log kronologis.
    """
    stmt = select(AmmoniaRisk, Device.device_code).join(
        Device, AmmoniaRisk.device_id == Device.id
    )

    if device_id is not None:
        stmt = stmt.where(AmmoniaRisk.device_id == device_id)
    if start_time is not None:
        stmt = stmt.where(AmmoniaRisk.target_time >= start_time)
    if end_time is not None:
        stmt = stmt.where(AmmoniaRisk.target_time <= end_time)
    if risk_level is not None:
        stmt = stmt.where(AmmoniaRisk.risk_level == risk_level)
    if only_measured:
        stmt = stmt.where(AmmoniaRisk.horizon_minutes == HORIZON_TERUKUR)
    if allowed_device_ids is not None:
        stmt = stmt.where(AmmoniaRisk.device_id.in_(allowed_device_ids))

    # Urut pakai target_time (waktu yang DINILAI), bukan `time` (kapan dihitung):
    # baris ramalan lahir di masa kini untuk waktu di masa depan, dan log yang
    # diurutkan pakai `time` akan menaruhnya berdampingan dengan baris terukur
    # yang sama sekali beda maknanya. device_id + horizon sebagai tiebreaker.
    stmt = (
        stmt.order_by(
            AmmoniaRisk.target_time.desc(),
            AmmoniaRisk.device_id.desc(),
            AmmoniaRisk.horizon_minutes.asc(),
        )
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    return result.all()

"""Logika penyimpanan data sensor yang masuk dari gateway."""

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models import Device, SensorReading
from app.schemas.sensor_reading import SensorReadingIn, SkippedDuplicateOut


async def _get_device_map(db: AsyncSession, device_codes: list[str]) -> dict[str, Device]:
    result = await db.execute(select(Device).where(Device.device_code.in_(device_codes)))
    return {d.device_code: d for d in result.scalars().all()}


async def ingest_readings(
    db: AsyncSession, readings: list[SensorReadingIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    """Simpan batch pembacaan sensor.

    Device yang belum terdaftar dilewati (bukan auto-registrasi), dilaporkan di
    `unknown_device_codes`. Insert idempoten (ON CONFLICT DO NOTHING pada PK
    device_id+time) buat aman kalau gateway retry — baris yang sudah ada di-skip
    dan dilaporkan lewat `skipped_duplicates`, bukan ditimpa diam-diam.
    """
    device_map = await _get_device_map(db, [r.device_code for r in readings])
    unknown = sorted({r.device_code for r in readings if r.device_code not in device_map})
    device_code_by_id = {d.id: code for code, d in device_map.items()}

    rows = [
        {
            "device_id": device_map[r.device_code].id,
            "time": r.time,
            "ph": r.ph,
            "temperature_c": r.temperature_c,
            "salinity_ppt": r.salinity_ppt,
        }
        for r in readings
        if r.device_code in device_map
    ]

    inserted = 0
    skipped_duplicates: list[SkippedDuplicateOut] = []

    if rows:
        stmt = (
            pg_insert(SensorReading)
            .values(rows)
            .on_conflict_do_nothing(index_elements=[SensorReading.device_id, SensorReading.time])
            .returning(SensorReading.device_id, SensorReading.time)
        )
        result = await db.execute(stmt)
        inserted_keys: set[tuple[int, datetime]] = {(r.device_id, r.time) for r in result.all()}
        inserted = len(inserted_keys)

        skipped_duplicates = [
            SkippedDuplicateOut(
                device_code=device_code_by_id[row["device_id"]],
                time=row["time"],
            )
            for row in rows
            if (row["device_id"], row["time"]) not in inserted_keys
        ]

        device_ids = list({row["device_id"] for row in rows})
        await db.execute(
            update(Device).where(Device.id.in_(device_ids)).values(last_seen_at=func.now())
        )
        await db.commit()

    return inserted, unknown, skipped_duplicates

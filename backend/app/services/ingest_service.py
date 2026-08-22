"""Logika penyimpanan data sensor yang masuk dari gateway."""

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models import Device, SensorReading
from app.schemas.sensor_reading import SensorReadingIn, SkippedDuplicateOut
from app.services._ingest_common import get_device_map, idempotent_bulk_insert


async def ingest_readings(
    db: AsyncSession, readings: list[SensorReadingIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    """Simpan batch pembacaan sensor.

    Device yang belum terdaftar dilewati (bukan auto-registrasi), dilaporkan di
    `unknown_device_codes`. Insert idempoten (ON CONFLICT DO NOTHING pada PK
    device_id+time) buat aman kalau gateway retry — baris yang sudah ada di-skip
    dan dilaporkan lewat `skipped_duplicates`, bukan ditimpa diam-diam.
    """
    device_map = await get_device_map(db, [r.device_code for r in readings])
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
        inserted, inserted_keys = await idempotent_bulk_insert(
            db, SensorReading, rows, [SensorReading.device_id, SensorReading.time]
        )

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

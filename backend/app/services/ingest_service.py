"""Simpan data sensor mentah yang dikirim gateway."""

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.models import Device, SensorReading
from app.schemas.sensor_reading import SensorReadingIn, SkippedDuplicateOut
from app.services.ingest_base import find_devices_by_code, insert_skip_duplicates


async def ingest_readings(
    db: AsyncSession, readings: list[SensorReadingIn]
) -> tuple[int, list[str], list[SkippedDuplicateOut]]:
    """Simpan satu batch reading, lalu perbarui last_seen_at device terkait.

    Device yang belum terdaftar dilewati (tidak auto-registrasi) dan dilaporkan.
    Insert idempoten pada PK device_id+time supaya retry gateway tidak menimpa
    data lama — yang duplikat dilaporkan, bukan ditulis ulang diam-diam.
    """
    device_map = await find_devices_by_code(db, [r.device_code for r in readings])
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
        inserted, skipped_rows = await insert_skip_duplicates(
            db, SensorReading, rows, [SensorReading.device_id, SensorReading.time]
        )

        skipped_duplicates = [
            SkippedDuplicateOut(
                device_code=device_code_by_id[row["device_id"]],
                time=row["time"],
            )
            for row in skipped_rows
        ]

        # Bukti device masih hidup — dipakai dashboard untuk status online/offline.
        device_ids = list({row["device_id"] for row in rows})
        await db.execute(
            update(Device).where(Device.id.in_(device_ids)).values(last_seen_at=func.now())
        )
        await db.commit()

    return inserted, unknown, skipped_duplicates

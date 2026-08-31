"""Query histori sensor_readings."""

from datetime import datetime

from sqlalchemy import Row, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, SensorReading


async def get_readings(
    db: AsyncSession,
    device_id: int | None,
    device_code: str | None,
    start_time: datetime | None,
    end_time: datetime | None,
    limit: int,
    allowed_device_ids: set[int] | None = None,
) -> list[Row]:
    """Histori reading + device_code, terbaru dulu.

    `allowed_device_ids=None` = tidak dibatasi (gateway/admin). Kalau diisi, device
    di luar himpunan itu menghasilkan list kosong — bukan 404, ini endpoint list.
    """
    stmt = select(SensorReading, Device.device_code).join(
        Device, SensorReading.device_id == Device.id
    )

    if device_id is not None:
        stmt = stmt.where(SensorReading.device_id == device_id)
    if device_code is not None:
        stmt = stmt.where(Device.device_code == device_code)
    if start_time is not None:
        stmt = stmt.where(SensorReading.time >= start_time)
    if end_time is not None:
        stmt = stmt.where(SensorReading.time <= end_time)
    if allowed_device_ids is not None:
        stmt = stmt.where(SensorReading.device_id.in_(allowed_device_ids))

    stmt = stmt.order_by(SensorReading.time.desc()).limit(limit)

    result = await db.execute(stmt)
    return result.all()

"""Query histori sensor_readings."""

from datetime import datetime

from sqlalchemy import Row, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.water_thresholds import ParamKey, StatusFilter, kolom, predikat_status
from app.models import Device, SensorReading


async def get_readings(
    db: AsyncSession,
    device_id: int | None,
    device_code: str | None,
    start_time: datetime | None,
    end_time: datetime | None,
    limit: int,
    allowed_device_ids: set[int] | None = None,
    param: ParamKey | None = None,
    status: StatusFilter | None = None,
    offset: int = 0,
) -> list[Row]:
    """Histori reading + device_code, terbaru dulu.

    `allowed_device_ids=None` = tidak dibatasi (gateway/admin). Kalau diisi, device
    di luar himpunan itu menghasilkan list kosong, bukan 404, ini endpoint list.

    `param` membuang baris yang parameternya NULL supaya tidak menghabiskan jatah
    halaman, `status` menyaring pakai ambang Tabel 2.1, keduanya WAJIB di SQL,
    bukan di klien: filter yang jalan setelah LIMIT membuat halaman 25 baris bisa
    menyisakan 2 baris.

    ponytail: paginasi OFFSET. Kalau ada reading baru masuk di antara dua halaman,
    satu baris bisa terlihat dua kali atau terlewat, bisa diterima untuk log
    kronologis. Kalau kelak butuh ketepatan penuh, pola keyset cursor-nya sudah
    ada di web/src/lib/export.ts (fetchAllReadings).
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
    if param is not None:
        stmt = stmt.where(kolom(param).is_not(None))
        if status is not None:
            stmt = stmt.where(predikat_status(param, status))

    # device_id sebagai tiebreaker: `time` cuma unik DI DALAM satu device, jadi
    # tanpa ini dua baris berwaktu sama bisa bertukar posisi antar permintaan dan
    # OFFSET melewatkan atau menggandakannya.
    stmt = (
        stmt.order_by(SensorReading.time.desc(), SensorReading.device_id.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    return result.all()

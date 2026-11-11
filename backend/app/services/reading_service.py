"""Query histori sensor_readings."""

from datetime import datetime

from sqlalchemy import Row, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.water_thresholds import ParamKey, StatusFilter, kolom, predikat_status
from app.models import Device, SensorReading


def ember_waktu(kolom, menit: int):
    """Nomor ember `menit`-an sejak epoch, untuk DISTINCT ON per interval.

    Ember 15/30/60 menit di UTC sejajar dengan jam WIB karena selisihnya 7 jam
    bulat. literal_column, bukan bind param: ekspresi ini muncul di DISTINCT ON
    dan ORDER BY, dan Postgres menolak kalau keduanya beda nomor parameter.
    """
    return func.floor(func.extract("epoch", kolom) / literal_column(str(int(menit) * 60)))


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
    interval_minutes: int | None = None,
) -> list[Row]:
    """Histori reading + device_code, terbaru dulu.

    `allowed_device_ids=None` = tidak dibatasi (gateway/admin). Kalau diisi,
    device di luar himpunan itu menghasilkan list kosong, bukan 404.

    `param` membuang baris yang parameternya NULL supaya tidak menghabiskan
    jatah halaman, `status` menyaring pakai ambang Tabel 2.1. Keduanya di SQL,
    bukan di klien: filter setelah LIMIT bisa menyisakan 2 baris dari 25.

    ponytail: paginasi OFFSET, jadi reading yang masuk di antara dua halaman
    bisa membuat satu baris terlihat dua kali atau terlewat. Bisa diterima untuk
    log kronologis; pola keyset cursor-nya ada di web/src/lib/export.ts
    (fetchAllReadings) kalau kelak butuh ketepatan penuh.

    `interval_minutes` menyisakan satu reading per device per ember waktu,
    yaitu yang paling awal di ember itu (nilai asli, bukan rata-rata, supaya
    received_at dan latensinya tetap bermakna). Karena yang dipilih selalu
    yang paling awal, memotong end_time di tengah ember tidak mengubah
    pilihannya, jadi paging mundur di fetchAllReadings tetap aman.

    ponytail: DISTINCT ON dihitung atas seluruh rentang sebelum LIMIT. Cukup
    untuk data satu tambak; pakai continuous aggregate Timescale kalau lambat.
    """
    kondisi = []
    if device_id is not None:
        kondisi.append(SensorReading.device_id == device_id)
    if device_code is not None:
        kondisi.append(Device.device_code == device_code)
    if start_time is not None:
        kondisi.append(SensorReading.time >= start_time)
    if end_time is not None:
        kondisi.append(SensorReading.time <= end_time)
    if allowed_device_ids is not None:
        kondisi.append(SensorReading.device_id.in_(allowed_device_ids))
    if param is not None:
        kondisi.append(kolom(param).is_not(None))
        if status is not None:
            kondisi.append(predikat_status(param, status))

    stmt = select(SensorReading, Device.device_code).join(
        Device, SensorReading.device_id == Device.id
    )
    if interval_minutes:
        ember = ember_waktu(SensorReading.time, interval_minutes)
        terpilih = (
            select(SensorReading.device_id, SensorReading.time)
            .join(Device, SensorReading.device_id == Device.id)
            .where(*kondisi)
            .distinct(SensorReading.device_id, ember)
            .order_by(SensorReading.device_id, ember, SensorReading.time)
            .subquery()
        )
        stmt = stmt.join(
            terpilih,
            (SensorReading.device_id == terpilih.c.device_id)
            & (SensorReading.time == terpilih.c.time),
        )
    else:
        stmt = stmt.where(*kondisi)

    # device_id sebagai tiebreaker: `time` cuma unik di dalam satu device, jadi
    # tanpa ini dua baris berwaktu sama bisa bertukar posisi antar permintaan dan
    # OFFSET melewatkan atau menggandakannya.
    stmt = (
        stmt.order_by(SensorReading.time.desc(), SensorReading.device_id.desc())
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(stmt)
    return result.all()

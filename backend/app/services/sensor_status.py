"""Status sensor dari pembacaan terbaru.

Keputusan sensor valid atau tidak ada di edge: ESP membuang field yang
probenya gagal membaca, dan Raspi meneruskannya sebagai null. Backend tidak
menilai ulang besar nilainya (dulu ada deteksi "lonjakan"; dihapus supaya
satu aturan saja yang berlaku, yaitu di edge). Yang dicari di sini cuma:

- "kosong": parameter tidak terisi di pembacaan terbaru (probe tidak terbaca).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SensorReading

PARAMS = ("ph", "temperature_c", "salinity_ppt")


def deteksi_sensor_error(rows) -> dict[str, str]:
    """Parameter yang sensornya error -> "kosong".

    `rows` terurut terbaru dulu; cuma baris pertama yang dilihat. Parameter
    yang sehat tidak masuk hasil.
    """
    if not rows:
        return {}
    return {p: "kosong" for p in PARAMS if getattr(rows[0], p) is None}


async def pembacaan_terakhir(db: AsyncSession, device_id: int) -> list[SensorReading]:
    """Pembacaan terbaru device (list berisi 0 atau 1 baris)."""
    result = await db.execute(
        select(SensorReading)
        .where(SensorReading.device_id == device_id)
        .order_by(SensorReading.time.desc())
        .limit(1)
    )
    return list(result.scalars().all())

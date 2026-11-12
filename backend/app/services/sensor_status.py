"""Deteksi sensor error dari pola pembacaan, bukan dari rentang nilai.

Sengaja tidak memakai batas semesta fuzzy maupun ambang toleransi: ada alat
yang memang selalu membaca di luar rentang itu (mis. salinitas 0,2 ppt di air
tawar) dan itu bukan sensor rusak. Yang dicari di sini dua tanda yang tidak
bergantung pada besar nilainya:

- "kosong":   parameter tidak terisi di pembacaan terbaru (probe tidak terbaca).
- "lonjakan": nilai berubah terlalu jauh antara dua pembacaan berurutan. Air
  kolam tidak bisa berubah secepat itu dalam semenit.
"""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SensorReading

PARAMS = ("ph", "temperature_c", "salinity_ppt")

# Kenop kalibrasi: selisih maksimal yang masih wajar antara dua pembacaan
# berurutan (sensor kirim tiap ~1 menit). Angka awal dari data lapangan di
# raspi-data: riak normal jauh di bawah ini, sedangkan gangguan probe melonjak
# sampai pH 5,9 dan suhu 40 °C sekali kirim. Naikkan kalau sensor asli terlalu
# sering ditandai, turunkan kalau gangguan kecil lolos.
LONJAKAN_MAKS = {"ph": 1.0, "temperature_c": 5.0, "salinity_ppt": 5.0}

# Lonjakan dicari di sekian pasang pembacaan terakhir, bukan cuma pasangan
# terbaru. Tanpa jendela ini statusnya berkedip: error saat melonjak, lalu
# "pulih" di pembacaan berikutnya walau probenya masih bermasalah.
JENDELA = 10

# Dua pembacaan yang terpaut lebih dari ini tidak dibandingkan: setelah device
# mati lama, nilainya wajar saja sudah jauh berbeda.
JEDA_MAKS = timedelta(minutes=5)


def deteksi_sensor_error(rows) -> dict[str, str]:
    """Parameter yang sensornya terindikasi error -> "kosong" | "lonjakan".

    `rows` terurut terbaru dulu; tiap baris punya `.time` dan ketiga parameter.
    Parameter yang sehat tidak masuk hasil.
    """
    hasil: dict[str, str] = {}
    if not rows:
        return hasil
    for p in PARAMS:
        if getattr(rows[0], p) is None:
            hasil[p] = "kosong"
            continue
        for baru, lama in zip(rows, rows[1:]):
            a, b = getattr(baru, p), getattr(lama, p)
            if a is None or b is None or baru.time - lama.time > JEDA_MAKS:
                continue
            if abs(float(a) - float(b)) > LONJAKAN_MAKS[p]:
                hasil[p] = "lonjakan"
                break
    return hasil


async def pembacaan_terakhir(db: AsyncSession, device_id: int) -> list[SensorReading]:
    """JENDELA + 1 pembacaan terbaru (= JENDELA pasang berurutan), terbaru dulu."""
    result = await db.execute(
        select(SensorReading)
        .where(SensorReading.device_id == device_id)
        .order_by(SensorReading.time.desc())
        .limit(JENDELA + 1)
    )
    return list(result.scalars().all())

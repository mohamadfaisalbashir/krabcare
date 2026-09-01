"""Ambang Tabel 2.1 (Bab 2.2.1) untuk menyaring log historis di SQL.

SALINAN KETIGA dari angka yang sama — dua lainnya di web/src/lib/parameter.ts
(RANGE + statusOf) dan mobile/lib/core/api/water_thresholds.dart (kParamRanges +
statusOf). Tidak bisa dibagi lintas bahasa, jadi yang menjaganya adalah
scripts/check_param_sync.py: ubah salah satu tanpa yang lain -> skrip itu merah.

Ada di backend supaya halaman log bisa dipaginasi: filter status HARUS jalan di
query yang sama dengan LIMIT/OFFSET, kalau tidak satu halaman 25 baris bisa
menyisakan 2 baris setelah disaring di klien.
"""

import enum

from sqlalchemy import ColumnElement, or_
from sqlalchemy.orm import InstrumentedAttribute

from app.models import SensorReading


class ParamKey(str, enum.Enum):
    """Kolom parameter yang bisa jadi fokus satu halaman log."""

    PH = "ph"
    TEMPERATURE_C = "temperature_c"
    SALINITY_PPT = "salinity_ppt"


class StatusFilter(str, enum.Enum):
    """Status ambang per pembacaan — BUKAN kategori Mamdani (lihat WaterQualityCategory)."""

    AMAN = "aman"
    WASPADA = "waspada"
    BAHAYA = "bahaya"


# min, max (batas toleransi) lalu optimal_low, optimal_high.
RANGE: dict[ParamKey, tuple[float, float, float, float]] = {
    ParamKey.PH: (6.5, 9.0, 7.5, 8.5),
    ParamKey.TEMPERATURE_C: (20, 35, 28, 30),
    ParamKey.SALINITY_PPT: (5, 40, 10, 30),
}


def kolom(param: ParamKey) -> InstrumentedAttribute:
    return getattr(SensorReading, param.value)


def predikat_status(param: ParamKey, status: StatusFilter) -> ColumnElement[bool]:
    """Cermin persis statusOf() di web & mobile: batas inklusif di kedua sisi.

    pH 6.5 -> waspada, 7.5 -> aman, 8.5 -> aman, 9.0 -> waspada, 9.1 -> bahaya.
    """
    nilai = kolom(param)
    minimum, maksimum, optimal_low, optimal_high = RANGE[param]

    if status is StatusFilter.BAHAYA:
        return or_(nilai < minimum, nilai > maksimum)
    if status is StatusFilter.WASPADA:
        return or_(
            (nilai >= minimum) & (nilai < optimal_low),
            (nilai > optimal_high) & (nilai <= maksimum),
        )
    return (nilai >= optimal_low) & (nilai <= optimal_high)

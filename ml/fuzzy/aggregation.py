"""Agregasi data time-series mentah ke bucket waktu N-menit (rata-rata per bucket).

Dipakai untuk meratakan reading sensor mentah (interval sampling bisa tidak
teratur) jadi deret waktu per-jam yang siap dipakai fuzzy time series
(ml/fuzzy/fts.py) — forecast_next()/forecast_multi_step() butuh histori dengan
spasi waktu yang konsisten.

Murni Python stdlib, konsisten dengan modul ml/fuzzy/ lainnya.
"""

from datetime import datetime, timedelta, timezone

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _parse_iso(time_str: str) -> datetime:
    """Parse string ISO 8601 (termasuk suffix 'Z') jadi datetime timezone-aware."""
    return datetime.fromisoformat(time_str.replace("Z", "+00:00"))


def _bucket_start(dt: datetime, bucket_minutes: int) -> datetime:
    """Bulatkan `dt` ke awal bucket `bucket_minutes` sejak epoch (floor per-bucket).

    Untuk bucket_minutes=60, ini otomatis jatuh ke batas jam bulat UTC (00:00,
    01:00, dst) — konsisten dengan istilah "per-jam" di seluruh modul ini.
    """
    minutes_since_epoch = (dt - _EPOCH).total_seconds() / 60
    bucket_index = int(minutes_since_epoch // bucket_minutes)
    return _EPOCH + timedelta(minutes=bucket_index * bucket_minutes)


def aggregate_by_time_bucket(
    readings: list[dict], value_key: str, bucket_minutes: int = 60
) -> list[tuple[datetime, float]]:
    """Kelompokkan `readings` ke bucket waktu `bucket_minutes`, rata-ratakan `value_key`.

    - `readings`: list of dict, tiap dict minimal punya "time" (str ISO 8601) dan
      field `value_key` (angka atau None).
    - Nilai None di-skip (tidak ikut dihitung rata-rata).
    - Bucket yang sama sekali tidak punya nilai valid ikut di-skip dari hasil
      (bukan diisi None) — supaya deret hasil aggregasi tidak punya "lubang".
    - Return: list (waktu_mulai_bucket, nilai_rata_rata) terurut kronologis.
    """
    sums: dict[datetime, float] = {}
    counts: dict[datetime, int] = {}

    for reading in readings:
        value = reading.get(value_key)
        if value is None:
            continue
        bucket_time = _bucket_start(_parse_iso(reading["time"]), bucket_minutes)
        sums[bucket_time] = sums.get(bucket_time, 0.0) + value
        counts[bucket_time] = counts.get(bucket_time, 0) + 1

    return sorted(
        ((bucket_time, sums[bucket_time] / counts[bucket_time]) for bucket_time in sums),
        key=lambda item: item[0],
    )

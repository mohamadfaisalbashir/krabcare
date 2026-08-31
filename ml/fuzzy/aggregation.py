"""Agregasi reading mentah ke bucket waktu N-menit (rata-rata per bucket).

Interval sampling sensor tidak selalu teratur, sedangkan FTS (ml/fuzzy/fts.py)
butuh deret waktu berspasi konsisten — modul ini yang meratakannya.

Murni stdlib, konsisten dengan modul ml/fuzzy/ lainnya.
"""

from datetime import datetime, timedelta, timezone

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _parse_iso(time_str: str) -> datetime:
    """Parse string ISO 8601 (termasuk suffix 'Z') jadi datetime timezone-aware."""
    return datetime.fromisoformat(time_str.replace("Z", "+00:00"))


def _bucket_start(dt: datetime, bucket_minutes: int) -> datetime:
    """Floor `dt` ke awal bucket, dihitung dari epoch.

    Untuk bucket_minutes=60 hasilnya jatuh tepat di jam bulat UTC.
    """
    minutes_since_epoch = (dt - _EPOCH).total_seconds() / 60
    bucket_index = int(minutes_since_epoch // bucket_minutes)
    return _EPOCH + timedelta(minutes=bucket_index * bucket_minutes)


def aggregate_by_time_bucket(
    readings: list[dict], value_key: str, bucket_minutes: int = 60
) -> list[tuple[datetime, float]]:
    """Kelompokkan `readings` per bucket waktu, rata-ratakan `value_key`.

    Tiap reading minimal punya "time" (ISO 8601) & `value_key`. Nilai None
    dilewati, dan bucket tanpa satu pun nilai valid tidak ikut keluar (bukan
    diisi None) supaya deret hasilnya tidak berlubang.

    Return: list (waktu_mulai_bucket, rata_rata) terurut kronologis.
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

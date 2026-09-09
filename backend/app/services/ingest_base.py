"""Plumbing bersama service ingest: lookup device + insert yang aman di-retry.

Dipakai ingest_service.py (sensor_readings) dan quality_ingest_service.py
(fuzzy_classifications/fuzzy_predictions), polanya sama: cari device by
device_code -> insert ON CONFLICT DO NOTHING -> laporkan baris yang di-skip.
"""

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device


async def find_devices_by_code(db: AsyncSession, device_codes: list[str]) -> dict[str, Device]:
    """Ambil device sekali jalan (satu query untuk seluruh batch), kunci = device_code."""
    result = await db.execute(select(Device).where(Device.device_code.in_(device_codes)))
    return {d.device_code: d for d in result.scalars().all()}


def _comparison_key(values: Iterable) -> tuple:
    """Key perbandingan yang tahan beda representasi timezone.

    Kolom waktu bertipe TIMESTAMPTZ, jadi RETURNING selalu balik timezone-aware
    (UTC), sedangkan payload ingest boleh saja mengirim datetime naive, Postgres
    memperlakukannya sebagai UTC saat menyimpan, jadi di sini dipakai asumsi yang
    sama. Tanpa normalisasi ini, baris ber-timestamp naive SELALU dianggap
    duplikat padahal barusan berhasil masuk (ketahuan saat impor dataset NERR:
    satu batch balas inserted=1000 sekaligus skipped_duplicates=1000).
    """
    return tuple(
        (v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc))
        if isinstance(v, datetime)
        else v
        for v in values
    )


async def insert_skip_duplicates(
    db: AsyncSession, model, rows: list[dict], conflict_columns: list
) -> tuple[int, list[dict]]:
    """Insert `rows` dengan ON CONFLICT DO NOTHING pada `conflict_columns`.

    Return (jumlah baris masuk, baris `rows` yang di-skip karena duplikat).
    Perbandingannya dikerjakan di sini, bukan di pemanggil, supaya kedua sisi
    key dinormalkan dengan aturan yang sama (lihat _comparison_key).
    """
    key_fields = [col.key for col in conflict_columns]
    stmt = (
        pg_insert(model)
        .values(rows)
        .on_conflict_do_nothing(index_elements=conflict_columns)
        .returning(*conflict_columns)
    )
    result = await db.execute(stmt)
    inserted_keys = {_comparison_key(getattr(r, f) for f in key_fields) for r in result.all()}
    skipped = [
        row for row in rows if _comparison_key(row[f] for f in key_fields) not in inserted_keys
    ]
    return len(inserted_keys), skipped

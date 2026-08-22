"""Helper bersama untuk service ingest: lookup device by device_code & insert idempoten.

Dipakai oleh ingest_service.py (sensor_readings) dan quality_ingest_service.py
(fuzzy_classifications/fuzzy_predictions) — ketiganya mengikuti pola yang sama:
device lookup -> insert dengan ON CONFLICT DO NOTHING -> baris yang di-skip
dilaporkan lewat SkippedDuplicateOut.
"""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device


async def get_device_map(db: AsyncSession, device_codes: list[str]) -> dict[str, Device]:
    result = await db.execute(select(Device).where(Device.device_code.in_(device_codes)))
    return {d.device_code: d for d in result.scalars().all()}


async def idempotent_bulk_insert(
    db: AsyncSession, model, rows: list[dict], conflict_columns: list
) -> tuple[int, set[tuple]]:
    """Insert `rows` ke `model` dengan ON CONFLICT DO NOTHING pada `conflict_columns`.

    Return (jumlah baris ter-insert, set tuple key kolom-konflik dari baris yang
    BERHASIL masuk) — baris di `rows` yang key-nya tidak ada di set ini berarti
    di-skip karena sudah ada sebelumnya (duplikat).
    """
    key_fields = [col.key for col in conflict_columns]
    stmt = (
        pg_insert(model)
        .values(rows)
        .on_conflict_do_nothing(index_elements=conflict_columns)
        .returning(*conflict_columns)
    )
    result = await db.execute(stmt)
    inserted_keys = {tuple(getattr(r, f) for f in key_fields) for r in result.all()}
    return len(inserted_keys), inserted_keys

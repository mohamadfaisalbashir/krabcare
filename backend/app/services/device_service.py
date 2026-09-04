"""Kelola device sisi admin: lihat yang belum diklaim & tambah device baru.

Sebelum ini device_code cuma bisa masuk lewat INSERT manual ke DB (lihat
README) — endpoint admin di sini gantiin itu lewat form web.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device
from app.schemas.device import DeviceCreateIn


class DeviceError(Exception):
    """Base error domain device."""


class DeviceCodeConflictError(DeviceError):
    """device_code sudah dipakai device lain — UNIQUE constraint devices.device_code."""


async def list_unclaimed_devices(db: AsyncSession) -> list[Device]:
    """Device yang belum terhubung ke kolam mana pun (kolam_id IS NULL).

    Ini daftar yang admin perlu buat nunjuk device_code mana yang siap diklaim
    user lewat POST /kolam/:id/devices/:code — device_code manapun di luar
    daftar ini berarti sudah ada pemiliknya.
    """
    result = await db.execute(
        select(Device)
        .where(Device.kolam_id.is_(None))
        .order_by(Device.created_at.desc())
    )
    return list(result.scalars().all())


async def create_device(db: AsyncSession, payload: DeviceCreateIn) -> Device:
    """Daftarkan device baru, belum terklaim kolam mana pun."""
    device = Device(
        device_code=payload.device_code,
        device_type=payload.device_type,
        level_number=payload.level_number,
        rack_label=payload.rack_label,
        parent_device_id=payload.parent_device_id,
    )
    db.add(device)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise DeviceCodeConflictError(
            f"device_code '{payload.device_code}' sudah dipakai device lain"
        ) from exc
    await db.refresh(device)
    return device

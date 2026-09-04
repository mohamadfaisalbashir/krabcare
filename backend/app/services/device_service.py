"""Kelola device sisi admin: lihat semua device (klaim/belum) & tambah device baru.

Sebelum ini device_code cuma bisa masuk lewat INSERT manual ke DB (lihat
README) — endpoint admin di sini gantiin itu lewat form web.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Kolam
from app.schemas.device import DeviceAdminOut, DeviceCreateIn


class DeviceError(Exception):
    """Base error domain device."""


class DeviceCodeConflictError(DeviceError):
    """device_code sudah dipakai device lain — UNIQUE constraint devices.device_code."""


async def list_all_devices(db: AsyncSession) -> list[DeviceAdminOut]:
    """Semua device terdaftar, sudah diklaim maupun belum (kolam_id NULL).

    Panel admin butuh dua-duanya sekaligus (bukan cuma yang belum diklaim) —
    outer join ke Kolam supaya device yang sudah diklaim ikut bawa nama
    kolamnya, dan device yang belum diklaim tetap muncul dengan kolam_id/
    kolam_nama None.
    """
    result = await db.execute(
        select(Device, Kolam)
        .outerjoin(Kolam, Device.kolam_id == Kolam.id)
        .order_by(Device.device_code.asc())
    )
    return [
        DeviceAdminOut(
            id=device.id,
            device_code=device.device_code,
            device_type=device.device_type,
            rack_label=device.rack_label,
            parent_device_id=device.parent_device_id,
            is_active=device.is_active,
            last_seen_at=device.last_seen_at,
            kolam_id=kolam.id if kolam else None,
            kolam_nama=kolam.nama if kolam else None,
        )
        for device, kolam in result.all()
    ]


async def create_device(db: AsyncSession, payload: DeviceCreateIn) -> Device:
    """Daftarkan device baru, belum terklaim kolam mana pun."""
    device = Device(
        device_code=payload.device_code,
        device_type=payload.device_type,
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

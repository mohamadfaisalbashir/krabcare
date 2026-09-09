"""Kelola device sisi admin: lihat semua device (klaim/belum) & tambah device baru.

Sebelum ini device_code cuma bisa masuk lewat INSERT manual ke DB (lihat
README), endpoint admin di sini gantiin itu lewat form web.
"""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Kolam, User
from app.schemas.device import DeviceAdminOut, DeviceCreateIn, TargetKolamOut


class DeviceError(Exception):
    """Base error domain device."""


class DeviceNotFoundError(DeviceError):
    """Device tidak ditemukan."""


class DeviceCodeConflictError(DeviceError):
    """device_code sudah dipakai device lain, UNIQUE constraint devices.device_code."""


class DeviceAlreadyClaimedError(DeviceError):
    """Device atau kolam sudah memiliki ikatan kepemilikan lain."""


async def list_all_devices(db: AsyncSession) -> list[DeviceAdminOut]:
    """Semua device terdaftar, sudah diklaim maupun belum (kolam_id NULL).

    Panel admin butuh dua-duanya sekaligus (bukan cuma yang belum diklaim),
    outer join ke Kolam dan User supaya device yang sudah diklaim ikut bawa nama
    kolamnya dan nama pemiliknya.
    """
    result = await db.execute(
        select(Device, Kolam, User)
        .outerjoin(Kolam, Device.kolam_id == Kolam.id)
        .outerjoin(User, Kolam.owner_user_id == User.id)
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
            owner_nama=user.nama if user else None,
        )
        for device, kolam, user in result.all()
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


async def delete_device(db: AsyncSession, device_id: int) -> None:
    """Hapus device dari database (khusus admin)."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise DeviceNotFoundError(f"Device #{device_id} tidak ditemukan")
    await db.delete(device)
    await db.commit()


async def unclaim_device(db: AsyncSession, device_id: int) -> Device:
    """Lepaskan device dari kolam yang terhubung (khusus admin)."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise DeviceNotFoundError(f"Device #{device_id} tidak ditemukan")
    device.kolam_id = None
    await db.commit()
    await db.refresh(device)
    return device


async def claim_device_to_kolam(db: AsyncSession, device_id: int, kolam_id: int) -> Device:
    """Pasang device ke kolam milik user (khusus admin)."""
    result = await db.execute(select(Device).where(Device.id == device_id))
    device = result.scalar_one_or_none()
    if device is None:
        raise DeviceNotFoundError(f"Device #{device_id} tidak ditemukan")

    kolam_res = await db.execute(select(Kolam).where(Kolam.id == kolam_id))
    kolam = kolam_res.scalar_one_or_none()
    if kolam is None:
        raise DeviceError(f"Kolam #{kolam_id} tidak ditemukan")

    # Cek apakah kolam ini sudah terhubung ke device lain
    occupant_res = await db.execute(select(Device).where(Device.kolam_id == kolam.id))
    occupant = occupant_res.scalars().first()
    if occupant is not None and occupant.id != device.id:
        raise DeviceAlreadyClaimedError(
            f"Kolam '{kolam.nama}' sudah terhubung ke device '{occupant.device_code}'. "
            "Satu kolam hanya boleh terhubung ke satu device."
        )

    device.kolam_id = kolam.id
    await db.commit()
    await db.refresh(device)
    return device


async def list_target_kolams(db: AsyncSession) -> list[TargetKolamOut]:
    """Daftar seluruh kolam milik user, untuk pilihan target pemasangan device."""
    stmt = (
        select(Kolam, User, Device)
        .join(User, Kolam.owner_user_id == User.id)
        .outerjoin(Device, Device.kolam_id == Kolam.id)
        .order_by(User.nama.asc(), Kolam.nama.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        TargetKolamOut(
            id=kolam.id,
            nama=kolam.nama,
            owner_name=user.nama,
            owner_email=user.email,
            current_device_id=dev.id if dev else None,
            current_device_code=dev.device_code if dev else None,
        )
        for kolam, user, dev in rows
    ]

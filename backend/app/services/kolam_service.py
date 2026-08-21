"""Logika manajemen kolam (unit budidaya) & klaim device — dasar isolasi kepemilikan data."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Kolam, User
from app.models.enums import DeviceType, UserRole
from app.schemas.kolam import KolamCreateIn, KolamUpdateIn


class KolamError(Exception):
    """Error domain kolam (base class)."""


class DeviceNotFoundError(KolamError):
    """device_code yang diklaim tidak ditemukan."""


class DeviceAlreadyClaimedError(KolamError):
    """Device sudah diklaim kolam lain."""


async def create_kolam(db: AsyncSession, owner: User, payload: KolamCreateIn) -> Kolam:
    kolam = Kolam(owner_user_id=owner.id, nama=payload.nama, lokasi=payload.lokasi)
    db.add(kolam)
    await db.commit()
    await db.refresh(kolam)
    return kolam


async def list_kolam(db: AsyncSession, owner: User) -> list[Kolam]:
    result = await db.execute(select(Kolam).where(Kolam.owner_user_id == owner.id))
    return list(result.scalars().all())


async def get_owned_kolam(db: AsyncSession, owner: User, kolam_id: int) -> Kolam | None:
    """None kalau kolam tidak ada ATAU bukan milik `owner` — sengaja tidak
    dibedakan, supaya router balas 404 seragam tanpa bocorkan info kepemilikan."""
    result = await db.execute(
        select(Kolam).where(Kolam.id == kolam_id, Kolam.owner_user_id == owner.id)
    )
    return result.scalar_one_or_none()


async def update_kolam(db: AsyncSession, kolam: Kolam, payload: KolamUpdateIn) -> Kolam:
    kolam.nama = payload.nama
    kolam.lokasi = payload.lokasi
    await db.commit()
    await db.refresh(kolam)
    return kolam


async def claim_device(db: AsyncSession, kolam: Kolam, device_code: str) -> Device:
    """Klaim device (by device_code) ke `kolam`.

    Kalau device yang diklaim adalah master_node, ikut assign kolam_id yang sama
    ke semua slave node di bawahnya (parent_device_id = device ini) — supaya user
    tidak perlu klaim satu-satu per level rak. Slave yang sudah diklaim kolam LAIN
    dilewati (tidak diambil-alih diam-diam).
    """
    result = await db.execute(select(Device).where(Device.device_code == device_code))
    device = result.scalar_one_or_none()
    if device is None:
        raise DeviceNotFoundError(f"Device '{device_code}' tidak ditemukan")

    if device.kolam_id is not None and device.kolam_id != kolam.id:
        raise DeviceAlreadyClaimedError(f"Device '{device_code}' sudah diklaim kolam lain")

    device.kolam_id = kolam.id

    if device.device_type == DeviceType.MASTER_NODE:
        children_result = await db.execute(
            select(Device).where(Device.parent_device_id == device.id)
        )
        for child in children_result.scalars().all():
            # Cuma assign slave yang belum diklaim atau sudah di kolam ini juga —
            # cascade TIDAK boleh diam-diam mengambil-alih device yang sudah
            # diklaim kolam lain (mis. milik user lain).
            if child.kolam_id is None or child.kolam_id == kolam.id:
                child.kolam_id = kolam.id

    await db.commit()
    await db.refresh(device)
    return device


async def list_kolam_devices(db: AsyncSession, kolam: Kolam) -> list[Device]:
    """Semua device yang diklaim ke `kolam` ini, urut level_number lalu device_code."""
    result = await db.execute(
        select(Device)
        .where(Device.kolam_id == kolam.id)
        .order_by(Device.level_number.asc().nulls_last(), Device.device_code.asc())
    )
    return list(result.scalars().all())


async def get_allowed_device_ids(db: AsyncSession, user: User) -> set[int] | None:
    """Return None kalau `user` admin (artinya: akses tidak dibatasi), selain itu
    set device_id yang kolam-nya dimiliki `user` (bisa kosong)."""
    if user.role == UserRole.ADMIN:
        return None

    result = await db.execute(
        select(Device.id).join(Kolam, Device.kolam_id == Kolam.id).where(
            Kolam.owner_user_id == user.id
        )
    )
    return set(result.scalars().all())

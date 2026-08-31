"""Manajemen kolam & klaim device — dasar isolasi kepemilikan data."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, Kolam, User
from app.models.enums import UserRole
from app.schemas.kolam import KolamCreateIn, KolamUpdateIn


class KolamError(Exception):
    """Base error domain kolam."""


class DeviceNotFoundError(KolamError):
    """device_code yang diklaim tidak ditemukan."""


class DeviceAlreadyClaimedError(KolamError):
    """Klaim ditolak karena konflik: device sudah milik kolam lain, ATAU kolam
    tujuan sudah terhubung ke device lain (satu rak = satu device)."""


async def create_kolam(db: AsyncSession, owner: User, payload: KolamCreateIn) -> Kolam:
    """Kolam baru, langsung terikat ke pembuatnya."""
    kolam = Kolam(owner_user_id=owner.id, nama=payload.nama, lokasi=payload.lokasi)
    db.add(kolam)
    await db.commit()
    await db.refresh(kolam)
    return kolam


async def list_kolam(db: AsyncSession, owner: User) -> list[Kolam]:
    """Kolam milik `owner` saja."""
    result = await db.execute(select(Kolam).where(Kolam.owner_user_id == owner.id))
    return list(result.scalars().all())


async def get_owned_kolam(db: AsyncSession, owner: User, kolam_id: int) -> Kolam | None:
    """None kalau kolam tidak ada ATAU bukan milik `owner` — sengaja tidak dibedakan,
    supaya router balas 404 seragam tanpa membocorkan keberadaan kolam orang lain."""
    result = await db.execute(
        select(Kolam).where(Kolam.id == kolam_id, Kolam.owner_user_id == owner.id)
    )
    return result.scalar_one_or_none()


async def update_kolam(db: AsyncSession, kolam: Kolam, payload: KolamUpdateIn) -> Kolam:
    """Perbarui nama & lokasi kolam."""
    kolam.nama = payload.nama
    kolam.lokasi = payload.lokasi
    await db.commit()
    await db.refresh(kolam)
    return kolam


async def claim_device(db: AsyncSession, kolam: Kolam, device_code: str) -> Device:
    """Klaim device (by device_code) ke `kolam`.

    Satu kolam = satu rak = TEPAT SATU device. Klaim kedua ditolak 409, dan
    tidak ada lagi cascade master -> slave: kalau cascade dibiarkan, mengklaim
    master tetap menyeret semua slave ke satu kolam lewat API.
    """
    result = await db.execute(select(Device).where(Device.device_code == device_code))
    device = result.scalar_one_or_none()
    if device is None:
        raise DeviceNotFoundError(f"Device '{device_code}' tidak ditemukan")

    if device.kolam_id is not None and device.kolam_id != kolam.id:
        raise DeviceAlreadyClaimedError(f"Device '{device_code}' sudah diklaim kolam lain")

    # Klaim ulang device yang sama tetap idempoten; yang ditolak cuma device kedua.
    occupant_result = await db.execute(select(Device).where(Device.kolam_id == kolam.id))
    occupant = occupant_result.scalars().first()
    if occupant is not None and occupant.id != device.id:
        raise DeviceAlreadyClaimedError(
            f"Kolam ini sudah terhubung ke device '{occupant.device_code}'. "
            "Satu rak hanya boleh terhubung ke satu device."
        )

    device.kolam_id = kolam.id

    await db.commit()
    await db.refresh(device)
    return device


async def list_kolam_devices(db: AsyncSession, kolam: Kolam) -> list[Device]:
    """Device dalam `kolam`, urut level_number lalu device_code."""
    result = await db.execute(
        select(Device)
        .where(Device.kolam_id == kolam.id)
        .order_by(Device.level_number.asc().nulls_last(), Device.device_code.asc())
    )
    return list(result.scalars().all())


async def get_allowed_device_ids(db: AsyncSession, user: User) -> set[int] | None:
    """Himpunan device yang boleh dibaca `user`. None = admin, tidak dibatasi."""
    if user.role == UserRole.ADMIN:
        return None

    result = await db.execute(
        select(Device.id).join(Kolam, Device.kolam_id == Kolam.id).where(
            Kolam.owner_user_id == user.id
        )
    )
    return set(result.scalars().all())

"""Router kolam: CRUD kolam + klaim device, pintu masuk isolasi kepemilikan data."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.device import DeviceOut
from app.schemas.kolam import KolamCreateIn, KolamOut, KolamUpdateIn
from app.services import kolam_service
from app.services.kolam_service import DeviceAlreadyClaimedError, DeviceNotFoundError

router = APIRouter(prefix="/kolam", tags=["kolam"])


@router.post("", response_model=KolamOut, status_code=201)
async def create_kolam(
    payload: KolamCreateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KolamOut:
    """Buat kolam baru milik user ini, sekaligus klaim device-nya.

    Gagal klaim = kolam tidak jadi dibuat (satu transaksi di kolam_service).
    """
    try:
        kolam = await kolam_service.create_kolam(db, current_user, payload)
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DeviceAlreadyClaimedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return KolamOut.model_validate(kolam)


@router.get("", response_model=list[KolamOut])
async def list_kolam(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[KolamOut]:
    """Daftar kolam milik user ini saja."""
    items = await kolam_service.list_kolam(db, current_user)
    return [KolamOut.model_validate(k) for k in items]


@router.get("/{kolam_id}", response_model=KolamOut)
async def get_kolam(
    kolam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KolamOut:
    """Detail satu kolam. 404 seragam kalau bukan milik user ini."""
    kolam = await kolam_service.get_owned_kolam(db, current_user, kolam_id)
    if kolam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kolam tidak ditemukan")
    return KolamOut.model_validate(kolam)


@router.get("/{kolam_id}/devices", response_model=list[DeviceOut])
async def list_kolam_devices(
    kolam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceOut]:
    """Topologi device (master + slave per level) dalam satu kolam."""
    kolam = await kolam_service.get_owned_kolam(db, current_user, kolam_id)
    if kolam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kolam tidak ditemukan")
    devices = await kolam_service.list_kolam_devices(db, kolam)
    return [DeviceOut.model_validate(d) for d in devices]


@router.put("/{kolam_id}", response_model=KolamOut)
async def update_kolam(
    kolam_id: int,
    payload: KolamUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KolamOut:
    """Ubah nama kolam sendiri."""
    kolam = await kolam_service.get_owned_kolam(db, current_user, kolam_id)
    if kolam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kolam tidak ditemukan")
    kolam = await kolam_service.update_kolam(db, kolam, payload)
    return KolamOut.model_validate(kolam)


@router.delete("/{kolam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_kolam(
    kolam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hapus kolam sendiri, permanen.

    Device yang terhubung tidak ikut terhapus, FK-nya SET NULL, jadi perangkat
    itu hanya kembali jadi tak terklaim beserta seluruh riwayat sensornya.
    Notifikasi kolam ini ikut terhapus (FK CASCADE).
    """
    kolam = await kolam_service.get_owned_kolam(db, current_user, kolam_id)
    if kolam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kolam tidak ditemukan")
    await kolam_service.delete_kolam(db, kolam)


@router.post("/{kolam_id}/devices/{device_code}", status_code=status.HTTP_204_NO_CONTENT)
async def claim_device(
    kolam_id: int,
    device_code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Klaim device ke kolam ini, langkah yang membuka akses data device tsb."""
    kolam = await kolam_service.get_owned_kolam(db, current_user, kolam_id)
    if kolam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kolam tidak ditemukan")

    try:
        await kolam_service.claim_device(db, kolam, device_code)
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DeviceAlreadyClaimedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

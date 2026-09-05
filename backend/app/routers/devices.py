"""Router device — khusus admin: lihat semua device (klaim/belum) & tambah device baru.

Menggantikan alur lama (INSERT manual ke tabel devices lewat psql) dengan form
web. Klaim device ke kolam TETAP lewat POST /kolam/:id/devices/:code (kolam.py)
— router ini cuma soal keberadaan device-nya di DB.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin
from app.db.session import get_db
from app.models import User
from app.schemas.device import (
    DeviceAdminOut,
    DeviceClaimIn,
    DeviceCreateIn,
    DeviceOut,
    TargetKolamOut,
)
from app.services import device_service
from app.services.device_service import (
    DeviceAlreadyClaimedError,
    DeviceCodeConflictError,
    DeviceError,
    DeviceNotFoundError,
)

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceAdminOut])
async def list_devices(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceAdminOut]:
    """Semua device terdaftar — sudah diklaim (ikut nama kolamnya) maupun belum."""
    return await device_service.list_all_devices(db)


@router.get("/target-kolams", response_model=list[TargetKolamOut])
async def list_target_kolams(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TargetKolamOut]:
    """Daftar kolam untuk tujuan pemasangan device (khusus admin)."""
    return await device_service.list_target_kolams(db)


@router.post("", response_model=DeviceOut, status_code=201)
async def create_device(
    payload: DeviceCreateIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> DeviceOut:
    """Daftarkan device_code baru — dipakai admin sebelum device itu dipasang/
    diklaim, gantinya input manual ke database."""
    try:
        device = await device_service.create_device(db, payload)
    except DeviceCodeConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return DeviceOut.model_validate(device)


@router.post("/{device_id}/claim", response_model=DeviceOut)
async def claim_device_to_kolam(
    device_id: int,
    payload: DeviceClaimIn,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> DeviceOut:
    """Pasang device ke kolam tertentu oleh admin."""
    try:
        device = await device_service.claim_device_to_kolam(db, device_id, payload.kolam_id)
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except DeviceAlreadyClaimedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except DeviceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return DeviceOut.model_validate(device)


@router.post("/{device_id}/unclaim", response_model=DeviceOut)
async def unclaim_device(
    device_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> DeviceOut:
    """Lepaskan device dari kolam yang sedang terhubung."""
    try:
        device = await device_service.unclaim_device(db, device_id)
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return DeviceOut.model_validate(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hapus device secara permanen dari database (khusus admin)."""
    try:
        await device_service.delete_device(db, device_id)
    except DeviceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

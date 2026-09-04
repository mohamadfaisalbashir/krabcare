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
from app.schemas.device import DeviceAdminOut, DeviceCreateIn, DeviceOut
from app.services import device_service
from app.services.device_service import DeviceCodeConflictError

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceAdminOut])
async def list_devices(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceAdminOut]:
    """Semua device terdaftar — sudah diklaim (ikut nama kolamnya) maupun belum."""
    return await device_service.list_all_devices(db)


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

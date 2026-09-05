"""Router notifikasi in-app + registrasi push token (FCM)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import Device, User
from app.schemas.notification import NotificationOut, PushTokenRegisterIn
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, gt=0, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[NotificationOut]:
    """Notifikasi milik user ini; device_code diambil sekali lewat batch lookup."""
    items = await notification_service.list_notifications(
        db, current_user, unread_only, limit, offset
    )
    device_ids = {n.device_id for n in items}
    devices_result = await db.execute(select(Device).where(Device.id.in_(device_ids)))
    device_by_id = {d.id: d for d in devices_result.scalars().all()}
    return [
        NotificationOut(
            id=n.id,
            device_id=n.device_id,
            device_code=device_by_id[n.device_id].device_code if n.device_id in device_by_id else None,
            kolam_id=n.kolam_id,
            source=n.source,
            parameter=n.parameter,
            quality_category=n.quality_category,
            event_time=n.event_time,
            message=n.message,
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in items
    ]


@router.post("/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Tandai satu notifikasi sudah dibaca."""
    ok = await notification_service.mark_read(db, current_user, notification_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notifikasi tidak ditemukan")


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hapus satu notifikasi."""
    ok = await notification_service.delete_notification(db, current_user, notification_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notifikasi tidak ditemukan")


@router.delete("", status_code=200)
async def delete_all_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Hapus SEMUA notifikasi milik user ini."""
    jumlah = await notification_service.delete_all_notifications(db, current_user)
    return {"deleted": jumlah}


@router.post("/push-tokens", status_code=201)
async def register_push_token(
    payload: PushTokenRegisterIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Daftarkan/refresh token FCM perangkat mobile user ini."""
    await notification_service.register_push_token(db, current_user, payload.fcm_token, payload.platform)
    return {"detail": "Push token terdaftar."}

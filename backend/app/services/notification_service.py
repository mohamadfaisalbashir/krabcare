"""Logika notifikasi in-app + dispatch push (FCM) dari hasil pipeline ML."""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.push import send_push
from app.models import Device, Kolam, Notification, PushToken, User

logger = logging.getLogger("app.services.notification_service")
_ANOMALY_CATEGORIES = {"sedang", "buruk"}


async def _last_classification_category(db: AsyncSession, device_id: int) -> str | None:
    result = await db.execute(
        select(Notification.quality_category)
        .where(Notification.device_id == device_id, Notification.source == "classification")
        .order_by(Notification.event_time.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_classification_notification(
    db: AsyncSession,
    device: Device,
    kolam: Kolam,
    category: str,
    quality_score: float,
    sensor_reading_time: datetime,
) -> Notification | None:
    """Notifikasi baru cuma dibuat kalau kategori BERUBAH dari yang terakhir —
    supaya tidak spam tiap siklus scheduler selama anomali masih berlangsung."""
    previous = await _last_classification_category(db, device.id)
    if previous == category:
        return None

    if category in _ANOMALY_CATEGORIES:
        message = f"Kualitas air {device.device_code} saat ini berstatus {category.upper()} (skor {quality_score:.1f})."
    elif previous in _ANOMALY_CATEGORIES:
        message = f"Kualitas air {device.device_code} kembali NORMAL (baik)."
    else:
        return None

    notification = Notification(
        user_id=kolam.owner_user_id,
        device_id=device.id,
        kolam_id=kolam.id,
        source="classification",
        quality_category=category,
        event_time=sensor_reading_time,
        message=message,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification


async def create_prediction_notifications(
    db: AsyncSession, device: Device, kolam: Kolam, anomalies: list[dict]
) -> list[Notification]:
    """anomalies: [{"target_time": datetime, "category": str, "horizon_minutes": int}, ...].
    Dedup lewat UNIQUE (device_id, source, event_time) — event_time = target_time
    absolut, jadi ON CONFLICT DO NOTHING cukup (beda dari classification yang
    butuh transition-check)."""
    if not anomalies:
        return []

    rows = [
        {
            "user_id": kolam.owner_user_id,
            "device_id": device.id,
            "kolam_id": kolam.id,
            "source": "prediction",
            "quality_category": a["category"],
            "event_time": a["target_time"],
            "message": (
                f"Prediksi: kualitas air {device.device_code} berpotensi {a['category'].upper()} "
                f"sekitar {a['target_time'].strftime('%H:%M')} (~{a['horizon_minutes'] // 60} jam lagi)."
            ),
        }
        for a in anomalies
    ]
    stmt = (
        pg_insert(Notification)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=[Notification.device_id, Notification.source, Notification.event_time]
        )
        .returning(Notification)
    )
    result = await db.execute(stmt)
    await db.commit()
    return list(result.scalars().all())


async def dispatch_push(db: AsyncSession, notifications: list[Notification]) -> None:
    for notif in notifications:
        result = await db.execute(select(PushToken).where(PushToken.user_id == notif.user_id))
        tokens = result.scalars().all()
        if not tokens:
            continue
        title = "Peringatan Kualitas Air" if notif.quality_category in _ANOMALY_CATEGORIES else "Kualitas Air Membaik"
        any_success = False
        for pt in tokens:
            try:
                if send_push(pt.fcm_token, title, notif.message):
                    any_success = True
            except Exception:
                logger.exception("Gagal kirim push ke user_id=%s", notif.user_id)
        if any_success:
            notif.is_pushed = True
    await db.commit()


async def list_notifications(
    db: AsyncSession, user: User, unread_only: bool, limit: int
) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def mark_read(db: AsyncSession, user: User, notification_id: int) -> bool:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        return False
    notification.is_read = True
    await db.commit()
    return True


async def register_push_token(db: AsyncSession, user: User, fcm_token: str, platform: str) -> None:
    stmt = (
        pg_insert(PushToken)
        .values(user_id=user.id, fcm_token=fcm_token, platform=platform)
        .on_conflict_do_update(
            index_elements=[PushToken.fcm_token],
            set_={"user_id": user.id, "platform": platform, "last_used_at": func.now()},
        )
    )
    await db.execute(stmt)
    await db.commit()

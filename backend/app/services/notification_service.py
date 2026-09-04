"""Notifikasi in-app + dispatch push (FCM) dari hasil pipeline ML."""

import logging
from datetime import datetime

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.push import send_push
from app.models import Device, Kolam, Notification, PushToken, User

if TYPE_CHECKING:
    from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn

logger = logging.getLogger("app.services.notification_service")

#: Kategori (nilai DB baik/sedang/buruk) yang dianggap anomali. SALINAN dari
#: ANOMALY_CATEGORIES di raspi/fuzzy_quality.py — klasifikasi sekarang dihitung
#: di edge, tapi keputusan "kapan kirim notifikasi" tetap di backend, jadi
#: konstanta ini WAJIB tetap sinkron dengan sumber itu kalau kategorinya
#: pernah berubah.
ANOMALY_CATEGORIES = {"sedang", "buruk"}


async def _last_classification_category(db: AsyncSession, device_id: int) -> str | None:
    """Kategori pada notifikasi klasifikasi terakhir device ini — acuan transition-check."""
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
    """Notifikasi status sekarang — hanya dibuat saat kategori BERUBAH.

    Tanpa transition-check ini, tiap siklus scheduler akan memberi notifikasi
    selama anomali masih berlangsung. Return None kalau tidak ada yang dibuat.
    """
    previous = await _last_classification_category(db, device.id)
    if previous == category:
        return None

    if category in ANOMALY_CATEGORIES:
        message = f"Kualitas air {device.device_code} saat ini berstatus {category.upper()} (skor {quality_score:.1f})."
    elif previous in ANOMALY_CATEGORIES:
        message = f"Kualitas air {device.device_code} kembali NORMAL (baik)."
    else:
        # Baik -> baik (atau notifikasi pertama & kondisinya baik): tidak perlu diberitahu.
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
    """Peringatan dini dari horizon yang diramal anomali.

    `anomalies`: [{"target_time", "category", "horizon_minutes"}, ...]. Dedup cukup
    lewat UNIQUE (device_id, source, event_time) karena target_time absolut —
    beda dari klasifikasi yang butuh transition-check. Return yang benar-benar baru.
    """
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
                f"sekitar {a['target_time'].strftime('%H:%M')} ({a['horizon_minutes']} menit lagi)."
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
    """Kirim tiap notifikasi ke semua perangkat pemiliknya.

    Gagal di satu token tidak menghentikan token lain; is_pushed baru true kalau
    minimal satu perangkat berhasil menerima.
    """
    for notif in notifications:
        result = await db.execute(select(PushToken).where(PushToken.user_id == notif.user_id))
        tokens = result.scalars().all()
        if not tokens:
            continue
        title = "Peringatan Kualitas Air" if notif.quality_category in ANOMALY_CATEGORIES else "Kualitas Air Membaik"
        any_success = False
        for token in tokens:
            try:
                if send_push(token.fcm_token, title, notif.message):
                    any_success = True
            except Exception:
                logger.exception("Gagal kirim push ke user_id=%s", notif.user_id)
        if any_success:
            notif.is_pushed = True
    await db.commit()


async def dispatch_from_quality_ingest(
    db: AsyncSession,
    classifications: list["FuzzyClassificationIn"],
    predictions: list["FuzzyPredictionIn"],
) -> None:
    """Pemicu notifikasi untuk klasifikasi & prediksi yang BARU DITERIMA lewat
    POST /ingest/quality (dikirim edge, lihat raspi/edge_pipeline.py).

    Dulu dipanggil dari ml_pipeline_service.py setiap siklus scheduler backend
    menghitung sendiri; sekarang backend cuma menerima hasil hitungnya, jadi
    titik pemicunya pindah ke sini — tapi ATURANNYA sama persis (transition
    check untuk klasifikasi, dedup UNIQUE untuk prediksi, lihat fungsi masing-
    masing di atas). Device yang belum diklaim (kolam_id NULL) dilewati:
    notifikasi butuh pemilik (kolam.owner_user_id).
    """
    device_codes = sorted({c.device_code for c in classifications} | {p.device_code for p in predictions})
    if not device_codes:
        return

    result = await db.execute(
        select(Device, Kolam)
        .join(Kolam, Device.kolam_id == Kolam.id)
        .where(Device.device_code.in_(device_codes))
    )
    claimed = {device.device_code: (device, kolam) for device, kolam in result.all()}

    new_notifications: list[Notification] = []

    for c in classifications:
        pasangan = claimed.get(c.device_code)
        if pasangan is None:
            continue  # device belum diklaim, atau device_code tidak dikenal
        device, kolam = pasangan
        notif = await create_classification_notification(
            db, device, kolam, c.quality_category, c.quality_score, c.sensor_reading_time or c.time
        )
        if notif is not None:
            new_notifications.append(notif)

    predictions_by_device: dict[str, list[dict]] = {}
    for p in predictions:
        if p.predicted_category is None or p.predicted_category not in ANOMALY_CATEGORIES:
            continue
        predictions_by_device.setdefault(p.device_code, []).append(
            {"target_time": p.target_time, "category": p.predicted_category, "horizon_minutes": p.horizon_minutes}
        )

    for device_code, anomalies in predictions_by_device.items():
        pasangan = claimed.get(device_code)
        if pasangan is None:
            continue
        device, kolam = pasangan
        new_notifications.extend(await create_prediction_notifications(db, device, kolam, anomalies))

    if new_notifications:
        await dispatch_push(db, new_notifications)


async def list_notifications(
    db: AsyncSession, user: User, unread_only: bool, limit: int
) -> list[Notification]:
    """Notifikasi milik `user`, terbaru dulu."""
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def mark_read(db: AsyncSession, user: User, notification_id: int) -> bool:
    """Tandai sudah dibaca. False = tidak ada / bukan milik user ini (router balas 404)."""
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
    """Simpan token FCM. Token yang sama bisa pindah pemilik, jadi upsert, bukan insert."""
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

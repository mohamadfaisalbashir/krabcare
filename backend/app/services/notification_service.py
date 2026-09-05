"""Notifikasi in-app + dispatch push (FCM) dari hasil pipeline ML."""

import logging
from datetime import datetime

from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.push import send_push
from app.models import Device, Kolam, Notification, PushToken, SensorReading, User

if TYPE_CHECKING:
    from app.schemas.ammonia import AmmoniaRiskIn
    from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn

logger = logging.getLogger("app.services.notification_service")

#: Kategori (nilai DB baik/sedang/buruk) yang dianggap anomali. SALINAN dari
#: ANOMALY_CATEGORIES di raspi/fuzzy_quality.py — klasifikasi sekarang dihitung
#: di edge, tapi keputusan "kapan kirim notifikasi" tetap di backend, jadi
#: konstanta ini WAJIB tetap sinkron dengan sumber itu kalau kategorinya
#: pernah berubah.
ANOMALY_CATEGORIES = {"sedang", "buruk"}

#: Label Indonesia yang dipakai di pesan notifikasi & di seluruh frontend
#: (categoryToLabel() di lib/types.ts) -- SALINAN yang harus tetap sinkron,
#: sama seperti ANOMALY_CATEGORIES di atas.
CATEGORY_LABEL: dict[str, str] = {"baik": "Aman", "sedang": "Waspada", "buruk": "Bahaya"}


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

    Pesannya SELALU menyebut transisi eksplisit ("dari X ke Y") memakai label
    yang sama dengan yang dilihat pengguna di dashboard (Aman/Waspada/Bahaya) --
    bukan lagi "berstatus SEDANG/BURUK"/"kembali NORMAL" yang generik. Itu
    otomatis mencakup keempat perpindahan yang diminta (aman<->waspada,
    bahaya<->waspada), plus dua lompatan ekstrem aman<->bahaya kalau suatu saat
    memang terjadi (fuzzy Mamdani interpolasi halus, jadi jarang, tapi bukan
    berarti tidak mungkin) -- tanpa perlu daftar kasus khusus yang gampang
    ketinggalan salah satu kombinasi.
    """
    previous = await _last_classification_category(db, device.id)
    if previous == category:
        return None

    label_baru = CATEGORY_LABEL.get(category, category)

    if previous is None:
        # Belum ada pembanding -- ini bukan "perubahan", jadi diam kalau
        # kondisi awalnya memang baik. Anomali di percobaan pertama device
        # tetap diberitahu (bukan transisi, tapi tetap layak diketahui).
        if category == "baik":
            return None
        message = (
            f"Kualitas air {device.device_code} pertama kali tercatat "
            f"{label_baru.upper()} (skor {quality_score:.1f})."
        )
    else:
        label_lama = CATEGORY_LABEL.get(previous, previous)
        message = (
            f"Kondisi kolam {device.device_code} berubah dari {label_lama} ke {label_baru} "
            f"(skor {quality_score:.1f})."
        )

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


#: Ambang toleransi dan optimal parameter air — SAMA dengan yang ada di web/src/lib/parameter.ts
PARAM_CONFIG: dict[str, dict] = {
    "ph": {
        "label": "pH air",
        "unit": "pH",
        "min": 6.5,
        "max": 9.0,
        "optimal": (7.5, 8.5),
    },
    "temperature_c": {
        "label": "Suhu kolam",
        "unit": "°C",
        "min": 20.0,
        "max": 35.0,
        "optimal": (28.0, 30.0),
    },
    "salinity_ppt": {
        "label": "Salinitas kolam",
        "unit": "ppt",
        "min": 5.0,
        "max": 40.0,
        "optimal": (10.0, 30.0),
    },
}

AMMONIA_RISK_TO_CATEGORY: dict[str, str] = {
    "normal": "baik",
    "perhatian": "sedang",
    "berbahaya": "buruk",
}


def classify_param_value(param_key: str, value: float) -> str:
    """Tentukan kategori status dari nilai numerik parameter."""
    cfg = PARAM_CONFIG[param_key]
    if value < cfg["min"] or value > cfg["max"]:
        return "buruk"
    if value < cfg["optimal"][0] or value > cfg["optimal"][1]:
        return "sedang"
    return "baik"


async def _last_parameter_category(db: AsyncSession, device_id: int, parameter: str) -> str | None:
    """Kategori pada notifikasi parameter terakhir device ini — acuan transition-check."""
    result = await db.execute(
        select(Notification.quality_category)
        .where(
            Notification.device_id == device_id,
            Notification.source == "parameter",
            Notification.parameter == parameter,
        )
        .order_by(Notification.event_time.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_parameter_notification(
    db: AsyncSession,
    device: Device,
    kolam: Kolam,
    parameter: str,
    category: str,
    param_label: str,
    value_str: str,
    reading_time: datetime,
) -> Notification | None:
    """Notifikasi status satu parameter — hanya dibuat saat kategori BERUBAH."""
    previous = await _last_parameter_category(db, device.id, parameter)
    if previous == category:
        return None

    label_baru = CATEGORY_LABEL.get(category, category)

    if previous is None:
        if category == "baik":
            return None
        message = (
            f"Kondisi {param_label} {device.device_code} pertama kali tercatat "
            f"{label_baru.upper()} ({value_str})."
        )
    else:
        label_lama = CATEGORY_LABEL.get(previous, previous)
        message = (
            f"Kondisi {param_label} {device.device_code} berubah dari {label_lama} ke {label_baru} "
            f"({value_str})."
        )

    notification = Notification(
        user_id=kolam.owner_user_id,
        device_id=device.id,
        kolam_id=kolam.id,
        source="parameter",
        parameter=parameter,
        quality_category=category,
        event_time=reading_time,
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
    lewat UNIQUE (device_id, source, event_time, parameter) karena target_time absolut —
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
            "parameter": None,
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
            index_elements=[Notification.device_id, Notification.source, Notification.event_time, Notification.parameter]
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
        if notif.parameter:
            param_label = PARAM_CONFIG.get(notif.parameter, {}).get(
                "label", "Risiko amonia" if notif.parameter == "ammonia" else notif.parameter
            )
            title = (
                f"Peringatan {param_label}"
                if notif.quality_category in ANOMALY_CATEGORIES
                else f"Kondisi {param_label} Membaik"
            )
        else:
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
    ammonia_risks: list["AmmoniaRiskIn"] | None = None,
) -> None:
    """Pemicu notifikasi untuk klasifikasi, prediksi, & parameter yang BARU DITERIMA lewat
    POST /ingest/quality (dikirim edge, lihat raspi/edge_pipeline.py).

    Dulu dipanggil dari ml_pipeline_service.py setiap siklus scheduler backend
    menghitung sendiri; sekarang backend cuma menerima hasil hitungnya, jadi
    titik pemicunya pindah ke sini — tapi ATURANNYA sama persis (transition
    check untuk klasifikasi & per-parameter, dedup UNIQUE untuk prediksi).
    Device yang belum diklaim (kolam_id NULL) dilewati: notifikasi butuh pemilik.
    """
    device_codes = sorted(
        {c.device_code for c in classifications}
        | {p.device_code for p in predictions}
        | ({a.device_code for a in ammonia_risks} if ammonia_risks else set())
    )
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

    # Evaluasi notifikasi per parameter (pH, suhu, salinitas, amonia)
    ammonia_now_by_device: dict[str, "AmmoniaRiskIn"] = {}
    if ammonia_risks:
        for a in ammonia_risks:
            if a.horizon_minutes == 0:
                ammonia_now_by_device[a.device_code] = a

    for device_code, (device, kolam) in claimed.items():
        a_now = ammonia_now_by_device.get(device_code)
        reading_time = a_now.time if a_now else None
        ph_val = a_now.input_ph if a_now else None
        temp_val = a_now.input_temperature_c if a_now else None
        sal_val = a_now.input_salinity_ppt if a_now else None

        if ph_val is None or temp_val is None or sal_val is None or reading_time is None:
            res = await db.execute(
                select(SensorReading)
                .where(SensorReading.device_id == device.id)
                .order_by(SensorReading.time.desc())
                .limit(1)
            )
            last_sr = res.scalar_one_or_none()
            if last_sr:
                if reading_time is None:
                    reading_time = last_sr.time
                if ph_val is None and last_sr.ph is not None:
                    ph_val = float(last_sr.ph)
                if temp_val is None and last_sr.temperature_c is not None:
                    temp_val = float(last_sr.temperature_c)
                if sal_val is None and last_sr.salinity_ppt is not None:
                    sal_val = float(last_sr.salinity_ppt)

        if reading_time is None:
            continue

        # 1. Parameter pH
        if ph_val is not None:
            ph_cat = classify_param_value("ph", ph_val)
            notif_ph = await create_parameter_notification(
                db, device, kolam, "ph", ph_cat, PARAM_CONFIG["ph"]["label"], f"nilai {ph_val:.1f} pH", reading_time
            )
            if notif_ph:
                new_notifications.append(notif_ph)

        # 2. Parameter Suhu
        if temp_val is not None:
            temp_cat = classify_param_value("temperature_c", temp_val)
            notif_temp = await create_parameter_notification(
                db, device, kolam, "temperature_c", temp_cat, PARAM_CONFIG["temperature_c"]["label"], f"nilai {temp_val:.1f} °C", reading_time
            )
            if notif_temp:
                new_notifications.append(notif_temp)

        # 3. Parameter Salinitas
        if sal_val is not None:
            sal_cat = classify_param_value("salinity_ppt", sal_val)
            notif_sal = await create_parameter_notification(
                db, device, kolam, "salinity_ppt", sal_cat, PARAM_CONFIG["salinity_ppt"]["label"], f"nilai {sal_val:.1f} ppt", reading_time
            )
            if notif_sal:
                new_notifications.append(notif_sal)

        # 4. Parameter Amonia
        if a_now and a_now.risk_level:
            ammonia_cat = AMMONIA_RISK_TO_CATEGORY.get(a_now.risk_level.lower())
            if ammonia_cat:
                fraksi_str = (
                    f"fraksi NH3 {a_now.fraction_nh3_pct:.1f}%"
                    if a_now.fraction_nh3_pct is not None
                    else a_now.risk_level
                )
                notif_ammonia = await create_parameter_notification(
                    db, device, kolam, "ammonia", ammonia_cat, "risiko amonia", fraksi_str, reading_time
                )
                if notif_ammonia:
                    new_notifications.append(notif_ammonia)

    if new_notifications:
        await dispatch_push(db, new_notifications)


async def list_notifications(
    db: AsyncSession, user: User, unread_only: bool, limit: int, offset: int = 0
) -> list[Notification]:
    """Notifikasi milik `user`, terbaru dulu. `offset` untuk paginasi "muat lebih banyak"."""
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
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


async def delete_notification(db: AsyncSession, user: User, notification_id: int) -> bool:
    """Hapus satu notifikasi. False = tidak ada / bukan milik user ini (router balas 404)."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id, Notification.user_id == user.id
        )
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        return False
    await db.delete(notification)
    await db.commit()
    return True


async def delete_all_notifications(db: AsyncSession, user: User) -> int:
    """Hapus SEMUA notifikasi milik `user`. Kembalikan jumlah baris yang terhapus."""
    result = await db.execute(select(Notification).where(Notification.user_id == user.id))
    rows = list(result.scalars().all())
    for row in rows:
        await db.delete(row)
    await db.commit()
    return len(rows)


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

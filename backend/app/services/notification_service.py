"""Notifikasi dari hasil pipeline ML"""

import logging
from datetime import datetime, timedelta, timezone

from typing import TYPE_CHECKING

from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql import func

from app.core.push import send_push
from app.models import Device, Kolam, Notification, PushToken, SensorReading, User
from app.services import sensor_status

if TYPE_CHECKING:
    from app.schemas.ammonia import AmmoniaRiskIn
    from app.schemas.fuzzy import FuzzyClassificationIn, FuzzyPredictionIn

logger = logging.getLogger("app.services.notification_service")

ANOMALY_CATEGORIES = {"sedang", "buruk"}

CATEGORY_LABEL: dict[str, str] = {"baik": "Aman", "sedang": "Waspada", "buruk": "Bahaya"}

# Jam di teks notifikasi dibaca manusia di Jakarta. WIB = UTC+7 tanpa DST.
WIB = timezone(timedelta(hours=7), "WIB")


def jam_wib(t: datetime) -> str:
    """Jam "HH:MM" dalam WIB. Datetime naive dianggap UTC, sama seperti ingest_base."""
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(WIB).strftime("%H:%M")


def _label_device(device: Device, kolam: Kolam) -> str:
    """Penyebut device di teks notifikasi: "Nama Kolam (ID device)"."""
    return f"{kolam.nama} ({device.device_code})"

# Data yang lebih tua dari ini (mis. backlog buffer Raspi setelah internet pulih)
# tetap disimpan sebagai notifikasi, tapi tidak di-push ke HP.
PUSH_MAKS_UMUR = timedelta(minutes=10)


def _masih_segar(t: datetime, batas: datetime) -> bool:
    """Data cukup baru untuk di-push. Naive dianggap UTC, sama seperti jam_wib."""
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t >= batas

# Notifikasi yang lebih tua dari ini dihapus otomatis dan tidak ditampilkan.
NOTIF_MAKS_UMUR = timedelta(days=7)


async def hapus_notifikasi_lama(db: AsyncSession) -> None:
    """Buang notifikasi yang umurnya lewat NOTIF_MAKS_UMUR.

    Baris terbaru per (device, source, parameter) disisakan walau sudah tua:
    transition check (_last_*_category) membacanya sebagai status terakhir.
    Kalau ikut terhapus, kolam yang menetap di Bahaya dianggap "baru" Bahaya
    lagi dan memicu notifikasi + push ulang tiap minggu. Baris sisa itu
    disembunyikan oleh list_notifications. Prediksi tidak punya transition
    check, jadi dihapus semua.

    ponytail: dipanggil tiap ingest, tanpa scheduler. Tabelnya kecil (isinya
    cuma seminggu). Pindah ke job terjadwal kalau DELETE ini mulai terasa.
    """
    lebih_baru = aliased(Notification)
    ada_yang_lebih_baru = (
        select(lebih_baru.id)
        .where(
            lebih_baru.device_id == Notification.device_id,
            lebih_baru.source == Notification.source,
            lebih_baru.parameter.is_not_distinct_from(Notification.parameter),
            lebih_baru.event_time > Notification.event_time,
        )
        .correlate(Notification)
        .exists()
    )
    await db.execute(
        delete(Notification)
        .where(
            Notification.created_at < datetime.now(timezone.utc) - NOTIF_MAKS_UMUR,
            or_(Notification.source == "prediction", ada_yang_lebih_baru),
        )
        .execution_options(synchronize_session=False)
    )
    await db.commit()


_UNIQUE_KEY = [
    Notification.device_id,
    Notification.source,
    Notification.event_time,
    Notification.parameter,
]

async def _insert_abaikan_duplikat(db: AsyncSession, values: dict) -> Notification | None:
    """INSERT satu notifikasi; None kalau kunci uniknya sudah ada"""
    stmt = (
        pg_insert(Notification)
        .values(values)
        .on_conflict_do_nothing(index_elements=_UNIQUE_KEY)
        .returning(Notification)
    )
    result = await db.execute(stmt)
    await db.commit()
    return result.scalars().first()

async def _last_classification_category(db: AsyncSession, device_id: int) -> str | None:
    """Kategori pada notifikasi klasifikasi terakhir device ini, acuan transition-check."""
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
    """Notifikasi status sekarang, hanya dibuat saat kategori berubah"""
    previous = await _last_classification_category(db, device.id)
    if previous == category:
        return None

    label_baru = CATEGORY_LABEL.get(category, category)

    if previous is None:
        if category == "baik":
            return None
        message = (
            f"Kualitas air {_label_device(device, kolam)} tercatat dalam kondisi "
            f"{label_baru.upper()} (skor {quality_score:.2f})."
        )
    else:
        label_lama = CATEGORY_LABEL.get(previous, previous)
        message = (
            f"Kondisi kolam {_label_device(device, kolam)} berubah dari {label_lama} ke {label_baru} "
            f"(skor {quality_score:.2f})."
        )

    return await _insert_abaikan_duplikat(
        db,
        {
            "user_id": kolam.owner_user_id,
            "device_id": device.id,
            "kolam_id": kolam.id,
            "source": "classification",
            "parameter": None,
            "quality_category": category,
            "event_time": sensor_reading_time,
            "message": message,
        },
    )

# Ambang toleransi dan optimal parameter air
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

async def _last_parameter_category(
    db: AsyncSession, device_id: int, parameter: str, source: str = "parameter"
) -> str | None:
    """Kategori pada notifikasi parameter terakhir device ini, acuan transition-check."""
    result = await db.execute(
        select(Notification.quality_category)
        .where(
            Notification.device_id == device_id,
            Notification.source == source,
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
    """Notifikasi status satu parameter, hanya dibuat saat kategorinya berubah."""
    previous = await _last_parameter_category(db, device.id, parameter)
    if previous == category:
        return None

    label_baru = CATEGORY_LABEL.get(category, category)

    if previous is None:
        if category == "baik":
            return None
        message = (
            f"Kondisi {param_label} {_label_device(device, kolam)} tercatat dalam kondisi "
            f"{label_baru.upper()} ({value_str})."
        )
    else:
        label_lama = CATEGORY_LABEL.get(previous, previous)
        message = (
            f"Kondisi {param_label} {_label_device(device, kolam)} berubah dari {label_lama} ke {label_baru} "
            f"({value_str})."
        )

    return await _insert_abaikan_duplikat(
        db,
        {
            "user_id": kolam.owner_user_id,
            "device_id": device.id,
            "kolam_id": kolam.id,
            "source": "parameter",
            "parameter": parameter,
            "quality_category": category,
            "event_time": reading_time,
            "message": message,
        },
    )

async def create_prediction_notifications(
    db: AsyncSession, device: Device, kolam: Kolam, anomalies: list[dict]
) -> list[Notification]:
    """Peringatan dini dari horizon yang diramal anomali"""
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
                f"Prediksi: kualitas air {_label_device(device, kolam)} berpotensi "
                f"{CATEGORY_LABEL.get(a['category'], a['category']).upper()} "
                f"sekitar {jam_wib(a['target_time'])} WIB ({a['horizon_minutes']} menit lagi)."
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
    """Kirim tiap notifikasi ke semua perangkat pemiliknya"""
    for notif in notifications:
        result = await db.execute(select(PushToken).where(PushToken.user_id == notif.user_id))
        tokens = result.scalars().all()
        if not tokens:
            continue
        if notif.source == "sensor":
            title = "Sensor Error" if notif.quality_category in ANOMALY_CATEGORIES else "Sensor Kembali Normal"
        elif notif.parameter:
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
        # kolam_id dibaca app mobile saat push diketuk, untuk membuka detail kolamnya.
        data = {"kolam_id": str(notif.kolam_id)}
        for token in tokens:
            try:
                if send_push(token.fcm_token, title, notif.message, data):
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
    """Pemicu notifikasi untuk klasifikasi, prediksi, dan parameter yang baru
    diterima lewat POST /ingest/quality (dikirim edge, raspi/edge_pipeline.py).
    """
    device_codes = sorted(
        {c.device_code for c in classifications}
        | {p.device_code for p in predictions}
        | ({a.device_code for a in ammonia_risks} if ammonia_risks else set())
    )
    if not device_codes:
        return

    await hapus_notifikasi_lama(db)

    result = await db.execute(
        select(Device, Kolam)
        .join(Kolam, Device.kolam_id == Kolam.id)
        .where(Device.device_code.in_(device_codes))
    )
    claimed = {device.device_code: (device, kolam) for device, kolam in result.all()}

    # Hanya berisi notifikasi yang akan di-push. Notifikasi dari data basi tetap
    # tersimpan (oleh create_*) tapi tidak masuk list ini.
    # ponytail: kalau transisi ke buruk terjadi saat offline dan backlog tiba lebih
    # dulu dari data baru, user tidak dapat push sama sekali (data baru tidak
    # berubah kategori). Upgrade: push ulang status basi terakhir yang masih berlaku.
    new_notifications: list[Notification] = []
    batas = datetime.now(timezone.utc) - PUSH_MAKS_UMUR

    for c in classifications:
        pasangan = claimed.get(c.device_code)
        if pasangan is None:
            continue  # device belum diklaim, atau device_code tidak dikenal
        device, kolam = pasangan
        waktu_data = c.sensor_reading_time or c.time
        notif = await create_classification_notification(
            db, device, kolam, c.quality_category, c.quality_score, waktu_data
        )
        if notif is not None and _masih_segar(waktu_data, batas):
            new_notifications.append(notif)

    predictions_by_device: dict[str, list[dict]] = {}
    for p in predictions:
        if p.predicted_category is None or p.predicted_category not in ANOMALY_CATEGORIES:
            continue
        predictions_by_device.setdefault(p.device_code, []).append(
            {
                "time": p.time,
                "target_time": p.target_time,
                "category": p.predicted_category,
                "horizon_minutes": p.horizon_minutes,
            }
        )

    for device_code, anomalies in predictions_by_device.items():
        pasangan = claimed.get(device_code)
        if pasangan is None:
            continue
        device, kolam = pasangan
        # Umur prediksi dari waktu datanya, bukan target_time (bisa 60 menit ke depan).
        segar = [a for a in anomalies if _masih_segar(a["time"], batas)]
        basi = [a for a in anomalies if not _masih_segar(a["time"], batas)]
        new_notifications.extend(await create_prediction_notifications(db, device, kolam, segar))
        await create_prediction_notifications(db, device, kolam, basi)  # disimpan saja, tanpa push

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
        push_param = _masih_segar(reading_time, batas)

        # 1. Parameter pH
        if ph_val is not None:
            ph_cat = classify_param_value("ph", ph_val)
            notif_ph = await create_parameter_notification(
                db, device, kolam, "ph", ph_cat, PARAM_CONFIG["ph"]["label"], f"nilai {ph_val:.2f} pH", reading_time
            )
            if notif_ph and push_param:
                new_notifications.append(notif_ph)

        # 2. Parameter Suhu
        if temp_val is not None:
            temp_cat = classify_param_value("temperature_c", temp_val)
            notif_temp = await create_parameter_notification(
                db, device, kolam, "temperature_c", temp_cat, PARAM_CONFIG["temperature_c"]["label"], f"nilai {temp_val:.2f} °C", reading_time
            )
            if notif_temp and push_param:
                new_notifications.append(notif_temp)

        # 3. Parameter Salinitas
        if sal_val is not None:
            sal_cat = classify_param_value("salinity_ppt", sal_val)
            notif_sal = await create_parameter_notification(
                db, device, kolam, "salinity_ppt", sal_cat, PARAM_CONFIG["salinity_ppt"]["label"], f"nilai {sal_val:.2f} ppt", reading_time
            )
            if notif_sal and push_param:
                new_notifications.append(notif_sal)

        # 4. Parameter Amonia
        if a_now and a_now.risk_level:
            ammonia_cat = AMMONIA_RISK_TO_CATEGORY.get(a_now.risk_level.lower())
            if ammonia_cat:
                fraksi_str = (
                    f"fraksi NH3 {a_now.fraction_nh3_pct:.2f}%"
                    if a_now.fraction_nh3_pct is not None
                    else a_now.risk_level
                )
                notif_ammonia = await create_parameter_notification(
                    db, device, kolam, "ammonia", ammonia_cat, "risiko amonia", fraksi_str, reading_time
                )
                if notif_ammonia and push_param:
                    new_notifications.append(notif_ammonia)

    if new_notifications:
        await dispatch_push(db, new_notifications)


SENSOR_LABEL: dict[str, str] = {"ph": "pH", "temperature_c": "suhu", "salinity_ppt": "salinitas"}
SENSOR_SEBAB: dict[str, str] = {
    "lonjakan": "Nilainya melonjak tidak wajar dalam waktu singkat.",
    "kosong": "Nilainya tidak terbaca.",
}


async def dispatch_sensor_error(db: AsyncSession, device_codes: list[str]) -> None:
    """Notifikasi sensor error untuk device yang baru mengirim reading
    (POST /ingest/readings). Dibuat hanya saat statusnya berubah: mulai error,
    atau pulih. Deteksinya di services/sensor_status.py.

    Kategori memakai enum yang sudah ada: "buruk" = error, "baik" = pulih.
    Teksnya sengaja tidak memuat kata Aman/Waspada/Bahaya, karena klien
    mewarnai kata-kata itu di dalam pesan.
    """
    result = await db.execute(
        select(Device, Kolam)
        .join(Kolam, Device.kolam_id == Kolam.id)
        .where(Device.device_code.in_(device_codes))
    )
    batas = datetime.now(timezone.utc) - PUSH_MAKS_UMUR
    baru: list[Notification] = []

    for device, kolam in result.all():
        rows = await sensor_status.pembacaan_terakhir(db, device.id)
        if not rows:
            continue
        error = sensor_status.deteksi_sensor_error(rows)
        for parameter, label in SENSOR_LABEL.items():
            category = "buruk" if parameter in error else "baik"
            previous = await _last_parameter_category(db, device.id, parameter, source="sensor")
            if previous == category or (previous is None and category == "baik"):
                continue
            message = (
                f"Sensor {label} {_label_device(device, kolam)} kemungkinan error. "
                f"{SENSOR_SEBAB[error[parameter]]}"
                if parameter in error
                else f"Sensor {label} {_label_device(device, kolam)} kembali normal."
            )
            notif = await _insert_abaikan_duplikat(
                db,
                {
                    "user_id": kolam.owner_user_id,
                    "device_id": device.id,
                    "kolam_id": kolam.id,
                    "source": "sensor",
                    "parameter": parameter,
                    "quality_category": category,
                    "event_time": rows[0].time,
                    "message": message,
                },
            )
            if notif is not None and _masih_segar(rows[0].time, batas):
                baru.append(notif)

    if baru:
        await dispatch_push(db, baru)


async def list_notifications(
    db: AsyncSession,
    user: User,
    unread_only: bool,
    limit: int,
    offset: int = 0,
    source: str | None = None,
    device_id: int | None = None,
) -> list[Notification]:
    """Notifikasi milik `user`diurutkan dari terbaru dulu dan satu halaman cuma 20 baris. `offset` untuk "muat lebih banyak" """
    # Batas umur ikut disaring di sini: hapus_notifikasi_lama menyisakan satu
    # baris tua per device sebagai acuan status, dan baris itu tidak untuk ditampilkan.
    stmt = select(Notification).where(
        Notification.user_id == user.id,
        Notification.created_at >= datetime.now(timezone.utc) - NOTIF_MAKS_UMUR,
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    if source is not None:
        stmt = stmt.where(Notification.source == source)
    # Sudah dibatasi user_id di atas, jadi device milik orang lain cuma menghasilkan list kosong.
    if device_id is not None:
        stmt = stmt.where(Notification.device_id == device_id)
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

async def mark_all_read(db: AsyncSession, user: User) -> int:
    """Tandai semua notifikasi belum dibaca milik `user`. Kembalikan jumlah baris yang berubah."""
    result = await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return result.rowcount

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
    """Hapus semua notifikasi milik `user`. Kembalikan jumlah baris terhapus."""
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

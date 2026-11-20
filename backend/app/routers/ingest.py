"""POST endpoint gateway (Raspberry Pi). Semua endpoint di sini wajib X-API-Key."""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_gateway_api_key
from app.db.session import AsyncSessionLocal, get_db
from app.schemas.fuzzy import QualityIngestIn, QualityIngestResultOut
from app.schemas.sensor_reading import IngestResultOut, RestartIn, SensorReadingBatchIn
from app.services import ingest_service, notification_service, quality_ingest_service

logger = logging.getLogger("app.routers.ingest")

router = APIRouter(
    prefix="/ingest",
    tags=["ingest"],
    dependencies=[Depends(verify_gateway_api_key)],
)


async def _latar(fn, *args) -> None:
    """Jalankan notifikasi sesudah respons terkirim, dengan session sendiri.

    Data sudah tersimpan sebelum ini dipanggil. Notifikasi (query per baris +
    push FCM) bisa makan belasan detik untuk batch buffer yang besar; kalau
    ditunggu dulu, forwarder di Raspi kena timeout, menganggap kirimannya
    gagal, lalu mengirim ulang data yang sebenarnya sudah masuk. Session
    request sudah ditutup saat background task jalan, jadi buka yang baru.
    Gagal di sini cukup dicatat: gateway sudah dapat 201.
    """
    async with AsyncSessionLocal() as db:
        try:
            await fn(db, *args)
        except Exception:
            logger.exception("Gagal memproses notifikasi %s", fn.__name__)


@router.post("/readings", response_model=IngestResultOut, status_code=201)
async def ingest_readings(
    payload: SensorReadingBatchIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> IngestResultOut:
    """Simpan batch reading sensor mentah; duplikat & device asing dilaporkan balik."""
    inserted, unknown, skipped_duplicates = await ingest_service.ingest_readings(
        db, payload.readings
    )
    background.add_task(
        _latar,
        notification_service.dispatch_sensor_error,
        sorted({r.device_code for r in payload.readings}),
    )
    return IngestResultOut(
        received=len(payload.readings),
        inserted=inserted,
        unknown_device_codes=unknown,
        skipped_duplicates=skipped_duplicates,
    )

@router.post("/restart", status_code=201)
async def ingest_restart(
    payload: RestartIn, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
) -> dict:
    """Laporan ESP restart, diteruskan Raspi dari baris boot UART."""
    device, baru = await ingest_service.ingest_restart(db, payload)
    if device is None:
        raise HTTPException(status_code=404, detail="Device tidak dikenal")
    if baru:
        # Laporan yang dikirim ulang (retry) tidak dinotifikasi dua kali.
        background.add_task(
            _latar,
            notification_service.dispatch_restart,
            device.id,
            payload.time,
            payload.reset_reason,
        )
    return {"recorded": baru}


@router.post("/quality", response_model=QualityIngestResultOut, status_code=201)
async def ingest_quality(
    payload: QualityIngestIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> QualityIngestResultOut:
    """Simpan klasifikasi, prediksi, dan risiko amonia yang dihitung edge
    (raspi/edge_pipeline.py). Backend tidak menghitung ulang, cuma menyimpan
    lalu memutuskan notifikasi dari kategori yang diterima."""
    inserted_c, unknown_c, skipped_c = await quality_ingest_service.ingest_classifications(
        db, payload.classifications
    )
    inserted_p, unknown_p, skipped_p = await quality_ingest_service.ingest_predictions(
        db, payload.predictions
    )
    inserted_a, unknown_a, skipped_a = await quality_ingest_service.ingest_ammonia_risks(
        db, payload.ammonia_risks
    )

    # Notifikasi dipicu dari kategori yang baru diterima, sesudah respons.
    background.add_task(
        _latar,
        notification_service.dispatch_from_quality_ingest,
        payload.classifications,
        payload.predictions,
        payload.ammonia_risks,
    )

    return QualityIngestResultOut(
        received_classifications=len(payload.classifications),
        received_predictions=len(payload.predictions),
        received_ammonia_risks=len(payload.ammonia_risks),
        inserted_classifications=inserted_c,
        inserted_predictions=inserted_p,
        inserted_ammonia_risks=inserted_a,
        unknown_device_codes=sorted(set(unknown_c) | set(unknown_p) | set(unknown_a)),
        skipped_duplicate_classifications=skipped_c,
        skipped_duplicate_predictions=skipped_p,
        skipped_duplicate_ammonia_risks=skipped_a,
    )

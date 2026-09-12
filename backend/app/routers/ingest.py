"""POST endpoint gateway (Raspberry Pi). Semua endpoint di sini wajib X-API-Key."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_gateway_api_key
from app.db.session import get_db
from app.schemas.fuzzy import QualityIngestIn, QualityIngestResultOut
from app.schemas.sensor_reading import IngestResultOut, SensorReadingBatchIn
from app.services import ingest_service, notification_service, quality_ingest_service

router = APIRouter(
    prefix="/ingest",
    tags=["ingest"],
    dependencies=[Depends(verify_gateway_api_key)],
)


@router.post("/readings", response_model=IngestResultOut, status_code=201)
async def ingest_readings(
    payload: SensorReadingBatchIn,
    db: AsyncSession = Depends(get_db),
) -> IngestResultOut:
    """Simpan batch reading sensor mentah; duplikat & device asing dilaporkan balik."""
    inserted, unknown, skipped_duplicates = await ingest_service.ingest_readings(
        db, payload.readings
    )
    return IngestResultOut(
        received=len(payload.readings),
        inserted=inserted,
        unknown_device_codes=unknown,
        skipped_duplicates=skipped_duplicates,
    )


@router.post("/quality", response_model=QualityIngestResultOut, status_code=201)
async def ingest_quality(
    payload: QualityIngestIn,
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

    # Notifikasi (in-app + push) dipicu dari kategori yang baru diterima, lihat
    # dispatch_from_quality_ingest.
    await notification_service.dispatch_from_quality_ingest(
        db, payload.classifications, payload.predictions, payload.ammonia_risks
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

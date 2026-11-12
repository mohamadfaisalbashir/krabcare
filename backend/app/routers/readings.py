"""GET endpoint, histori reading sensor, difilter waktu & dibatasi hak akses."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import DataAccessScope, get_data_access_scope
from app.core.water_thresholds import ParamKey, StatusFilter
from app.db.session import get_db
from app.schemas.sensor_reading import SensorReadingOut
from app.services import reading_service, sensor_status

router = APIRouter(prefix="/readings", tags=["readings"])


@router.get("/sensor-status", response_model=dict[str, str])
async def sensor_status_device(
    device_id: int,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Parameter yang sensornya terindikasi error -> "lonjakan" | "kosong".

    Objek kosong berarti semua sensor device ini sehat. Aturannya di
    services/sensor_status.py; web dan mobile cuma menampilkan hasilnya.
    """
    if scope.allowed_device_ids is not None and device_id not in scope.allowed_device_ids:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Device tidak ditemukan")
    return sensor_status.deteksi_sensor_error(await sensor_status.pembacaan_terakhir(db, device_id))


@router.get("", response_model=list[SensorReadingOut])
async def list_readings(
    device_id: int | None = None,
    device_code: str | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    limit: int = Query(default=100, gt=0, le=1000),
    offset: int = Query(default=0, ge=0),
    param: ParamKey | None = None,
    status: StatusFilter | None = None,
    interval_minutes: int | None = Query(
        default=None, gt=0, le=1440, description="Satu reading per device per N menit"
    ),
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[SensorReadingOut]:
    """Histori reading (terbaru dulu); Decimal dari DB di-cast float untuk JSON.

    `param` + `limit`/`offset` dipakai halaman Log Historis: satu halaman satu
    parameter, 25 baris, diiris di database. Respons list polos, bukan
    {items, total}; "masih ada lagi" dibaca dari jumlah baris yang sama dengan
    limit.
    """
    if status is not None and param is None:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Filter `status` butuh `param`. Tanpa itu kolom mana yang dinilai tidak jelas.",
        )

    rows = await reading_service.get_readings(
        db,
        device_id,
        device_code,
        start_time,
        end_time,
        limit,
        scope.allowed_device_ids,
        param=param,
        status=status,
        offset=offset,
        interval_minutes=interval_minutes,
    )
    return [
        SensorReadingOut(
            device_id=reading.device_id,
            device_code=code,
            time=reading.time,
            received_at=reading.received_at,
            ph=float(reading.ph) if reading.ph is not None else None,
            temperature_c=float(reading.temperature_c) if reading.temperature_c is not None else None,
            salinity_ppt=float(reading.salinity_ppt) if reading.salinity_ppt is not None else None,
        )
        for reading, code in rows
    ]

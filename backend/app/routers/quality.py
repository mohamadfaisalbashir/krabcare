"""GET endpoint, klasifikasi (Mamdani), prediksi (FTS), & risiko amonia."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import DataAccessScope, get_data_access_scope
from app.db.session import get_db
from app.schemas.ammonia import AmmoniaRiskLogOut, AmmoniaRiskOut, DeviceAmmoniaOut
from app.schemas.fuzzy import (
    DevicePredictionsOut,
    FuzzyClassificationOut,
    FuzzyPredictionOut,
    LatestQualityOut,
)
from app.services import ammonia_service, quality_service

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/latest", response_model=list[LatestQualityOut])
async def latest_quality(
    device_id: int | None = None,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[LatestQualityOut]:
    """Status terkini per device: satu klasifikasi + satu prediksi terbaru."""
    items = await quality_service.get_latest_quality(db, device_id, scope.allowed_device_ids)
    return [
        LatestQualityOut(
            device_id=item["device_id"],
            device_code=item["device_code"],
            classification=(
                FuzzyClassificationOut.model_validate(item["classification"])
                if item["classification"]
                else None
            ),
            prediction=(
                FuzzyPredictionOut.model_validate(item["prediction"])
                if item["prediction"]
                else None
            ),
        )
        for item in items
    ]


@router.get("/predictions", response_model=list[DevicePredictionsOut])
async def list_prediction_horizons(
    device_id: int | None = None,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[DevicePredictionsOut]:
    """Seluruh horizon (jam+1..jam+N) dari run forecast terakhir, bahan grafik."""
    items = await quality_service.get_prediction_horizons(
        db, device_id, scope.allowed_device_ids
    )
    return [
        DevicePredictionsOut(
            device_id=item["device_id"],
            device_code=item["device_code"],
            predictions=[FuzzyPredictionOut.model_validate(p) for p in item["predictions"]],
        )
        for item in items
    ]


@router.get("/ammonia-risk", response_model=list[DeviceAmmoniaOut])
async def latest_ammonia_risk(
    device_id: int | None = None,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[DeviceAmmoniaOut]:
    """Indeks risiko toksisitas amonia per device: terukur terkini + ramalan.

    Bukan konsentrasi mg/L, yang dikembalikan adalah FRAKSI TAN yang berbentuk
    NH3 toksik pada pH/suhu/salinitas saat itu. Lihat field `disclaimer`.

    Barisnya dibaca dari tabel `ammonia_risks` (ditulis saat ingest & saat siklus
    forecast), bukan dihitung ulang di sini, supaya angka yang tampil di kartu
    persis sama dengan yang ada di log historis.
    """
    items = await ammonia_service.get_latest_and_forecast(
        db, device_id, scope.allowed_device_ids
    )
    return [
        DeviceAmmoniaOut(
            device_id=item["device_id"],
            device_code=item["device_code"],
            current=(
                AmmoniaRiskOut.model_validate(item["current"]) if item["current"] else None
            ),
            forecast=[AmmoniaRiskOut.model_validate(f) for f in item["forecast"]],
        )
        for item in items
    ]


@router.get("/ammonia-risk/history", response_model=list[AmmoniaRiskLogOut])
async def ammonia_risk_history(
    device_id: int | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    risk_level: str | None = Query(default=None, pattern="^(normal|perhatian|berbahaya)$"),
    only_measured: bool = Query(
        default=False, description="True = hanya baris terukur (horizon 0), tanpa ramalan"
    ),
    limit: int = Query(default=25, gt=0, le=1000),
    offset: int = Query(default=0, ge=0),
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[AmmoniaRiskLogOut]:
    """Log historis risiko amonia (terbaru dulu), pola sama dengan /readings.

    Respons list polos tanpa `total`, "masih ada lagi" dibaca dari jumlah baris
    == limit, sama seperti endpoint readings.
    """
    rows = await ammonia_service.get_history(
        db,
        device_id,
        start_time,
        end_time,
        risk_level,
        only_measured,
        limit,
        offset,
        scope.allowed_device_ids,
    )
    return [
        AmmoniaRiskLogOut(
            device_id=risk.device_id,
            device_code=code,
            time=risk.time,
            target_time=risk.target_time,
            horizon_minutes=risk.horizon_minutes,
            fraction_nh3_pct=(
                float(risk.fraction_nh3_pct) if risk.fraction_nh3_pct is not None else None
            ),
            risk_level=risk.risk_level,
            in_valid_range=risk.in_valid_range,
            input_ph=float(risk.input_ph) if risk.input_ph is not None else None,
            input_temperature_c=(
                float(risk.input_temperature_c) if risk.input_temperature_c is not None else None
            ),
            input_salinity_ppt=(
                float(risk.input_salinity_ppt) if risk.input_salinity_ppt is not None else None
            ),
            model_version=risk.model_version,
        )
        for risk, code in rows
    ]

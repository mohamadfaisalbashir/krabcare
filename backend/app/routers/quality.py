"""GET endpoint — hasil klasifikasi (fuzzy logic) & prediksi (fuzzy time series) kualitas air."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import DataAccessScope, get_data_access_scope
from app.db.session import get_db
from app.schemas.fuzzy import (
    DevicePredictionsOut,
    FuzzyClassificationOut,
    FuzzyPredictionOut,
    LatestQualityOut,
)
from app.services import quality_service

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/latest", response_model=list[LatestQualityOut])
async def latest_quality(
    device_id: int | None = None,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[LatestQualityOut]:
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
async def latest_predictions_full(
    device_id: int | None = None,
    scope: DataAccessScope = Depends(get_data_access_scope),
    db: AsyncSession = Depends(get_db),
) -> list[DevicePredictionsOut]:
    items = await quality_service.get_latest_predictions_full(
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

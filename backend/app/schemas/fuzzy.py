from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.enums import WaterQualityCategory
from app.schemas.sensor_reading import SkippedDuplicateOut


class FuzzyClassificationOut(BaseModel):
    time: datetime
    quality_score: float
    quality_category: WaterQualityCategory
    membership_degrees: dict | None = None
    model_version: str

    model_config = {"from_attributes": True}


class FuzzyPredictionOut(BaseModel):
    time: datetime
    target_time: datetime
    horizon_minutes: int
    predicted_quality_score: float | None
    predicted_category: WaterQualityCategory | None
    model_version: str

    model_config = {"from_attributes": True}


class LatestQualityOut(BaseModel):
    """Hasil klasifikasi (fuzzy logic) & prediksi (fuzzy time series) terbaru untuk satu device."""

    device_id: int
    device_code: str | None
    classification: FuzzyClassificationOut | None = None
    prediction: FuzzyPredictionOut | None = None


class DevicePredictionsOut(BaseModel):
    """Seluruh horizon (jam+1 s.d. jam+N) dari run prediksi TERAKHIR satu device."""

    device_id: int
    device_code: str | None
    predictions: list[FuzzyPredictionOut]


class FuzzyClassificationIn(BaseModel):
    """Payload ingest hasil klasifikasi fuzzy logic (Mamdani) dari pipeline ML."""

    device_code: str
    time: datetime
    sensor_reading_time: datetime | None = None
    quality_score: float = Field(ge=0, le=100)
    quality_category: WaterQualityCategory
    membership_degrees: dict | None = None
    model_version: str = "v1"


class FuzzyPredictionIn(BaseModel):
    """Payload ingest hasil prediksi fuzzy time series dari pipeline ML."""

    device_code: str
    time: datetime
    target_time: datetime
    horizon_minutes: int = Field(gt=0)
    predicted_quality_score: float | None = Field(default=None, ge=0, le=100)
    predicted_category: WaterQualityCategory | None = None
    model_version: str = "v1"


class QualityIngestIn(BaseModel):
    """Payload batch ingest — bisa berisi hasil klasifikasi, prediksi, atau keduanya sekaligus."""

    classifications: list[FuzzyClassificationIn] = Field(default_factory=list)
    predictions: list[FuzzyPredictionIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "QualityIngestIn":
        if not self.classifications and not self.predictions:
            raise ValueError("Minimal harus ada satu classification atau prediction")
        return self


class QualityIngestResultOut(BaseModel):
    received_classifications: int
    received_predictions: int
    inserted_classifications: int
    inserted_predictions: int
    unknown_device_codes: list[str]
    skipped_duplicate_classifications: list[SkippedDuplicateOut] = []
    skipped_duplicate_predictions: list[SkippedDuplicateOut] = []

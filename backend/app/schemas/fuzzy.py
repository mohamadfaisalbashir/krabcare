"""Schema hasil ML: klasifikasi Mamdani & prediksi FTS (ingest + response)."""

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.enums import WaterQualityCategory
from app.schemas.ammonia import AmmoniaRiskIn
from app.schemas.sensor_reading import SkippedDuplicateOut


class FuzzyClassificationOut(BaseModel):
    """Satu hasil klasifikasi; membership_degrees = rincian per parameter."""

    time: datetime
    quality_score: float
    quality_category: WaterQualityCategory
    membership_degrees: dict | None = None
    model_version: str

    model_config = {"from_attributes": True}


class FuzzyPredictionOut(BaseModel):
    """Satu horizon prediksi: `time` = kapan forecast dibuat, `target_time` = sasarannya."""

    time: datetime
    target_time: datetime
    horizon_minutes: int
    predicted_quality_score: float | None
    predicted_category: WaterQualityCategory | None
    predicted_ph: float | None = None
    predicted_temperature_c: float | None = None
    predicted_salinity_ppt: float | None = None
    model_version: str

    model_config = {"from_attributes": True}


class LatestQualityOut(BaseModel):
    """Status terkini satu device: klasifikasi + prediksi terbaru (bisa None)."""

    device_id: int
    device_code: str | None
    classification: FuzzyClassificationOut | None = None
    prediction: FuzzyPredictionOut | None = None


class DevicePredictionsOut(BaseModel):
    """Seluruh horizon (jam+1..jam+N) dari run prediksi TERAKHIR satu device."""

    device_id: int
    device_code: str | None
    predictions: list[FuzzyPredictionOut]


class FuzzyClassificationIn(BaseModel):
    """Payload ingest satu hasil klasifikasi Mamdani."""

    device_code: str
    time: datetime
    sensor_reading_time: datetime | None = None
    quality_score: float = Field(ge=0, le=100)
    quality_category: WaterQualityCategory
    membership_degrees: dict | None = None
    model_version: str = "v1"


class FuzzyPredictionIn(BaseModel):
    """Payload ingest satu horizon prediksi FTS."""

    device_code: str
    time: datetime
    target_time: datetime
    horizon_minutes: int = Field(gt=0)
    predicted_quality_score: float | None = Field(default=None, ge=0, le=100)
    predicted_category: WaterQualityCategory | None = None
    # Ramalan per parameter — opsional supaya payload lama tetap diterima.
    predicted_ph: float | None = None
    predicted_temperature_c: float | None = None
    predicted_salinity_ppt: float | None = None
    model_version: str = "v1"


class QualityIngestIn(BaseModel):
    """Batch ingest dari edge (Raspi, raspi/edge_pipeline.py): klasifikasi, prediksi,
    risiko amonia — boleh isi salah satu, sebagian, atau semuanya."""

    classifications: list[FuzzyClassificationIn] = Field(default_factory=list)
    predictions: list[FuzzyPredictionIn] = Field(default_factory=list)
    ammonia_risks: list[AmmoniaRiskIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "QualityIngestIn":
        """Tolak payload yang semuanya kosong (kalau lolos, request jadi no-op diam)."""
        if not self.classifications and not self.predictions and not self.ammonia_risks:
            raise ValueError("Minimal harus ada satu classification, prediction, atau ammonia_risk")
        return self


class QualityIngestResultOut(BaseModel):
    """Ringkasan ingest kualitas air — dipisah per jenis karena semuanya masuk satu request."""

    received_classifications: int
    received_predictions: int
    received_ammonia_risks: int
    inserted_classifications: int
    inserted_predictions: int
    inserted_ammonia_risks: int
    unknown_device_codes: list[str]
    skipped_duplicate_classifications: list[SkippedDuplicateOut] = []
    skipped_duplicate_predictions: list[SkippedDuplicateOut] = []
    skipped_duplicate_ammonia_risks: list[SkippedDuplicateOut] = []

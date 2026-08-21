from datetime import datetime

from pydantic import BaseModel, Field


class SensorReadingIn(BaseModel):
    """Satu pembacaan sensor dari satu slave node (dikirim gateway per level/tingkat)."""

    device_code: str
    time: datetime
    ph: float | None = Field(default=None, ge=0, le=14)
    temperature_c: float | None = None
    salinity_ppt: float | None = Field(default=None, ge=0)


class SensorReadingBatchIn(BaseModel):
    """Payload ingest dari gateway — satu push bisa berisi banyak level sekaligus."""

    readings: list[SensorReadingIn] = Field(min_length=1)


class SkippedDuplicateOut(BaseModel):
    """Baris yang di-skip karena kunci uniknya sudah pernah masuk.

    `horizon_minutes` cuma relevan untuk fuzzy_predictions (kunci uniknya
    device_id+time+horizon_minutes, karena satu waktu forecast bisa punya banyak
    horizon sekaligus) — None untuk sensor readings & fuzzy classifications.
    """

    device_code: str
    time: datetime
    horizon_minutes: int | None = None


class IngestResultOut(BaseModel):
    received: int
    inserted: int
    unknown_device_codes: list[str]
    skipped_duplicates: list[SkippedDuplicateOut] = []


class SensorReadingOut(BaseModel):
    device_id: int
    device_code: str
    time: datetime
    ph: float | None
    temperature_c: float | None
    salinity_ppt: float | None

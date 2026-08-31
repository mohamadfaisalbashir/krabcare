"""Schema kolam (unit budidaya / rak vertikal)."""

from datetime import datetime

from pydantic import BaseModel, Field


class KolamCreateIn(BaseModel):
    nama: str = Field(min_length=1)
    lokasi: str | None = None


class KolamUpdateIn(BaseModel):
    nama: str = Field(min_length=1)
    lokasi: str | None = None


class KolamOut(BaseModel):
    id: int
    nama: str
    lokasi: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

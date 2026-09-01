"""Schema kolam (unit budidaya / rak vertikal)."""

from datetime import datetime

from pydantic import BaseModel, Field


class KolamCreateIn(BaseModel):
    nama: str = Field(min_length=1)


class KolamUpdateIn(BaseModel):
    nama: str = Field(min_length=1)


class KolamOut(BaseModel):
    id: int
    nama: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

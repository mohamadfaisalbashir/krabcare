"""Schema notifikasi in-app & pendaftaran token push."""

from datetime import datetime

from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: int
    device_id: int
    device_code: str | None
    kolam_id: int
    source: str
    quality_category: str
    event_time: datetime
    message: str
    is_read: bool
    created_at: datetime


class PushTokenRegisterIn(BaseModel):
    """platform dibatasi pattern supaya tidak ada nilai bebas masuk DB."""

    fcm_token: str = Field(min_length=1)
    platform: str = Field(pattern=r"^(android|ios|web)$")

"""Schema device (node IoT) untuk response topologi kolam."""

from datetime import datetime

from pydantic import BaseModel

from app.models.enums import DeviceType


class DeviceOut(BaseModel):
    """Satu node dalam kolam; parent_device_id memetakan slave ke master-nya."""

    id: int
    device_code: str
    device_type: DeviceType
    level_number: int | None
    rack_label: str | None
    parent_device_id: int | None
    is_active: bool
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}

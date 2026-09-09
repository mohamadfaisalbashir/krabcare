"""Schema device (node IoT) untuk response topologi kolam & kelola admin."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import DeviceType


class DeviceCreateIn(BaseModel):
    """Payload admin menambah device baru, pengganti INSERT manual ke DB.

    device_code HARUS persis sama dengan yang dikirim firmware (case-sensitive,
    lihat README), device baru lahir belum terklaim kolam mana pun
    (kolam_id null), baru terhubung lewat POST /kolam/:id/devices/:code.
    """

    device_code: str = Field(min_length=1, max_length=100)
    device_type: DeviceType = DeviceType.SLAVE_NODE
    rack_label: str | None = None
    parent_device_id: int | None = None


class DeviceOut(BaseModel):
    """Satu node dalam kolam; parent_device_id memetakan slave ke master-nya."""

    id: int
    device_code: str
    device_type: DeviceType
    rack_label: str | None
    parent_device_id: int | None
    is_active: bool
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}


class DeviceAdminOut(DeviceOut):
    """DeviceOut + status klaim, dipakai panel admin (GET /devices) supaya
    device yang sudah diklaim dan yang belum bisa ditampilkan dalam satu list."""

    kolam_id: int | None
    kolam_nama: str | None
    owner_nama: str | None = None


class DeviceClaimIn(BaseModel):
    """Payload admin memasang device ke kolam."""

    kolam_id: int


class TargetKolamOut(BaseModel):
    """Daftar kolam tujuan yang bisa dipilih admin untuk memasangkan device."""

    id: int
    nama: str
    owner_name: str
    owner_email: str
    current_device_id: int | None = None
    current_device_code: str | None = None

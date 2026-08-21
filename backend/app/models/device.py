from datetime import datetime

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import DeviceType


class Device(Base):
    """Node/perangkat IoT: slave node (ESP32C3 per tingkat), master node (ESP32), atau gateway (Raspberry Pi)."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_code: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    device_type: Mapped[DeviceType] = mapped_column(
        SAEnum(
            DeviceType,
            name="device_type_check",
            native_enum=False,
            validate_strings=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=DeviceType.SLAVE_NODE,
        nullable=False,
    )
    level_number: Mapped[int | None] = mapped_column(SmallInteger)
    rack_label: Mapped[str | None] = mapped_column(Text)
    parent_device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL")
    )
    kolam_id: Mapped[int | None] = mapped_column(ForeignKey("kolam.id", ondelete="SET NULL"))
    location_note: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    last_seen_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    parent: Mapped["Device | None"] = relationship(remote_side=[id])

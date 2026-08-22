from datetime import datetime

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import WaterQualityCategory


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    kolam_id: Mapped[int] = mapped_column(ForeignKey("kolam.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    quality_category: Mapped[WaterQualityCategory] = mapped_column(
        SAEnum(
            WaterQualityCategory,
            name="water_quality_category",
            create_type=False,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
    )
    event_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_pushed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

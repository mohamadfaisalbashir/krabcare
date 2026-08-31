from datetime import datetime

from sqlalchemy import JSON, TIMESTAMP, ForeignKey, Numeric, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import WaterQualityCategory


class FuzzyClassification(Base):
    """Hasil klasifikasi fuzzy Mamdani atas reading terbaru. Hypertable, partisi kolom `time`."""

    __tablename__ = "fuzzy_classifications"

    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    sensor_reading_time: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    quality_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    quality_category: Mapped[WaterQualityCategory] = mapped_column(
        SAEnum(
            WaterQualityCategory,
            name="water_quality_category",
            create_type=False,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        nullable=False,
    )
    membership_degrees: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB, "postgresql"))
    model_version: Mapped[str] = mapped_column(Text, default="v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

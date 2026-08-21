from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Numeric, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import WaterQualityCategory


class FuzzyPrediction(Base):
    """Hasil prediksi tren kualitas air (fuzzy time series). Hypertable, partisi kolom `time` (waktu prediksi dibuat).

    PK (device_id, time, horizon_minutes) — bukan cuma (device_id, time) — karena
    satu waktu forecast (`time`) yang sama bisa menghasilkan banyak prediksi
    sekaligus untuk horizon berbeda (mis. multi-step forecast jam+1 s.d. jam+6).
    """

    __tablename__ = "fuzzy_predictions"

    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    horizon_minutes: Mapped[int] = mapped_column(primary_key=True)
    target_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    predicted_quality_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    predicted_category: Mapped[WaterQualityCategory | None] = mapped_column(
        SAEnum(
            WaterQualityCategory,
            name="water_quality_category",
            create_type=False,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        )
    )
    model_version: Mapped[str] = mapped_column(Text, default="v1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

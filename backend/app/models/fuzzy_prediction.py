from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Numeric, Text
from sqlalchemy import text as sa_text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import WaterQualityCategory


class FuzzyPrediction(Base):
    """Hasil prediksi FTS. Hypertable, partisi `time` (= kapan forecast dijalankan).

    PK ikut horizon_minutes karena satu run forecast menghasilkan banyak baris
    sekaligus (jam+1 s.d. jam+6) dengan `time` yang sama.
    """

    __tablename__ = "fuzzy_predictions"
    # Lihat catatan index di device.py. Index *_time_idx sengaja TIDAK didaftarkan:
    # itu bikinan create_hypertable(), disaring include_object di alembic/env.py.
    __table_args__ = (
        Index("idx_fuzzy_predictions_device_target", "device_id", sa_text("target_time DESC")),
    )

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
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

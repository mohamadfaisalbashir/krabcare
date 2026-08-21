from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SensorReading(Base):
    """Data mentah sensor (pH, suhu, salinitas) per level. Hypertable TimescaleDB, partisi kolom `time`."""

    __tablename__ = "sensor_readings"

    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    ph: Mapped[float | None] = mapped_column(Numeric(4, 2))
    temperature_c: Mapped[float | None] = mapped_column(Numeric(4, 1))
    salinity_ppt: Mapped[float | None] = mapped_column(Numeric(5, 2))
    received_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

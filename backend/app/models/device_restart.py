from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class DeviceRestart(Base):
    """Satu kali ESP restart, dilaporkan Raspi dari baris boot UART."""

    __tablename__ = "device_restarts"

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    #: Jam Raspi saat baris boot diterima.
    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    #: Kode penyebab dari ESP, mis. "WDT".
    reset_reason: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

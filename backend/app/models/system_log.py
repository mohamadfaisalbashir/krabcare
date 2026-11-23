from datetime import datetime

from sqlalchemy import TIMESTAMP, BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SystemLog(Base):
    """Log permanen kejadian sistem untuk tab "Sistem" di Log Historis.

    Terpisah dari notifications karena notifikasi dihapus setelah 7 hari dan
    bisa dihapus user. Satu baris = satu perubahan status, bukan satu menit:
    `sensor_error` saat sensor mulai tidak terbaca, `sensor_pulih` saat terbaca
    lagi, `restart` tiap ESP restart.
    """

    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    #: "sensor_error" | "sensor_pulih" | "restart" (CHECK di migrasi).
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    #: ph | temperature_c | salinity_ppt untuk kejadian sensor, NULL untuk restart.
    parameter: Mapped[str | None] = mapped_column(Text)
    #: reset_reason dari ESP untuk restart, mis. "POWERON".
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

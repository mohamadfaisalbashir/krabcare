from datetime import datetime

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, Numeric, Text
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class AmmoniaRisk(Base):
    """Indeks risiko toksisitas amonia: fraksi NH3 tak terionisasi, bukan mg/L.

    Parameter mentahnya dari sensor pH/suhu/salinitas, perhitungannya di
    app/services/ammonia_speciation.py. Disimpan supaya ada log historisnya.

    `horizon_minutes` membedakan dua isi tabel ini:
      0  = kondisi terukur, satu baris per sensor_readings
      >0 = ramalan, satu baris per horizon FTS

    Hypertable, partisi `time`. Index *_time_idx tidak didaftarkan di sini:
    itu bikinan create_hypertable(), disaring include_object di alembic/env.py.
    """

    __tablename__ = "ammonia_risks"
    __table_args__ = (
        Index("idx_ammonia_risks_device_target", "device_id", sa_text("target_time DESC")),
    )

    time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    horizon_minutes: Mapped[int] = mapped_column(primary_key=True)
    target_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

    # Input apa adanya ikut disimpan supaya satu baris risiko bisa ditelusuri
    # balik ke kondisi asalnya: reading bisa sudah kena retensi, dan baris
    # ramalan tidak punya reading padanannya. Presisi disamakan dengan
    # sensor_readings supaya pembulatannya tidak beda.
    input_ph: Mapped[float | None] = mapped_column(Numeric(4, 2))
    input_temperature_c: Mapped[float | None] = mapped_column(Numeric(4, 1))
    input_salinity_ppt: Mapped[float | None] = mapped_column(Numeric(5, 2))

    fraction_nh3_pct: Mapped[float | None] = mapped_column(Numeric(6, 3))
    pka: Mapped[float | None] = mapped_column(Numeric(6, 4))
    # Text, bukan enum native: "normal"/"perhatian"/"berbahaya" berasal dari
    # ambang ilustratif yang boleh berubah (ammonia_speciation.classify_risk),
    # dan tipe enum PostgreSQL mahal diubah.
    risk_level: Mapped[str | None] = mapped_column(Text)
    in_valid_range: Mapped[bool] = mapped_column(Boolean, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, default="speciation-bb78", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

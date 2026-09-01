from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Kolam(Base):
    """Unit budidaya (satu rak vertikal = satu master node + slave node di bawahnya), dimiliki satu user."""

    __tablename__ = "kolam"
    # Lihat catatan index di device.py.
    __table_args__ = (Index("idx_kolam_owner", "owner_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    nama: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

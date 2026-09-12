from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class PushToken(Base):
    """Token FCM per perangkat mobile milik user, tujuan dispatch push."""

    __tablename__ = "push_tokens"
    # Lihat catatan index di device.py.
    __table_args__ = (Index("idx_push_tokens_user", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    fcm_token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    # NOT NULL: penulis satu-satunya (notification_service) selalu isi func.now().
    last_used_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

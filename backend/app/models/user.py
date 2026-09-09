from datetime import datetime

from sqlalchemy import TIMESTAMP, Boolean, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.enums import UserRole


class User(Base):
    """Akun pengguna dashboard web (admin/pemilik) & mobile (operator lapangan)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    nama: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(
            UserRole,
            name="role_check",
            native_enum=False,
            validate_strings=True,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=UserRole.OPERATOR,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token_hash: Mapped[str | None] = mapped_column(Text)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    # Verifikasi email saat daftar. Polanya sama dengan reset_token_* di atas:
    # yang disimpan cuma sha256 token-nya, ada kedaluwarsa, dan dihanguskan
    # setelah dipakai. NULL pada email_verified_at = belum terverifikasi.
    verify_token_hash: Mapped[str | None] = mapped_column(Text)
    verify_token_expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    email_verified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

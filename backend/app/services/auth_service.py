"""Registrasi, login, profil, ganti & reset password user."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas.user import PasswordChangeIn, UserLoginIn, UserProfileUpdateIn, UserRegisterIn


class AuthError(Exception):
    """Error domain auth — router menerjemahkannya jadi 400/401."""


async def register_user(db: AsyncSession, payload: UserRegisterIn) -> User:
    """Buat user baru; email wajib unik."""
    existing = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise AuthError("Email sudah terdaftar")

    user = User(
        email=payload.email,
        password_hash=await hash_password(payload.password),
        nama=payload.nama,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, payload: UserLoginIn) -> str:
    """Cek kredensial, balas JWT. Pesan error sengaja tidak membedakan email vs password."""
    result = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    user = result.scalar_one_or_none()
    if (
        user is None
        or not user.is_active
        or not await verify_password(payload.password, user.password_hash)
    ):
        raise AuthError("Email atau password salah")
    return create_access_token(user.id)


async def update_profile(db: AsyncSession, user: User, payload: UserProfileUpdateIn) -> User:
    """Ubah nama tampilan user."""
    user.nama = payload.nama
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(db: AsyncSession, user: User, payload: PasswordChangeIn) -> None:
    """Ganti password; wajib lolos verifikasi password lama."""
    if not await verify_password(payload.old_password, user.password_hash):
        raise AuthError("Password lama salah")
    user.password_hash = await hash_password(payload.new_password)
    await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Terbitkan token reset & kirim linknya. Yang disimpan cuma hash token-nya.

    Selalu "sukses" dari sisi pemanggil — email hanya benar-benar dikirim kalau
    akunnya ada & aktif (anti-enumeration).
    """
    result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return

    raw_token = secrets.token_urlsafe(32)
    user.reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
    )
    await db.commit()

    reset_link = f"{settings.FRONTEND_RESET_PASSWORD_URL}?token={raw_token}"
    await send_email(
        user.email,
        "Reset Password",
        f"Halo {user.nama},\n\nKlik link berikut untuk reset password (berlaku "
        f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} menit):\n{reset_link}\n\n"
        "Kalau kamu tidak meminta ini, abaikan email ini.",
    )


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    """Set password baru kalau token cocok & belum kedaluwarsa; token lalu dihanguskan."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(select(User).where(User.reset_token_hash == token_hash))
    user = result.scalar_one_or_none()

    if user is None or user.reset_token_expires_at is None:
        raise AuthError("Token reset tidak valid")
    if user.reset_token_expires_at < datetime.now(timezone.utc):
        raise AuthError("Token reset sudah kedaluwarsa")

    user.password_hash = await hash_password(new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    await db.commit()

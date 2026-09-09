"""Registrasi, login, profil, ganti & reset password, verifikasi email user."""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas.user import PasswordChangeIn, UserLoginIn, UserProfileUpdateIn, UserRegisterIn


logger = logging.getLogger("app.services.auth_service")


class AuthError(Exception):
    """Error domain auth, router menerjemahkannya jadi 400/401."""


class EmailBelumTerverifikasi(AuthError):
    """Password benar, tapi akunnya belum diaktifkan lewat link email.

    Kelas sendiri supaya router bisa membalas 403 dengan pesan yang jelas,
    bukan ikut 401 "Email atau password salah" yang sengaja kabur.
    """


def _terbitkan_token_verifikasi(user: User) -> str:
    """Pasang token verifikasi baru ke `user`, kembalikan token MENTAH-nya.

    Yang disimpan cuma sha256-nya, sama seperti token reset password: kalau isi
    tabel users bocor, token di dalamnya tidak bisa dipakai siapa pun.
    Pemanggil yang bertanggung jawab commit.
    """
    raw_token = secrets.token_urlsafe(32)
    user.verify_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    user.verify_token_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.EMAIL_VERIFY_TOKEN_EXPIRE_MINUTES
    )
    return raw_token


async def _kirim_email_verifikasi(user: User, raw_token: str) -> None:
    """Kirim link aktivasi ke alamat yang baru didaftarkan."""
    link = f"{settings.FRONTEND_VERIFY_EMAIL_URL}?token={raw_token}"
    jam = settings.EMAIL_VERIFY_TOKEN_EXPIRE_MINUTES // 60
    await send_email(
        user.email,
        "Aktivasi Akun KrabCare",
        f"Halo {user.nama},\n\n"
        f"Klik link berikut untuk mengaktifkan akun KrabCare Anda "
        f"(berlaku {jam} jam):\n{link}\n\n"
        "Kalau Anda tidak merasa mendaftar, abaikan email ini.",
    )


async def register_user(db: AsyncSession, payload: UserRegisterIn) -> User:
    """Buat user baru; email wajib unik. Akun belum aktif sampai emailnya diverifikasi.

    JALAN KELUAR SAAT SMTP KOSONG. Kalau `SMTP_HOST` belum diatur, send_email()
    diam saja (lihat core/email.py) dan link aktivasinya tidak akan pernah sampai
    ke siapa pun. Kalau verifikasi tetap diwajibkan dalam keadaan itu, tidak ada
    satu orang pun yang bisa mendaftar. Jadi tanpa SMTP akunnya ditandai
    terverifikasi seketika, dengan peringatan di log. Fiturnya hidup sendiri
    begitu SMTP_HOST diisi, tanpa mengubah kode.
    """
    existing = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise AuthError("Email sudah terdaftar")

    user = User(
        email=payload.email,
        password_hash=await hash_password(payload.password),
        nama=payload.nama,
    )

    raw_token: str | None = None
    if settings.SMTP_HOST:
        raw_token = _terbitkan_token_verifikasi(user)
    else:
        user.email_verified_at = datetime.now(timezone.utc)
        logger.warning(
            "SMTP_HOST kosong, verifikasi email DILEWATI untuk %s dan akunnya langsung "
            "aktif. Isi SMTP_HOST di .env supaya link aktivasi benar-benar dikirim.",
            payload.email,
        )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Email dikirim SESUDAH commit. Kalau SMTP lambat atau gagal, akunnya sudah
    # tersimpan dan pemiliknya tinggal minta kirim ulang.
    if raw_token:
        await _kirim_email_verifikasi(user, raw_token)
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

    # Diperiksa SESUDAH password terbukti benar. Kalau dicek lebih dulu, alasan
    # ini jadi cara menebak email mana yang punya akun tanpa tahu passwordnya.
    # Di titik ini penanya sudah membuktikan tahu passwordnya, jadi
    # menyembunyikan alasannya cuma membuat pemilik akun buntu.
    if user.email_verified_at is None:
        raise EmailBelumTerverifikasi(
            "Email belum diverifikasi. Cek kotak masuk Anda untuk link aktivasi."
        )
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

    Selalu "sukses" dari sisi pemanggil, email hanya benar-benar dikirim kalau
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


async def verify_email(db: AsyncSession, token: str) -> None:
    """Aktifkan akun kalau token cocok & belum kedaluwarsa; token lalu dihanguskan."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(select(User).where(User.verify_token_hash == token_hash))
    user = result.scalar_one_or_none()

    if user is None or user.verify_token_expires_at is None:
        raise AuthError("Link verifikasi tidak valid atau sudah pernah dipakai")
    if user.verify_token_expires_at < datetime.now(timezone.utc):
        raise AuthError("Link verifikasi sudah kedaluwarsa. Minta kirim ulang.")

    user.email_verified_at = datetime.now(timezone.utc)
    user.verify_token_hash = None
    user.verify_token_expires_at = None
    await db.commit()


async def resend_verification(db: AsyncSession, email: str) -> None:
    """Terbitkan ulang link aktivasi.

    Selalu "sukses" dari sisi pemanggil, sama seperti request_password_reset:
    balasan yang berbeda untuk email terdaftar dan tidak akan membuat endpoint
    ini jadi alat mendata siapa saja yang punya akun.
    """
    result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or user.email_verified_at is not None:
        return

    raw_token = _terbitkan_token_verifikasi(user)
    await db.commit()
    await _kirim_email_verifikasi(user, raw_token)


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

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

    Kelas sendiri supaya router membalas 403 dengan pesan jelas, bukan ikut 401
    "Email atau password salah" yang sengaja kabur.
    """


class EmailTidakTerkirim(AuthError):
    """Server email belum dikonfigurasi. Salah server, bukan salah pengguna.

    Kelas sendiri supaya router membalas 503, bukan 400: tidak ada yang bisa
    diperbaiki pengguna dengan mengetik ulang.
    """


class AkunNonaktif(AuthError):
    """Akun ada tapi dimatikan admin. Router membalas 403."""


def _terbitkan_token_verifikasi(user: User) -> str:
    """Pasang token verifikasi baru ke `user`, kembalikan token mentahnya.

    Yang disimpan cuma sha256-nya, sama seperti token reset password, supaya
    isi tabel users yang bocor tidak bisa dipakai. Commit urusan pemanggil.
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
    # Menit apa adanya, jangan dibagi 60 jadi jam: masa berlakunya 5 menit dan
    # pembagian bilangan bulat membuat emailnya berbunyi "berlaku 0 jam".
    menit = settings.EMAIL_VERIFY_TOKEN_EXPIRE_MINUTES
    await send_email(
        user.email,
        "Aktivasi Akun KrabCare",
        f"Halo {user.nama},\n\n"
        f"Klik link berikut untuk mengaktifkan akun KrabCare Anda "
        f"(berlaku {menit} menit, jadi sebaiknya segera dibuka):\n{link}\n\n"
        "Kalau linknya sudah kedaluwarsa, buka saja halaman itu dan minta kirim ulang.\n"
        "Kalau Anda tidak merasa mendaftar, abaikan email ini.",
    )


async def register_user(db: AsyncSession, payload: UserRegisterIn) -> User:
    """Buat user baru; email wajib unik. Akun belum aktif sampai diverifikasi.

    Kalau `SMTP_HOST` belum diatur, send_email() diam saja (core/email.py) dan
    link aktivasi tidak pernah sampai, jadi tidak ada yang bisa mendaftar.
    Dalam keadaan itu akun ditandai terverifikasi seketika, dengan peringatan
    di log. Verifikasi hidup sendiri begitu SMTP_HOST diisi.
    """
    result = await db.execute(select(User).where(func.lower(User.email) == payload.email))
    lama = result.scalar_one_or_none()

    if lama is not None and lama.email_verified_at is not None:
        raise AuthError("Email sudah terdaftar")

    if lama is not None:
        # Pendaftaran yang belum tuntas: barisnya diperbarui, bukan ditolak.
        # Kalau ditolak, orang yang link aktivasinya kedaluwarsa jadi buntu:
        # tidak bisa masuk karena belum aktif, tidak bisa daftar lagi karena
        # emailnya "sudah terdaftar".
        #
        # Aman ditimpa: akun yang belum terverifikasi belum terbukti milik
        # siapa pun dan belum punya kolam maupun data, dan yang menimpanya
        # tetap butuh akses ke kotak masuk email itu untuk mengaktifkannya.
        user = lama
        user.password_hash = await hash_password(payload.password)
        user.nama = payload.nama
    else:
        user = User(
            email=payload.email,
            password_hash=await hash_password(payload.password),
            nama=payload.nama,
        )
        db.add(user)

    raw_token: str | None = None
    if settings.SMTP_HOST:
        raw_token = _terbitkan_token_verifikasi(user)
    else:
        user.email_verified_at = datetime.now(timezone.utc)
        # Token sisa pendaftaran sebelumnya dihanguskan, kalau tidak link lama
        # masih bisa diklik pada akun yang sekarang sudah aktif.
        user.verify_token_hash = None
        user.verify_token_expires_at = None
        logger.warning(
            "SMTP_HOST kosong, verifikasi email DILEWATI untuk %s dan akunnya langsung "
            "aktif. Isi SMTP_HOST di .env supaya link aktivasi benar-benar dikirim.",
            payload.email,
        )

    await db.commit()
    await db.refresh(user)

    # Email dikirim sesudah commit. Kalau SMTP lambat atau gagal, akunnya sudah
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

    # Diperiksa sesudah password terbukti benar. Kalau dicek lebih dulu, balasan
    # ini jadi cara menebak email mana yang punya akun tanpa tahu passwordnya.
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
    """Terbitkan token reset & kirim linknya. Yang disimpan cuma hash tokennya.

    Selalu "sukses" dari sisi pemanggil; email cuma benar-benar dikirim kalau
    akunnya ada dan aktif (anti-enumeration).
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
    """Aktifkan akun dari token email. Idempoten: link yang sama boleh diklik lagi.

    Token tidak dihanguskan setelah berhasil, karena klik kedua sering terjadi:
    pemindai tautan Gmail/antivirus membuka link duluan, atau pengguna memuat
    ulang tab. Akun yang sudah aktif dianggap sukses.

    Risikonya terbatas: token cuma berlaku beberapa menit, dan pemegangnya
    hanya bisa mengaktifkan akun yang sudah aktif.
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    result = await db.execute(select(User).where(User.verify_token_hash == token_hash))
    user = result.scalar_one_or_none()

    if user is None or user.verify_token_expires_at is None:
        raise AuthError("Link verifikasi tidak valid atau sudah pernah dipakai")

    # Sudah aktif berarti sukses, bukan galat. Diperiksa sebelum kedaluwarsa,
    # supaya link lama yang dibuka lagi tetap menjawab "akunnya aktif".
    if user.email_verified_at is not None:
        return

    if user.verify_token_expires_at < datetime.now(timezone.utc):
        raise AuthError("Link verifikasi sudah kedaluwarsa. Minta kirim ulang.")

    # Token tidak dihanguskan di sini, biar kedaluwarsa yang menutupnya.
    user.email_verified_at = datetime.now(timezone.utc)
    await db.commit()


async def resend_verification(db: AsyncSession, email: str) -> None:
    """Terbitkan ulang link aktivasi, dan sebutkan alasannya kalau gagal.

    Beda dengan request_password_reset yang selalu diam. Kalau di sini juga
    diam, pengguna melihat "link sudah dikirim" padahal tidak ada yang
    terkirim, tanpa cara tahu kenapa.

    Keberadaan email memang jadi terbuka, tapi endpoint register sudah
    membalas "Email sudah terdaftar" sejak awal. request_password_reset tetap
    diam karena di sana tidak ada endpoint lain yang membocorkannya.
    """
    # Diperiksa sebelum token diterbitkan: percuma membakar token untuk email
    # yang mustahil dikirim.
    if not settings.SMTP_HOST:
        raise EmailTidakTerkirim(
            "Server email belum dikonfigurasi, jadi link aktivasi tidak bisa dikirim. "
            "Hubungi admin."
        )

    result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = result.scalar_one_or_none()

    if user is None:
        raise AuthError("Email belum terdaftar.")
    if not user.is_active:
        raise AkunNonaktif("Akun ini dinonaktifkan. Hubungi admin.")
    if user.email_verified_at is not None:
        raise AuthError("Akun ini sudah aktif, silakan langsung masuk.")

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

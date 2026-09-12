"""Schema auth & profil user."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.models.enums import UserRole

# Menuntut label domain yang sah dan TLD minimal dua huruf, tanpa menambah
# dependency `email-validator`. Pola yang lebih longgar meloloskan `a@-.-`,
# `a@b..c`, dan alamat berakhiran titik.
_EMAIL_PATTERN = (
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
    r"(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,}$"
)


def _rapikan_email(nilai: object) -> object:
    """Buang spasi dan samakan ke huruf kecil sebelum pola & keunikan diuji.

    Tanpa ini `A@x.com` dan `a@x.com` lolos sebagai dua akun berbeda walau ada
    UNIQUE di database/init/05_users.sql. Pencarian user di auth_service juga
    case-insensitive, supaya akun lama berhuruf besar tetap bisa login.
    """
    return nilai.strip().lower() if isinstance(nilai, str) else nilai


#: Satu definisi untuk semua kolom email. Register, login, dan lupa-sandi harus
#: menormalkan dengan aturan yang sama, kalau tidak login gagal untuk alamat
#: yang baru saja berhasil didaftarkan.
Email = Annotated[
    str,
    BeforeValidator(_rapikan_email),
    StringConstraints(pattern=_EMAIL_PATTERN, max_length=254),
]


class UserRegisterIn(BaseModel):
    email: Email
    password: str = Field(min_length=8)
    nama: str = Field(min_length=1)


class UserLoginIn(BaseModel):
    email: Email
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    nama: str
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}


class UserProfileUpdateIn(BaseModel):
    nama: str = Field(min_length=1)


class PasswordChangeIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class ForgotPasswordIn(BaseModel):
    email: Email


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerificationIn(BaseModel):
    email: Email


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

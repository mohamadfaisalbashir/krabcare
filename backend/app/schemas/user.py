"""Schema auth & profil user."""

import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StringConstraints

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
#: Batas panjang semua kolom isian teks. Sama dengan maxLength di web
#: (components/ui/Input.tsx) dan batas50 di mobile (lib/ui.dart).
MAKS_INPUT = 50

Email = Annotated[
    str,
    BeforeValidator(_rapikan_email),
    StringConstraints(pattern=_EMAIL_PATTERN, max_length=MAKS_INPUT),
]


def _cek_sandi(nilai: str) -> str:
    if not any(c.isupper() for c in nilai) or not re.search(r"[^A-Za-z0-9\s]", nilai):
        raise ValueError("Kata sandi harus berisi huruf besar dan simbol.")
    return nilai


#: Aturan kata sandi baru (daftar, ubah, reset). Login tidak memakainya supaya
#: akun lama dengan sandi lemah tetap bisa masuk. Sama dengan _cekSandi di
#: mobile/lib/screens/auth.dart.
Sandi = Annotated[
    str,
    StringConstraints(min_length=8, max_length=MAKS_INPUT),
    AfterValidator(_cek_sandi),
]


class UserRegisterIn(BaseModel):
    email: Email
    password: Sandi
    nama: str = Field(min_length=1, max_length=MAKS_INPUT)


class UserLoginIn(BaseModel):
    email: Email
    password: str = Field(max_length=MAKS_INPUT)


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
    nama: str = Field(min_length=1, max_length=MAKS_INPUT)


class PasswordChangeIn(BaseModel):
    old_password: str = Field(max_length=MAKS_INPUT)
    new_password: Sandi


class ForgotPasswordIn(BaseModel):
    email: Email


class VerifyEmailIn(BaseModel):
    token: str = Field(max_length=200)


class ResendVerificationIn(BaseModel):
    email: Email


class ResetPasswordIn(BaseModel):
    token: str = Field(max_length=200)
    new_password: Sandi

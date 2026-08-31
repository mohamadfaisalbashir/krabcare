"""Schema auth & profil user."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import UserRole

# Validasi email seadanya (ada @ dan titik) — cukup, tanpa dependency validator baru.
_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class UserRegisterIn(BaseModel):
    email: str = Field(pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=8)
    nama: str = Field(min_length=1)


class UserLoginIn(BaseModel):
    email: str = Field(pattern=_EMAIL_PATTERN)
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
    email: str = Field(pattern=_EMAIL_PATTERN)


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)

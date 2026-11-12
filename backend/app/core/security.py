"""Autentikasi: API key untuk gateway (Raspberry Pi) & JWT untuk user (web/mobile)."""

import asyncio
import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models import User
from app.models.enums import UserRole
from app.services import kolam_service


def _api_key_cocok(x_api_key: str | None) -> bool:
    """Bandingkan API key dalam waktu tetap. `!=` biasa berhenti di karakter
    pertama yang beda, jadi lama responsnya membocorkan berapa karakter awal
    yang sudah benar."""
    return x_api_key is not None and hmac.compare_digest(
        x_api_key.encode(), settings.GATEWAY_API_KEY.encode()
    )


async def verify_gateway_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Dependency endpoint /ingest/*: wajib header X-API-Key milik gateway."""
    if not _api_key_cocok(x_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key gateway tidak valid",
        )

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt 12 rounds memakan ~250-400 ms CPU per operasi dan itu memang tujuannya
def _hash_sync(password: str) -> str:
    return _pwd_context.hash(password)

def _verify_sync(password: str, password_hash: str) -> bool:
    return _pwd_context.verify(password, password_hash)

async def hash_password(password: str) -> str:
    """Hash bcrypt untuk disimpan di kolom users.password_hash."""
    return await asyncio.to_thread(_hash_sync, password)

async def verify_password(password: str, password_hash: str) -> bool:
    """Cocokkan password plaintext dengan hash-nya."""
    return await asyncio.to_thread(_verify_sync, password, password_hash)

#: Hash bcrypt sembarang. Login untuk email yang tidak terdaftar tetap
#: memverifikasi sandi terhadap hash ini, supaya lama responsnya sama dengan
#: email yang terdaftar dan tidak bisa dipakai menebak email mana yang punya akun.
HASH_DUMMY = _hash_sync("bukan-sandi-siapa-pun")


def _sidik_sandi(password_hash: str) -> str:
    """Sidik pendek dari hash sandi, ditanam di JWT sebagai klaim `pwd`.

    Begitu sandi diganti atau direset, hash-nya berubah, sidiknya ikut berubah,
    dan semua token lama otomatis ditolak. Di-HMAC dengan JWT_SECRET_KEY supaya
    isi klaim tidak menyingkap apa pun tentang hash-nya.
    """
    return hmac.new(
        settings.JWT_SECRET_KEY.encode(), password_hash.encode(), hashlib.sha256
    ).hexdigest()[:16]


def create_access_token(user: User) -> str:
    """Terbitkan JWT HS256 berisi user_id (sub), sidik sandi (pwd), dan masa berlaku."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "pwd": _sidik_sandi(user.password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")

async def _resolve_user_from_token(token: str, db: AsyncSession) -> User | None:
    """Decode JWT dan muat User-nya. Return None, bukan raise, kalau token atau
    user invalid: get_current_user membalas 401, sedangkan get_data_access_scope
    masih coba fallback ke X-API-Key."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    # Token terbitan sebelum sandi diganti (atau sebelum klaim ini ada) ditolak.
    if not hmac.compare_digest(str(payload.get("pwd", "")), _sidik_sandi(user.password_hash)):
        return None
    return user


_bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency endpoint khusus user (kolam, notifikasi, auth/me): wajib JWT valid."""
    user = await _resolve_user_from_token(credentials.credentials, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau user tidak ditemukan/nonaktif",
        )
    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency endpoint khusus admin (kelola device): 403 kalau role bukan admin."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Butuh akses admin",
        )
    return current_user


@dataclass
class DataAccessScope:
    """Batas akses baca data hasil resolusi dua jalur auth"""

    user: User | None
    allowed_device_ids: set[int] | None

_bearer_scheme_optional = HTTPBearer(auto_error=False)

async def get_data_access_scope(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> DataAccessScope:
    """Dependency endpoint baca data (readings, quality): terima X-API-Key
    gateway atau Bearer JWT user. 401 kalau keduanya tidak valid."""
    if _api_key_cocok(x_api_key):
        return DataAccessScope(user=None, allowed_device_ids=None)

    if credentials is not None:
        user = await _resolve_user_from_token(credentials.credentials, db)
        if user is not None:
            allowed_device_ids = await kolam_service.get_allowed_device_ids(db, user)
            return DataAccessScope(user=user, allowed_device_ids=allowed_device_ids)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Butuh X-API-Key gateway yang valid atau Bearer token user yang valid",
    )

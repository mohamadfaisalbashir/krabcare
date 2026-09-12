"""Autentikasi: API key untuk gateway (Raspberry Pi) & JWT untuk user (web/mobile)."""

import asyncio
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


async def verify_gateway_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Dependency endpoint /ingest/*: wajib header X-API-Key milik gateway."""
    if x_api_key != settings.GATEWAY_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key gateway tidak valid",
        )

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt 12 rounds memakan ~250-400 ms CPU per operasi dan itu memang tujuannya,
# jangan diturunkan. Yang penting tempatnya: dipanggil langsung di dalam
# `async def` akan memblokir event loop, jadi satu pendaftaran (dua operasi
# bcrypt berturut-turut) membekukan semua request lain selama ~700 ms.
# asyncio.to_thread memindahkannya ke thread pool, sama seperti core/email.py.
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

def create_access_token(user_id: int) -> str:
    """Terbitkan JWT HS256 berisi user_id (sub) + masa berlaku."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
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
    """Batas akses baca data hasil resolusi dua jalur auth.

    - Gateway (X-API-Key valid): user=None, allowed_device_ids=None (tidak dibatasi).
    - User role ADMIN: user=<User>, allowed_device_ids=None (tidak dibatasi).
    - User role lain: user=<User>, allowed_device_ids=set[int] (bisa kosong).
    """

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
    if x_api_key is not None and x_api_key == settings.GATEWAY_API_KEY:
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

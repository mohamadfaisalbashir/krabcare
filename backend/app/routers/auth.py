"""Router auth: register, login, profil sendiri, ganti password."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.user import (
    ForgotPasswordIn,
    PasswordChangeIn,
    ResetPasswordIn,
    TokenOut,
    UserLoginIn,
    UserOut,
    UserProfileUpdateIn,
    UserRegisterIn,
)
from app.services import auth_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: UserRegisterIn, db: AsyncSession = Depends(get_db)) -> UserOut:
    """Buat akun baru (role default operator)."""
    try:
        user = await auth_service.register_user(db, payload)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenOut)
async def login(payload: UserLoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    """Tukar email+password jadi JWT access token."""
    try:
        token = await auth_service.authenticate_user(db, payload)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return TokenOut(access_token=token)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    """Profil pemilik token."""
    return UserOut.model_validate(current_user)


@router.put("/me", response_model=UserOut)
async def update_me(
    payload: UserProfileUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Ubah nama profil sendiri."""
    user = await auth_service.update_profile(db, current_user, payload)
    return UserOut.model_validate(user)


@router.post("/me/change-password", status_code=204)
async def change_password(
    payload: PasswordChangeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Ganti password sendiri (wajib tahu password lama)."""
    try:
        await auth_service.change_password(db, current_user, payload)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Kirim link reset ke email. Respons sama saja terdaftar atau tidak (anti-enumeration)."""
    await auth_service.request_password_reset(db, payload.email)
    return {"detail": "Kalau email terdaftar, link reset password sudah dikirim."}


@router.post("/reset-password", status_code=204)
async def reset_password(
    payload: ResetPasswordIn, db: AsyncSession = Depends(get_db)
) -> None:
    """Set password baru pakai token dari email."""
    try:
        await auth_service.reset_password(db, payload.token, payload.new_password)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

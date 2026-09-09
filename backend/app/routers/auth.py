"""Router auth: register, login, profil sendiri, ganti password."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models import User
from app.models.enums import UserRole
from app.schemas.user import (
    ForgotPasswordIn,
    PasswordChangeIn,
    ResendVerificationIn,
    ResetPasswordIn,
    TokenOut,
    UserLoginIn,
    UserOut,
    UserProfileUpdateIn,
    UserRegisterIn,
    VerifyEmailIn,
)
from app.services import auth_service
from app.services.auth_service import (
    AkunNonaktif,
    AuthError,
    EmailBelumTerverifikasi,
    EmailTidakTerkirim,
)

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
    except EmailBelumTerverifikasi as exc:
        # 403, bukan 401: kredensialnya BENAR, yang kurang cuma aktivasi. 401
        # akan memicu logout() otomatis di klien (lib/api.ts) dan melempar
        # pengguna ke halaman login yang baru saja ia isi dengan benar.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return TokenOut(access_token=token)


@router.post("/verify-email", status_code=204)
async def verify_email(payload: VerifyEmailIn, db: AsyncSession = Depends(get_db)) -> None:
    """Aktifkan akun lewat token dari email pendaftaran."""
    try:
        await auth_service.verify_email(db, payload.token)
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/resend-verification")
async def resend_verification(
    payload: ResendVerificationIn, db: AsyncSession = Depends(get_db)
) -> dict:
    """Kirim ulang link aktivasi, dan sebutkan alasannya kalau gagal.

    Sengaja TIDAK anti-enumeration, tidak seperti /forgot-password. Alasannya
    ada di docstring auth_service.resend_verification: balasan seragam di sini
    membuat pengguna melihat "terkirim" padahal tidak ada yang dikirim, dan
    endpoint register sudah membocorkan keberadaan email sejak awal.
    """
    try:
        await auth_service.resend_verification(db, payload.email)
    except EmailTidakTerkirim as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except AkunNonaktif as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except AuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"detail": "Link aktivasi baru sudah dikirim. Cek kotak masuk Anda."}


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


@router.delete("/me", status_code=204)
async def delete_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hapus akun sendiri, permanen.

    Tidak ada kode pembersihan karena aturan FK sudah menanganinya:
      - kolam.owner_user_id   ON DELETE CASCADE   -> kolam ikut hilang
      - devices.kolam_id      ON DELETE SET NULL  -> device SELAMAT, jadi tak terklaim
      - notifications, push_tokens                -> CASCADE
    Riwayat sensor menempel di devices, jadi ia bertahan dan bisa diakses lagi
    setelah device-nya diklaim ulang.

    Admin ditolak: akun admin hasil seed adalah satu-satunya pintu ke panel
    /perangkat, dan menghapusnya mengunci pendaftaran device untuk semua orang.
    """
    if current_user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun admin tidak bisa dihapus sendiri.",
        )
    await db.delete(current_user)
    await db.commit()


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

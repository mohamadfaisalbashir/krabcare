"""Seed akun admin awal, idempoten.

Login pakai email (schemas/user.py), jadi "SuperKrab" jadi bagian depan alamat:
superkrab@krabcare.com.

Jalankan dari container backend:
    docker compose -f docker-compose.yml -f docker-compose.prod.yml \\
        exec backend python -m app.scripts.seed_admin

Aman dijalankan berkali-kali: kalau akunnya sudah ada, cuma role admin dan
status aktif yang dipastikan. Password tidak ditimpa, supaya password yang
sudah diganti lewat /auth/me/change-password tidak kembali ke nilai awal.
"""

import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models import User
from app.models.enums import UserRole

ADMIN_EMAIL = "superkrab@krabcare.com"
ADMIN_PASSWORD = "tuankrabgubeng"
ADMIN_NAMA = "SuperKrab"


async def seed_admin() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        user = result.scalar_one_or_none()

        if user is not None:
            if user.role != UserRole.ADMIN or not user.is_active:
                user.role = UserRole.ADMIN
                user.is_active = True
                await db.commit()
                print(f"Akun '{ADMIN_EMAIL}' sudah ada, role/status disamakan ke admin aktif.")
            else:
                print(f"Akun '{ADMIN_EMAIL}' sudah ada dan sudah admin. Tidak ada perubahan.")
            return

        user = User(
            email=ADMIN_EMAIL,
            password_hash=await hash_password(ADMIN_PASSWORD),
            nama=ADMIN_NAMA,
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"Akun admin dibuat: {ADMIN_EMAIL} / (password sesuai yang diminta)")


if __name__ == "__main__":
    asyncio.run(seed_admin())

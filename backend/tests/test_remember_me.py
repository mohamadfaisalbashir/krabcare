"""Umur token "Ingat saya" (core/security.py): operator 30 hari, admin tetap 1 hari.

Skrip assert stdlib, sama seperti test_password_hash.py. Jalankan:

    docker compose exec backend python tests/test_remember_me.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import jwt  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token, token_diingat  # noqa: E402
from app.models import User  # noqa: E402
from app.models.enums import UserRole  # noqa: E402

HARI = 24 * 3600


def _umur(role: UserRole, remember: bool) -> tuple[float, bool, str]:
    token = create_access_token(User(id=1, password_hash="x", role=role), remember)
    p = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
    return (p["exp"] - p["iat"]) / HARI, p["rem"], token


def test_operator_diingat_30_hari():
    hari, rem, token = _umur(UserRole.OPERATOR, True)
    assert hari == settings.REMEMBER_ME_EXPIRE_DAYS and rem and token_diingat(token)


def test_operator_biasa_1_hari():
    hari, rem, token = _umur(UserRole.OPERATOR, False)
    assert hari * 24 * 60 == settings.ACCESS_TOKEN_EXPIRE_MINUTES
    assert not rem and not token_diingat(token)


def test_admin_dicentang_tetap_1_hari():
    hari, rem, token = _umur(UserRole.ADMIN, True)
    assert hari * 24 * 60 == settings.ACCESS_TOKEN_EXPIRE_MINUTES
    assert not rem and not token_diingat(token)


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua cek remember me lulus.")

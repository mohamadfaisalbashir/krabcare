"""Hash sandi (core/security.py) setelah passlib diganti bcrypt langsung.

Skrip assert stdlib, sama seperti test_rate_limit.py. Jalankan:

    docker compose exec backend python tests/test_password_hash.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import _hash_sync, _verify_sync  # noqa: E402

#: Dibuat passlib 1.7.4 + bcrypt 4.0.1 sebelum passlib dicopot. Mewakili semua
#: hash yang sudah ada di tabel users.
HASH_PASSLIB = "$2b$12$wxo/7.y3BmMy/DdpCGeyKOcEJlyLzQXEUkKtw7r1A.At.P5FfK4Za"


def test_hash_lama_dari_passlib_tetap_cocok():
    assert _verify_sync("sandi-uji-passlib", HASH_PASSLIB)
    assert not _verify_sync("sandi-lain", HASH_PASSLIB)


def test_bolak_balik():
    h = _hash_sync("rahasia123")
    assert h.startswith("$2b$12$")
    assert _verify_sync("rahasia123", h)
    assert not _verify_sync("rahasia124", h)


def test_sandi_di_atas_72_byte_tidak_melempar():
    # 50 karakter (MAKS_INPUT) x 4 byte = 200 byte. bcrypt >= 5 menolak masukan
    # sepanjang ini kalau tidak dipotong dulu.
    panjang = "🦀" * 50
    h = _hash_sync(panjang)
    assert _verify_sync(panjang, h)
    assert not _verify_sync("🦀" * 10, h)


def test_hash_rusak_dianggap_salah():
    assert not _verify_sync("apa-saja", "bukan-hash-bcrypt")


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua cek hash sandi lulus.")

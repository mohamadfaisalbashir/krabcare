"""Pembatas laju endpoint auth (core/rate_limit.py).

Skrip assert stdlib, sama seperti test_push_segar.py. Jalankan:

    docker compose exec backend python tests/test_rate_limit.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.rate_limit import izinkan  # noqa: E402


def test_ditolak_setelah_batas():
    kunci = ("1.1.1.1", "/login")
    assert all(izinkan(kunci, 3, 60, sekarang=t) for t in (0, 1, 2))
    assert not izinkan(kunci, 3, 60, sekarang=3)


def test_dibuka_lagi_setelah_jendela_lewat():
    kunci = ("2.2.2.2", "/login")
    for t in (0, 1, 2):
        izinkan(kunci, 3, 60, sekarang=t)
    assert not izinkan(kunci, 3, 60, sekarang=59)
    assert izinkan(kunci, 3, 60, sekarang=60)  # percobaan t=0 sudah keluar jendela


def test_ip_dan_endpoint_dihitung_terpisah():
    for t in (0, 1, 2):
        izinkan(("3.3.3.3", "/login"), 3, 60, sekarang=t)
    assert izinkan(("4.4.4.4", "/login"), 3, 60, sekarang=3)
    assert izinkan(("3.3.3.3", "/register"), 3, 60, sekarang=3)


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua cek pembatas laju lulus.")

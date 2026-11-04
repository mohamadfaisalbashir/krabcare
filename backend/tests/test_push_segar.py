"""Batas umur data untuk push notifikasi (data basi tidak di-push).

Skrip assert stdlib, sama seperti test_ammonia_speciation.py. Jalankan:

    docker compose exec backend python tests/test_push_segar.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.notification_service import PUSH_MAKS_UMUR, _masih_segar  # noqa: E402

SEKARANG = datetime(2026, 11, 4, 10, 0, tzinfo=timezone.utc)
BATAS = SEKARANG - PUSH_MAKS_UMUR


def test_data_baru_di_push():
    assert _masih_segar(SEKARANG - timedelta(minutes=5), BATAS)


def test_data_basi_tidak_di_push():
    assert not _masih_segar(SEKARANG - timedelta(minutes=15), BATAS)


def test_naive_dianggap_utc():
    assert _masih_segar(datetime(2026, 11, 4, 9, 55), BATAS)
    assert not _masih_segar(datetime(2026, 11, 4, 9, 45), BATAS)


def test_zona_lain_dibandingkan_benar():
    wib = timezone(timedelta(hours=7))
    assert _masih_segar(datetime(2026, 11, 4, 16, 55, tzinfo=wib), BATAS)  # 09:55 UTC
    assert not _masih_segar(datetime(2026, 11, 4, 16, 45, tzinfo=wib), BATAS)  # 09:45 UTC


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua cek umur push lulus.")

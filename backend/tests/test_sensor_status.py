"""Deteksi sensor error dari pola pembacaan (services/sensor_status.py).

Skrip assert stdlib, sama seperti test_push_segar.py. Jalankan:

    docker compose exec backend python tests/test_sensor_status.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.sensor_status import deteksi_sensor_error  # noqa: E402

T0 = datetime(2026, 11, 12, 10, 0, tzinfo=timezone.utc)


def baris(menit_lalu, ph=7.8, suhu=29.0, sal=20.0):
    return SimpleNamespace(
        time=T0 - timedelta(minutes=menit_lalu), ph=ph, temperature_c=suhu, salinity_ppt=sal
    )


def test_stabil_tidak_error():
    assert deteksi_sensor_error([baris(i) for i in range(11)]) == {}


def test_di_luar_rentang_tapi_stabil_bukan_error():
    # Alat yang selalu di luar semesta fuzzy: salinitas 0,2 ppt, suhu 14 °C, pH 2,8.
    rows = [baris(i, ph=2.8, suhu=14.0, sal=0.2) for i in range(11)]
    assert deteksi_sensor_error(rows) == {}


def test_lonjakan_terdeteksi_per_parameter():
    rows = [baris(0, ph=13.0), baris(1, ph=7.3), baris(2, ph=7.3)]
    assert deteksi_sensor_error(rows) == {"ph": "lonjakan"}


def test_lonjakan_lama_masih_dihitung_dalam_jendela():
    # Lonjakan suhu 6 pembacaan lalu, sesudahnya tenang: belum dianggap pulih.
    rows = [baris(i, suhu=70.0) for i in range(6)] + [baris(i, suhu=29.0) for i in range(6, 11)]
    assert deteksi_sensor_error(rows) == {"temperature_c": "lonjakan"}


def test_jeda_panjang_tidak_dibandingkan():
    # Device mati sejam: beda nilai sebelum dan sesudahnya bukan lonjakan.
    rows = [baris(0, sal=30.0), baris(60, sal=10.0)]
    assert deteksi_sensor_error(rows) == {}


def test_kosong_di_pembacaan_terbaru():
    rows = [baris(0, ph=None), baris(1)]
    assert deteksi_sensor_error(rows) == {"ph": "kosong"}


def test_kosong_di_pembacaan_lama_dilewati():
    rows = [baris(0), baris(1, ph=None), baris(2)]
    assert deteksi_sensor_error(rows) == {}


def test_tanpa_pembacaan():
    assert deteksi_sensor_error([]) == {}


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua cek sensor error lulus.")

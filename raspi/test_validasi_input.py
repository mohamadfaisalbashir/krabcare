"""Uji validasi_input.py. Skrip assert stdlib, sama seperti test_reference_values.py.

Jalankan: python3 test_validasi_input.py
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validasi_input import semua_kosong, validasi_nilai, validasi_reading  # noqa: E402


def test_nilai_normal_lolos():
    r, alasan = validasi_reading(
        {"device_code": "54D660E9BFB4", "time": "t", "ph": 7.9, "temperature_c": 28.4, "salinity_ppt": 19.5}
    )
    assert (r["ph"], r["temperature_c"], r["salinity_ppt"]) == (7.9, 28.4, 19.5), r
    assert r["device_code"] == "54D660E9BFB4" and r["time"] == "t"
    assert alasan == [], alasan


def test_batas_inklusif_lolos():
    for parameter, nilai in [("ph", 0), ("ph", 14), ("temperature_c", 0), ("temperature_c", 50),
                             ("salinity_ppt", 0), ("salinity_ppt", 50)]:
        x, alasan = validasi_nilai(parameter, nilai)
        assert x == float(nilai) and alasan is None, (parameter, nilai, x, alasan)


def test_di_luar_rentang_jadi_none():
    for parameter, nilai in [("ph", -0.1), ("ph", 14.5), ("temperature_c", 50.1), ("salinity_ppt", 55)]:
        x, alasan = validasi_nilai(parameter, nilai)
        assert x is None and "di luar rentang" in alasan, (parameter, nilai, alasan)


def test_kode_error_ds18b20():
    for nilai in (-127, 85):
        x, alasan = validasi_nilai("temperature_c", nilai)
        assert x is None and "DS18B20" in alasan, (nilai, alasan)


def test_bukan_angka_jadi_none():
    for nilai in ("abc", float("nan"), float("inf"), True, False, [7]):
        x, alasan = validasi_nilai("ph", nilai)
        assert x is None and alasan, (nilai, alasan)


def test_string_angka_dikonversi():
    x, alasan = validasi_nilai("ph", "7.92")
    assert x == 7.92 and alasan is None


def test_none_tetap_none_tanpa_alasan():
    assert validasi_nilai("ph", None) == (None, None)


def test_semua_kosong():
    r, _ = validasi_reading({"ph": None, "temperature_c": -127, "salinity_ppt": "x"})
    assert semua_kosong(r)
    r, _ = validasi_reading({"ph": 7.9, "temperature_c": -127, "salinity_ppt": None})
    assert not semua_kosong(r)


def test_reading_asli_tidak_diubah():
    asli = {"ph": 99, "temperature_c": 28, "salinity_ppt": 20}
    validasi_reading(asli)
    assert asli["ph"] == 99


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua uji validasi lulus.")

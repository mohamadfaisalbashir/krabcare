"""Cek data parsial: sensor rusak membuat key-nya hilang dari JSON ESP32.

Jalankan: python test_data_parsial.py [folder_kode]
Tanpa argumen menguji folder berkas ini. Isi folder_kode dengan
../raspi-data/baca_prediksi untuk menguji salinan yang lain.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(__file__)))

from edge_pipeline import EdgePipeline  # noqa: E402
from fuzzy_quality import classify_water_quality  # noqa: E402

T0 = datetime(2026, 11, 19, 3, 0, tzinfo=timezone.utc)
LENGKAP = {"ph": 7.0, "temperature_c": 28.4, "salinity_ppt": 15.2}
NAMA = {"ph": "ph", "temperature_c": "suhu", "salinity_ppt": "salinitas"}


def test_fuzzy_parsial():
    penuh = classify_water_quality(**LENGKAP)
    assert set(penuh["membership_degrees"]) == {"suhu", "ph", "salinitas"}
    for hilang in LENGKAP:
        sisa = {k: v for k, v in LENGKAP.items() if k != hilang}
        hasil = classify_water_quality(**sisa)
        assert NAMA[hilang] not in hasil["membership_degrees"], hilang
        # Rincian parameter yang tersisa sama persis dengan versi lengkap.
        for k in sisa:
            assert hasil["membership_degrees"][NAMA[k]] == penuh["membership_degrees"][NAMA[k]]
    # Satu parameter saja: status kolam ikut parameter itu.
    hanya_ph = classify_water_quality(ph=5.0)
    assert hanya_ph["quality_category"] == "buruk", hanya_ph
    assert list(hanya_ph["membership_degrees"]) == ["ph"]
    assert classify_water_quality() is None


def test_pipeline_parsial():
    for hilang in LENGKAP:
        p = EdgePipeline("UJI")
        for menit in range(5):
            nilai = {k: v for k, v in LENGKAP.items() if k != hilang}
            out = p.process(T0 + timedelta(minutes=menit), **{hilang: None}, **nilai)
        assert len(out["classifications"]) == 1, hilang
        assert out["ammonia_risks"] == [], hilang  # amonia butuh ketiganya
        assert out["predictions"], hilang
        for row in out["predictions"]:
            assert row[f"predicted_{hilang}"] is None
    kosong = EdgePipeline("UJI").process(T0, ph=None, temperature_c=None, salinity_ppt=None)
    assert kosong["classifications"] == [] and kosong["predictions"] == []


def test_forecast_basi():
    """pH mati 20 menit: forecast pH None, suhu dan salinitas tetap diramal."""
    p = EdgePipeline("UJI")
    for menit in range(30):
        ph = LENGKAP["ph"] if menit < 10 else None
        out = p.process(T0 + timedelta(minutes=menit), ph=ph, temperature_c=28.4, salinity_ppt=15.2)
    for row in out["predictions"]:
        assert row["predicted_ph"] is None, row
        assert row["predicted_temperature_c"] is not None
        assert row["predicted_salinity_ppt"] is not None


if __name__ == "__main__":
    test_fuzzy_parsial()
    test_pipeline_parsial()
    test_forecast_basi()
    print(f"Semua cek data parsial lulus ({sys.path[0]}).")

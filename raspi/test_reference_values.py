import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ammonia_nh3 import RiskLevel, assess_ammonia_risk  # noqa: E402
from fuzzy_quality import classify_water_quality  # noqa: E402


def test_kondisi_khas_kolam():
    """pH 8.0 / 28.5 C / 19 ppt, kondisi operasi normal rak kepiting."""
    r = assess_ammonia_risk(ph=8.0, temperature_c=28.5, salinity_ppt=19.0)
    assert abs(r.fraction_nh3_pct - 5.999) < 0.01, r.fraction_nh3_pct
    assert r.in_valid_range is True
    assert r.risk_level is RiskLevel.NORMAL, r.risk_level


def test_ph_tinggi_berbahaya():
    r = assess_ammonia_risk(ph=8.5, temperature_c=30.0, salinity_ppt=19.0)
    assert abs(r.fraction_nh3_pct - 18.29) < 0.05, r.fraction_nh3_pct
    assert r.risk_level is RiskLevel.BERBAHAYA, r.risk_level


def test_di_luar_rentang_tetap_dihitung():
    r = assess_ammonia_risk(ph=7.0, temperature_c=25.0, salinity_ppt=19.0)
    assert r.in_valid_range is False
    assert r.fraction_nh3_pct > 0.0


def test_klasifikasi_normal():
    """Ketiga parameter di himpunan "normal", hasilnya kategori baik."""
    hasil = classify_water_quality(ph=8.0, temperature_c=28.0, salinity_ppt=20.0)
    assert hasil["quality_category"] == "baik", hasil


def test_klasifikasi_ekstrem():
    """Salinitas jauh di bawah semua himpunan: sangat_rendah, bahaya, buruk."""
    hasil = classify_water_quality(ph=8.0, temperature_c=28.0, salinity_ppt=0.0)
    assert hasil["quality_category"] == "buruk", hasil


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua angka acuan lulus.")

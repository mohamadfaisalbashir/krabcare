import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ammonia_nh3 import RiskLevel, assess_ammonia_risk  # noqa: E402
from fuzzy_quality import classify_water_quality, infer_parameter  # noqa: E402


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


def test_contoh_perhitungan_laporan_cd3():
    """Angka contoh di CD-3 3.3.7.3-3.3.7.5 (keanggotaan, N*, status) harus
    keluar persis sama dari kode. Kalau gagal, kode dan laporan berselisih."""
    kasus = [
        # (parameter, nilai, N* di laporan, status, keanggotaan di laporan)
        ("suhu", 30.9, 30.96, "aman", {"normal": 0.55, "tinggi": 0.45}),
        ("suhu", 32.2, 50.00, "waspada", {"tinggi": 1.0}),
        ("ph", 7.42, 22.14, "aman", {"normal": 0.84, "asam": 0.16}),
        ("salinitas", 7.40, 50.00, "waspada", {"rendah": 1.0}),
        ("salinitas", 4.17, 65.28, "bahaya", {"rendah": 0.585, "sangat_rendah": 0.415}),
    ]
    for parameter, nilai, n_laporan, status_laporan, mu_laporan in kasus:
        n_star, status, mu = infer_parameter(parameter, nilai)
        assert abs(n_star - n_laporan) < 0.01, (parameter, nilai, n_star)
        assert status == status_laporan, (parameter, nilai, status)
        for himpunan, derajat in mu_laporan.items():
            assert abs(mu[himpunan] - derajat) < 1e-6, (parameter, nilai, himpunan, mu[himpunan])


def test_suhu_normal_mulai_26_sesuai_persamaan_4():
    """Normal suhu = trapmf(26, 28, 30, 32). 25 °C hanya masuk Rendah: Waspada."""
    n_star, status, mu = infer_parameter("suhu", 25.0)
    assert mu["normal"] == 0.0, mu
    assert status == "waspada", (n_star, status)


def test_nilai_di_luar_universe_tetap_bahaya():
    """Himpunan pinggir berupa bahu terbuka (CD-3: mu = 1 untuk T <= 18,
    T >= 35, dst.), jadi nilai di luar universe tidak jatuh ke Aman."""
    for parameter, nilai in [("suhu", 14.0), ("suhu", 50.0), ("ph", 3.5), ("ph", 11.5), ("salinitas", 55.0)]:
        _, status, _ = infer_parameter(parameter, nilai)
        assert status == "bahaya", (parameter, nilai, status)


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua angka acuan lulus.")

"""Angka acuan modul spesiasi amonia (amonia.md Bagian 1).

Ditulis sebagai skrip assert stdlib, BUKAN test pytest, dan itu disengaja:
`pytest` tidak ada di backend/requirements.txt (harness test lama dihapus di
commit 2698160). Jalankan langsung:

    docker compose exec backend python tests/test_ammonia_speciation.py

Namanya tetap `test_*` supaya ikut terjaring kalau pytest suatu saat dipasang.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ammonia_speciation import (  # noqa: E402
    RiskLevel,
    assess_ammonia_risk,
)


def test_kondisi_khas_kolam():
    """pH 8.0 / 28.5 C / 19 ppt — kondisi operasi normal rak kepiting.

    CATATAN PENYIMPANGAN dari amonia.md:147. Dokumen menuliskan harapan
    `risk_level == PERHATIAN`, tapi classify_risk() di dokumen yang SAMA
    (amonia.md:120) menggolongkan `< 6.0 %` sebagai NORMAL, dan fraksinya
    5.9985 % — tepat di bawah ambang. Keputusan user 2026-09-03: percayai
    ambang 6 %/15 %, jadi yang benar NORMAL. Ambang tidak diubah diam-diam
    (larangan amonia.md:228).
    """
    r = assess_ammonia_risk(ph=8.0, temperature_c=28.5, salinity_ppt=19.0)
    assert abs(r.fraction_nh3_pct - 5.999) < 0.01, r.fraction_nh3_pct
    assert r.in_valid_range is True
    assert r.risk_level is RiskLevel.NORMAL, r.risk_level


def test_ph_tinggi_berbahaya():
    r = assess_ammonia_risk(ph=8.5, temperature_c=30.0, salinity_ppt=19.0)
    assert abs(r.fraction_nh3_pct - 18.29) < 0.05, r.fraction_nh3_pct
    assert r.risk_level is RiskLevel.BERBAHAYA, r.risk_level


def test_di_luar_rentang_tetap_dihitung():
    """pH 7.0 di luar envelope tervalidasi 7.8-8.3: ditandai, bukan diblokir."""
    r = assess_ammonia_risk(ph=7.0, temperature_c=25.0, salinity_ppt=19.0)
    assert r.in_valid_range is False
    assert r.fraction_nh3_pct > 0.0


if __name__ == "__main__":
    for nama, fn in sorted(globals().items()):
        if nama.startswith("test_"):
            fn()
            print(f"OK  {nama}")
    print("Semua angka acuan amonia lulus.")

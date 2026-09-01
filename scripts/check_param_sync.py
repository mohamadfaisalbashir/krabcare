#!/usr/bin/env python3
"""Jaga agar aturan parameter di web (TypeScript), mobile (Dart), dan backend
(Python) tidak melenceng.

Ketiganya beda bahasa, jadi kodenya tidak bisa dibagi. Yang bisa dibagi adalah
JAMINAN: skrip ini membaca semua sumber, mengekstrak angkanya, dan gagal kalau
ada yang berbeda. Ubah salah satu tanpa yang lain -> skrip ini merah.

Pernah terjadi sungguhan: web diubah ke 1 desimal, mobile tertinggal di 2, dan
pembacaan yang sama tampil "7.6" di web tapi "7.63" di mobile.

Jalankan:  python scripts/check_param_sync.py
Keluar 0 kalau sinkron, 1 kalau melenceng.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

WEB_PARAM = ROOT / "web/src/lib/parameter.ts"
WEB_PRED = ROOT / "web/src/components/kolam/PredictionPanel.tsx"
MOB_THRESH = ROOT / "mobile/lib/core/api/water_thresholds.dart"
# Backend ikut menyimpan ambang sejak filter status Log Historis dipindah ke SQL
# (paginasi LIMIT/OFFSET tidak bisa disaring lagi di klien).
BE_THRESH = ROOT / "backend/app/core/water_thresholds.py"

# Nama parameter berbeda di kedua sisi; ini kamusnya.
WEB_TO_MOB = {"ph": "ph", "temperature_c": "suhu", "salinity_ppt": "salinitas"}

masalah: list[str] = []


def baca(p: Path) -> str:
    if not p.exists():
        sys.exit(f"FATAL: {p.relative_to(ROOT)} tidak ada - path di skrip ini sudah usang.")
    return p.read_text(encoding="utf-8")


def wajib(cocok: dict, jumlah: int, apa: str, berkas: Path) -> dict:
    """Ekstraksi yang gagal HARUS jadi kegagalan, bukan lolos diam-diam.

    Kalau berkasnya dirapikan ulang dan regex tidak lagi cocok, skrip yang
    'hijau karena tidak menemukan apa-apa' jauh lebih berbahaya daripada merah.
    """
    if len(cocok) != jumlah:
        sys.exit(
            f"FATAL: cuma menemukan {len(cocok)} {apa} di {berkas.relative_to(ROOT)}, "
            f"harusnya {jumlah}. Formatnya berubah - perbarui regex di skrip ini."
        )
    return cocok


# --- 1. Tabel ambang -------------------------------------------------------
web = baca(WEB_PARAM)
web_range = wajib(
    {
        m[1]: (float(m[2]), float(m[3]), float(m[4]), float(m[5]))
        for m in re.finditer(
            r"(\w+):\s*\{\s*min:\s*([\d.]+),\s*max:\s*([\d.]+),\s*"
            r"optimal:\s*\[\s*([\d.]+),\s*([\d.]+)\s*\]\s*\}",
            web,
        )
    },
    3, "baris RANGE", WEB_PARAM,
)

mob = baca(MOB_THRESH)
mob_range = wajib(
    {
        m[1]: (float(m[2]), float(m[3]), float(m[4]), float(m[5]))
        for m in re.finditer(
            r"WaterParameter\.(\w+):\s*ParamRange\(min:\s*([\d.]+),\s*max:\s*([\d.]+),\s*"
            r"optimalLow:\s*([\d.]+),\s*optimalHigh:\s*([\d.]+)\)",
            mob,
        )
    },
    3, "baris kParamRanges", MOB_THRESH,
)

be = baca(BE_THRESH)
be_range = wajib(
    {
        m[1]: (float(m[2]), float(m[3]), float(m[4]), float(m[5]))
        for m in re.finditer(
            r"ParamKey\.(\w+):\s*\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)",
            be,
        )
    },
    3, "baris RANGE", BE_THRESH,
)

for wkey, mkey in WEB_TO_MOB.items():
    if web_range[wkey] != mob_range[mkey]:
        masalah.append(
            f"ambang {wkey}: web {web_range[wkey]} != mobile ({mkey}) {mob_range[mkey]}"
        )
    # Nama anggota enum backend = key web dalam huruf besar.
    bkey = wkey.upper()
    if web_range[wkey] != be_range[bkey]:
        masalah.append(
            f"ambang {wkey}: web {web_range[wkey]} != backend ({bkey}) {be_range[bkey]}"
        )

# --- 2. Jumlah desimal tampilan -------------------------------------------
w_dec = re.search(r"toFixed\((\d+)\)", web)
m_dec = re.search(r"toStringAsFixed\((\d+)\)", mob)
if not w_dec or not m_dec:
    sys.exit("FATAL: formatValue tidak ditemukan di salah satu sisi.")
if w_dec[1] != m_dec[1]:
    masalah.append(f"desimal formatValue: web {w_dec[1]} != mobile {m_dec[1]}")

# --- 3. Ambang "stabil" pada kalimat prediksi ------------------------------
pred = baca(WEB_PRED)
web_stab = wajib(
    dict(re.findall(r"(\w+):\s*([\d.]+),", pred.split("STABLE_THRESHOLD")[1][:200])),
    3, "entri STABLE_THRESHOLD", WEB_PRED,
)
mob_stab = wajib(
    dict(re.findall(r"WaterParameter\.(\w+)\s*=>\s*([\d.]+),", mob.split("stableThreshold")[1][:300])),
    3, "entri stableThreshold", MOB_THRESH,
)
for wkey, mkey in WEB_TO_MOB.items():
    if float(web_stab[wkey]) != float(mob_stab[mkey]):
        masalah.append(
            f"ambang stabil {wkey}: web {web_stab[wkey]} != mobile {mob_stab[mkey]}"
        )

# --- 4. Jendela horizon prediksi ------------------------------------------
w_hor = re.search(r"HORIZON_MINUTES\s*=\s*(\d+)", pred)
m_hor = re.search(r"kPredictionHorizonLimitMinutes\s*=\s*(\d+)", mob)
if not w_hor or not m_hor:
    sys.exit("FATAL: batas horizon prediksi tidak ditemukan di salah satu sisi.")
if w_hor[1] != m_hor[1]:
    masalah.append(f"horizon prediksi: web {w_hor[1]} menit != mobile {m_hor[1]} menit")

# --- 5. Tidak ada call site yang membypass formatValue ---------------------
# Menyamakan modul aturannya tidak cukup: pernah terjadi parameter_card.dart
# memanggil toStringAsFixed(1) langsung, sehingga 22.00 tampil "22.0" di mobile
# tapi "22" di web meski kedua formatValue-nya sudah identik.
def cari_bypass(akar: Path, pola: str, pengecualian: str, ext: tuple[str, ...]) -> list[str]:
    hasil = []
    for f in akar.rglob("*"):
        if f.suffix not in ext or pengecualian in f.as_posix():
            continue
        for i, baris in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            telanjang = baris.strip()
            if telanjang.startswith(("//", "*", "/*", "///")):
                continue  # komentar yang menyebut namanya, bukan pemakaian
            if pola in baris:
                hasil.append(f"{f.relative_to(ROOT)}:{i}")
    return hasil


for label, akar, pola, kecuali, ext in [
    ("web", ROOT / "web/src", "toFixed(", "lib/parameter.ts", (".ts", ".tsx")),
    ("mobile", ROOT / "mobile/lib", "toStringAsFixed(", "water_thresholds.dart", (".dart",)),
]:
    for lokasi in cari_bypass(akar, pola, kecuali, ext):
        masalah.append(f"{label}: {lokasi} memformat angka langsung, harus lewat formatValue()")


# --- Hasil -----------------------------------------------------------------
if masalah:
    print("MELENCENG - web, mobile, dan backend tidak sepakat:\n")
    for m in masalah:
        print(f"  x {m}")
    print("\nSamakan keduanya, lalu jalankan ulang skrip ini.")
    sys.exit(1)

print(
    "SINKRON - ambang cocok di web, mobile & backend; desimal, ambang stabil, "
    "dan horizon prediksi cocok di web & mobile."
)

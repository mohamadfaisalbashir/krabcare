"""Validasi input (range check) untuk pembacaan sensor dari ESP32.

Modul ini memeriksa setiap pembacaan sebelum dipakai gateway, yaitu sebelum
disimpan ke CSV, dikirim ke cloud, dan dimasukkan ke buffer forecast WLR
(``WLRForecaster`` di dalam ``EdgePipeline``). Dipanggil dari
``baca_prediksi.py`` tepat setelah ``buat_reading()``.

Nilai di luar rentang fisik dianggap hilang dan diganti ``None``, bukan
dipotong ke batas atau diisi nilai lain:

- ``WLRForecaster`` hanya memakai titik yang tidak ``None``, jadi satu bacaan
  rusak tidak ikut membentuk garis tren selama satu jendela penuh.
- ``EdgePipeline`` melewati klasifikasi fuzzy dan estimasi amonia kondisi
  sekarang kalau ada parameter ``None``, tanpa mengisi nilai palsu.
- Backend menerima ``null`` per parameter, sedangkan nilai di luar skema
  (mis. pH > 14) akan membuat seluruh batch ditolak 422.

========== ============ ==================================================
Parameter  Rentang      Keterangan
========== ============ ==================================================
Suhu       0-50 degC    Menyaring kode error DS18B20 (-127 dan 85 degC).
pH         0-14         Batas skala pH.
Salinitas  0-50 ppt     Batas atas universe fuzzy salinitas (CD-3).
========== ============ ==================================================

Catatan desain: fuzzy salinitas memakai bahu terbuka, sehingga nilai di luar
universe (mis. 55 ppt) dinilai Bahaya. Di sistem nyata, salinitas di atas
50 ppt pada kolam kepiting (air laut sekitar 35 ppt) dianggap kegagalan sensor
TDS, bukan kondisi air sungguhan. Karena itu nilai tersebut disaring di sini
dan tidak dinilai fuzzy. Nilai 40-50 ppt tetap lolos dan tetap dinilai Bahaya.

Murni stdlib, cukup disalin satu berkas ke Raspberry Pi.
"""

from __future__ import annotations

import math

BATAS_VALID: dict[str, tuple[float, float]] = {
    "ph": (0.0, 14.0),
    "temperature_c": (0.0, 50.0),
    "salinity_ppt": (0.0, 50.0),
}
"""Rentang fisik yang dianggap valid per parameter, inklusif di kedua ujung."""

KODE_ERROR_DS18B20: tuple[float, ...] = (-127.0, 85.0)
"""Kode error umum DS18B20: -127 = sensor terputus, 85 = nilai awal sebelum
konversi selesai. Keduanya sudah di luar ``BATAS_VALID`` suhu; konstanta ini
hanya dipakai agar pesan log menyebut penyebab yang lebih jelas."""

PARAMETER: tuple[str, ...] = tuple(BATAS_VALID)
"""Nama parameter yang divalidasi, sama dengan kunci reading di baca_prediksi.py."""


def validasi_nilai(parameter: str, nilai) -> tuple[float | None, str | None]:
    """Periksa satu nilai. Kembalikan (nilai_bersih, alasan).

    ``alasan`` berisi teks untuk log kalau nilai ditolak, ``None`` kalau lolos
    atau kalau nilainya memang kosong sejak awal.
    """
    if nilai is None:
        return None, None

    # bool adalah turunan int di Python (float(True) == 1.0), jadi harus
    # ditolak lebih dulu supaya true/false tidak lolos sebagai 1.0/0.0.
    if isinstance(nilai, bool):
        return None, f"{parameter}={nilai!r} bukan angka"

    try:
        x = float(nilai)
    except (TypeError, ValueError):
        return None, f"{parameter}={nilai!r} bukan angka"

    if math.isnan(x) or math.isinf(x):
        return None, f"{parameter}={nilai!r} bukan angka hingga"

    batas_bawah, batas_atas = BATAS_VALID[parameter]
    if not (batas_bawah <= x <= batas_atas):
        if parameter == "temperature_c" and x in KODE_ERROR_DS18B20:
            return None, f"temperature_c={x:g} adalah kode error DS18B20"
        return None, f"{parameter}={x:g} di luar rentang {batas_bawah:g}-{batas_atas:g}"

    return x, None


def validasi_reading(reading: dict) -> tuple[dict, list[str]]:
    """Validasi ketiga parameter satu reading.

    Kembalikan salinan reading dengan nilai tidak valid diganti ``None``,
    beserta daftar alasan penolakan untuk log. Field lain (device_code, time)
    disalin apa adanya.
    """
    bersih = dict(reading)
    alasan: list[str] = []
    for parameter in PARAMETER:
        nilai, catatan = validasi_nilai(parameter, reading.get(parameter))
        bersih[parameter] = nilai
        if catatan:
            alasan.append(catatan)
    return bersih, alasan


def semua_kosong(reading: dict) -> bool:
    """True kalau ketiga parameter ``None``: baris seperti ini tidak berguna
    disimpan maupun dikirim, karena hanya menghasilkan titik kosong di grafik."""
    return all(reading.get(p) is None for p in PARAMETER)

"""Fuzzy Time Series (metode Chen) untuk prediksi kualitas air satu/beberapa langkah ke depan.

Implementasi sesuai proposal bagian 3.3.7: partisi universe of discourse (rentang
toleransi parameter) jadi m interval sama panjang, fuzzifikasi data historis ke
himpunan fuzzy berbasis interval, pembentukan Fuzzy Logical Relationship (FLR) &
FLRG, lalu peramalan berbasis rata-rata titik tengah FLRG.

Murni Python stdlib — tidak ada dependency eksternal, konsisten dengan
ml/fuzzy/mamdani.py.
"""

import logging
from datetime import datetime, timedelta

logger = logging.getLogger("ml.fuzzy.fts")

# Universe of discourse (rentang toleransi, Tabel 3.19-3.21) + jumlah interval m per parameter.
FTS_PARAMS: dict[str, dict[str, float]] = {
    "suhu": {"d_min": 20.0, "d_max": 35.0, "m": 5},
    "ph": {"d_min": 6.5, "d_max": 9.0, "m": 5},
    "salinitas": {"d_min": 5.0, "d_max": 40.0, "m": 7},
}


def _intervals(parameter: str) -> list[tuple[float, float]]:
    """Bangun m interval sama panjang atas U = [d_min, d_max] (Persamaan 26-27)."""
    p = FTS_PARAMS[parameter]
    d_min, d_max, m = p["d_min"], p["d_max"], int(p["m"])
    length = (d_max - d_min) / m
    return [(d_min + i * length, d_min + (i + 1) * length) for i in range(m)]


def _midpoint(interval: tuple[float, float]) -> float:
    return (interval[0] + interval[1]) / 2


def _fuzzify_index(parameter: str, value: float) -> int:
    """Cari indeks interval (himpunan fuzzy A_i) yang memuat `value` (Persamaan 29).

    Nilai di luar universe of discourse difuzzifikasi ke interval batas terdekat:
    A_1 kalau di bawah D_min, A_m kalau di atas D_max. Sengaja TIDAK dibuang dan
    TIDAK melempar exception — data sensor riil (mis. dataset NERR musim dingin)
    memang keluar universe, dan membuangnya justru memutus deret waktu.
    Hitungannya dilaporkan sekali per batch oleh _fuzzify_series().
    """
    intervals = _intervals(parameter)
    if value <= intervals[0][0]:
        return 0
    if value >= intervals[-1][1]:
        return len(intervals) - 1
    for i, (lower, upper) in enumerate(intervals):
        if lower <= value < upper:
            return i
    return len(intervals) - 1


def _fuzzify_series(parameter: str, values: list[float]) -> list[int]:
    """Fuzzifikasi seluruh deret sekaligus + WARNING sekali per batch untuk out-of-range.

    Log-nya per batch (bukan per titik data) supaya deret panjang yang sebagian
    besar di luar universe tidak membanjiri log scheduler.
    """
    p = FTS_PARAMS[parameter]
    below = sum(1 for v in values if v < p["d_min"])
    above = sum(1 for v in values if v > p["d_max"])
    if below or above:
        logger.warning(
            "FTS[%s]: %d/%d nilai di luar universe U=[%.2f, %.2f] "
            "(%d di bawah D_min, %d di atas D_max) difuzzifikasi ke interval batas "
            "terdekat (A1/A_m), tidak dibuang.",
            parameter, below + above, len(values), p["d_min"], p["d_max"], below, above,
        )
    return [_fuzzify_index(parameter, v) for v in values]


def _build_flrg(
    states: list[int],
    times: list[datetime] | None,
    bucket_minutes: int | None,
) -> dict[int, list[int]]:
    """Bangun FLRG (Langkah 5-6): kelompokkan FLR F(t) -> F(t+1) per antecedent.

    Kalau `times` & `bucket_minutes` diberikan, FLR HANYA dibentuk kalau t+1 persis
    `bucket_minutes` setelah t. Data riil punya celah temporal (dataset NERR: 134
    celah >15 menit, terpanjang 67 hari) — kalau dilompati begitu saja, model
    belajar transisi yang tidak pernah terjadi secara fisik. Rantai diputus di
    celah, tapi semua segmen tetap menyumbang ke FLRG yang sama; yang dibuang
    cuma transisi lintas-celah.
    """
    flrg: dict[int, list[int]] = {}
    gap = timedelta(minutes=bucket_minutes) if times and bucket_minutes else None
    for t in range(len(states) - 1):
        if gap is not None and times[t + 1] - times[t] != gap:
            continue
        flrg.setdefault(states[t], []).append(states[t + 1])
    return flrg


def forecast_multi_step(
    parameter: str,
    history: list[float],
    steps: int,
    times: list[datetime] | None = None,
    bucket_minutes: int | None = None,
    flrg: dict[int, list[int]] | None = None,
) -> list[float]:
    """Prediksi `steps` langkah ke depan secara rekursif (recursive multi-step forecast).

    `history` terurut kronologis (lama -> baru); elemen terakhir adalah state F(n).
    `times` (opsional) adalah waktu awal tiap bucket, sejajar dengan `history` —
    dipakai bersama `bucket_minutes` untuk memutus FLR di celah temporal
    (lihat _build_flrg). Tanpa keduanya, deret dianggap rapat tanpa celah.

    `flrg` (opsional) memakai FLRG yang sudah jadi dan TIDAK membangunnya dari
    `history` — dipakai benchmark holdout (FLRG dari data latih, diuji ke data
    uji tahun berbeda) supaya data uji tidak bocor ke model. Salinannya yang
    dipakai, dict milik pemanggil tidak ikut termutasi.

    Alur (Persamaan 32-34/49):
    - Bangun FLR (F(t) -> F(t+1)) dari seluruh histori (Langkah 5).
    - Kelompokkan jadi FLRG per antecedent (Langkah 6).
    - Kasus 1 (FLRG dengan K>=2 relasi) & Kasus 2 (K=1): rata-rata titik tengah
      interval konsekuen. Kasus 3 (tidak ada FLRG untuk state F(n)): titik
      tengah interval F(n) sendiri (Langkah 7).
    - Hasil tiap langkah ikut disisipkan sebagai relasi baru sebelum langkah
      berikutnya, jadi rantai prediksi tetap kontinu.

    Return list sepanjang `steps`, kronologis (elemen pertama = 1 langkah ke depan).
    """
    if steps < 1:
        raise ValueError("steps harus >= 1")
    if len(history) < 2:
        raise ValueError("Butuh minimal 2 titik data historis untuk FTS one-step-ahead")

    intervals = _intervals(parameter)
    states = _fuzzify_series(parameter, history)
    flrg = dict(flrg) if flrg is not None else _build_flrg(states, times, bucket_minutes)

    predictions: list[float] = []
    current_state = states[-1]
    for _ in range(steps):
        consequents = flrg.get(current_state)
        if consequents:
            value = sum(_midpoint(intervals[c]) for c in consequents) / len(consequents)
        else:
            value = _midpoint(intervals[current_state])
        predictions.append(value)

        next_state = _fuzzify_index(parameter, value)
        flrg[current_state] = flrg.get(current_state, []) + [next_state]
        current_state = next_state

    return predictions


def forecast_next(
    parameter: str,
    history: list[float],
    times: list[datetime] | None = None,
    bucket_minutes: int | None = None,
) -> float:
    """Prediksi satu langkah ke depan (Persamaan 32-34/49) dari deret waktu historis."""
    return forecast_multi_step(parameter, history, 1, times, bucket_minutes)[0]


def rmse(actual: list[float], predicted: list[float]) -> float:
    """Root Mean Square Error (Persamaan 39/43/47/50) untuk evaluasi akurasi FTS."""
    if len(actual) != len(predicted) or not actual:
        raise ValueError("actual dan predicted harus punya panjang sama dan tidak kosong")
    n = len(actual)
    return (sum((a - p) ** 2 for a, p in zip(actual, predicted)) / n) ** 0.5

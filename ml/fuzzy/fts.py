"""Fuzzy Time Series (metode Chen) untuk prediksi kualitas air satu/beberapa langkah ke depan.

Implementasi sesuai proposal bagian 3.3.7: partisi universe of discourse (rentang
toleransi parameter) jadi m interval sama panjang, fuzzifikasi data historis ke
himpunan fuzzy berbasis interval, pembentukan Fuzzy Logical Relationship (FLR) &
FLRG, lalu peramalan berbasis rata-rata titik tengah FLRG.

Murni Python stdlib — tidak ada dependency eksternal, konsisten dengan
ml/fuzzy/mamdani.py.
"""

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

    Nilai di luar universe of discourse di-clamp ke interval batas terdekat.
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


def forecast_next(parameter: str, history: list[float]) -> float:
    """Prediksi satu langkah ke depan (Persamaan 32-34/49) dari deret waktu historis.

    `history` harus terurut kronologis (lama -> baru); elemen terakhir adalah
    state F(n) saat ini.

    - Bangun FLR (F(t) -> F(t+1)) dari seluruh histori (Langkah 5).
    - Kelompokkan jadi FLRG per antecedent (Langkah 6).
    - Kasus 1 (FLRG dengan K>=2 relasi) & Kasus 2 (K=1): rata-rata titik tengah
      interval konsekuen. Kasus 3 (tidak ada FLRG untuk state F(n)): titik
      tengah interval F(n) sendiri (Langkah 7).
    """
    if len(history) < 2:
        raise ValueError("Butuh minimal 2 titik data historis untuk FTS one-step-ahead")

    intervals = _intervals(parameter)
    fuzzified = [_fuzzify_index(parameter, y) for y in history]

    flrg: dict[int, list[int]] = {}
    for t in range(len(fuzzified) - 1):
        antecedent = fuzzified[t]
        consequent = fuzzified[t + 1]
        flrg.setdefault(antecedent, []).append(consequent)

    current_state = fuzzified[-1]
    consequents = flrg.get(current_state)

    if not consequents:
        return _midpoint(intervals[current_state])

    return sum(_midpoint(intervals[c]) for c in consequents) / len(consequents)


def forecast_multi_step(parameter: str, history: list[float], steps: int) -> list[float]:
    """Prediksi `steps` langkah ke depan secara rekursif (recursive multi-step forecast).

    Tiap langkah memanggil forecast_next() atas working copy histori yang sudah
    disisipi hasil prediksi langkah sebelumnya — forecast_next() sendiri tetap
    one-step-ahead, tidak diubah.

    Return list sepanjang `steps`, kronologis (elemen pertama = 1 langkah ke depan,
    elemen terakhir = `steps` langkah ke depan).
    """
    if steps < 1:
        raise ValueError("steps harus >= 1")

    working_history = list(history)
    predictions: list[float] = []
    for _ in range(steps):
        next_value = forecast_next(parameter, working_history)
        predictions.append(next_value)
        working_history.append(next_value)

    return predictions


def rmse(actual: list[float], predicted: list[float]) -> float:
    """Root Mean Square Error (Persamaan 39/43/47/50) untuk evaluasi akurasi FTS."""
    if len(actual) != len(predicted) or not actual:
        raise ValueError("actual dan predicted harus punya panjang sama dan tidak kosong")
    n = len(actual)
    return (sum((a - p) ** 2 for a, p in zip(actual, predicted)) / n) ** 0.5

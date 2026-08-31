"""Uji partition of unity fungsi keanggotaan Mamdani (Persamaan 2-16).

Untuk tiap parameter, jumlah derajat keanggotaan SELURUH himpunan harus tepat 1,0
di setiap titik universe. Kalau ada satu titik (a, b, c, d) yang salah ketik saat
disalin dari proposal, lubang/tumpang-tindihnya langsung ketahuan di sini —
tidak perlu ditemukan manual satu per satu.

Murni stdlib + pytest, tidak butuh DB (beda dengan test_kolam_isolation.py).
"""

from ml.fuzzy.mamdani import PARAMETER_SETS, fuzzify

TOLERANCE = 1e-9
STEP = 0.01  # sampling rapat sepanjang universe


def _universe(sets: dict[str, tuple[float, float, float, float]]) -> tuple[float, float]:
    """Batas universe = titik terkiri semua himpunan s.d. titik terkanan."""
    return min(s[0] for s in sets.values()), max(s[3] for s in sets.values())


def test_partition_of_unity():
    for parameter, sets in PARAMETER_SETS.items():
        lower, upper = _universe(sets)
        n_steps = int(round((upper - lower) / STEP))
        violations = []
        for i in range(n_steps + 1):
            x = lower + i * STEP
            total = sum(fuzzify(parameter, x).values())
            if abs(total - 1.0) > TOLERANCE:
                violations.append((round(x, 4), round(total, 6)))

        assert not violations, (
            f"{parameter}: {len(violations)} titik dengan jumlah keanggotaan != 1,0, "
            f"contoh {violations[:5]}"
        )


def test_membership_sets_are_chained():
    """(c, d) himpunan ke-k harus sama dengan (a, b) himpunan ke-(k+1).

    Syarat struktural dari partition of unity — pesan gagalnya menunjuk langsung
    ke pasangan himpunan yang salah, bukan cuma ke titik x yang bermasalah.
    """
    for parameter, sets in PARAMETER_SETS.items():
        ordered = sorted(sets.items(), key=lambda item: item[1])
        for (name_a, a), (name_b, b) in zip(ordered, ordered[1:]):
            assert (a[2], a[3]) == (b[0], b[1]), (
                f"{parameter}: {name_a}{a} dan {name_b}{b} tidak nyambung — "
                f"(c, d)={a[2:]} != (a, b)={b[:2]}"
            )

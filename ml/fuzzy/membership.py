"""Fungsi keanggotaan fuzzy generik (trapesium & segitiga)."""

def trapezoid(x: float, a: float, b: float, c: float, d: float) -> float:
    """Fungsi keanggotaan trapesium T(x; a, b, c, d) — Persamaan 3.3.6.1 proposal.

    a,b = batas awal & puncak kiri (ascending slope); c,d = puncak kanan & batas
    akhir (descending slope). a==b menghasilkan "bahu kiri" (flat di 1 hingga c),
    c==d menghasilkan "bahu kanan" (flat di 1 dari b).
    """
    if b <= x <= c:
        return 1.0
    if x <= a or x >= d:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    return (d - x) / (d - c)


def triangle(x: float, a: float, b: float, c: float) -> float:
    """Fungsi keanggotaan segitiga — kasus khusus trapesium dengan satu titik puncak b."""
    if x == b:
        return 1.0
    if x <= a or x >= c:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    return (c - x) / (c - b)

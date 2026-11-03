"""Klasifikasi kualitas air dengan fuzzy Mamdani, sesuai CD-3 subbab 3.3.6.

Semua angka di berkas ini disalin dari laporan CD-3 dan tidak boleh diubah
tanpa mengubah laporannya juga (CD-4 4.1.1 B: "Fungsi keanggotaan dan basis
aturan Mamdani pada CD-3 tetap digunakan"):

- Fungsi keanggotaan input  : 3.3.6.1, Persamaan (1)-(16)
- Fungsi keanggotaan output : 3.3.6.2, Persamaan (17)-(19)
- Basis aturan              : 3.3.6.3, Tabel 3.17
- Inferensi & defuzzifikasi : 3.3.6.4, Persamaan (20)-(24)
- Pemetaan N* ke status     : Tabel 3.24 (dulu Tabel 3.18)

Status kolam = parameter dengan kategori terburuk (CD-4 4.1.1 B).

Berkas ini berdiri sendiri (hanya pustaka standar), jadi cukup disalin satu
berkas ke Raspberry Pi.
"""


# ---------------------------------------------------------------------------
# Fungsi keanggotaan
# ---------------------------------------------------------------------------

def trapmf(x: float, a: float, b: float, c: float, d: float) -> float:
    """trapmf(x; a, b, c, d), Persamaan (1).

    Himpunan paling pinggir ditulis di CD-3 dengan a = b (bahu kiri, mis.
    Sangat Rendah suhu: mu = 1 untuk T <= 18) atau c = d (bahu kanan, mis.
    Sangat Tinggi suhu: mu = 1 untuk T >= 35). Bahu itu berlaku juga di luar
    universe of discourse, jadi suhu 14 °C tetap Sangat Rendah = 1, bukan 0.
    Tanpa aturan ini, nilai ekstrem di luar universe tidak masuk himpunan mana
    pun dan centroid-nya jatuh ke 0 (Aman), padahal seharusnya Bahaya.
    """
    if a == b and x <= b:
        return 1.0
    if c == d and x >= c:
        return 1.0
    if x <= a or x >= d:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    if x <= c:
        return 1.0
    return (d - x) / (d - c)


def trimf(x: float, a: float, b: float, c: float) -> float:
    """trimf(x; a, b, c), dipakai himpunan output Waspada, Persamaan (18)."""
    if x <= a or x >= c:
        return 0.0
    if x <= b:
        return (x - a) / (b - a)
    return (c - x) / (c - b)


# ---------------------------------------------------------------------------
# 3.3.6.1 Fungsi keanggotaan input (lima himpunan trapesium per parameter)
# ---------------------------------------------------------------------------

PARAMETER_SETS: dict[str, dict[str, tuple[float, float, float, float]]] = {
    # A. Suhu (T), U_T = [15, 45] °C, toleransi [20, 35], optimal [28, 30]
    "suhu": {
        "sangat_rendah": (15, 15, 18, 20),  # (2)
        "rendah": (18, 20, 24, 28),         # (3)
        "normal": (26, 28, 30, 32),         # (4)
        "tinggi": (30, 32, 33, 35),         # (5)
        "sangat_tinggi": (33, 35, 45, 45),  # (6)
    },
    # B. pH, U_pH = [4, 11], toleransi [6,5; 9,0], optimal [7,5; 8,5]
    "ph": {
        "sangat_asam": (4.0, 4.0, 6.0, 6.5),    # (7)
        "asam": (6.0, 6.5, 7.0, 7.5),           # (8)
        "normal": (7.0, 7.5, 8.5, 9.0),         # (9)
        "basa": (8.5, 9.0, 9.5, 10.0),          # (10)
        "sangat_basa": (9.5, 10.0, 11.0, 11.0), # (11)
    },
    # C. Salinitas (S), U_S = [0, 50] ppt, toleransi [5, 40], optimal [10, 30]
    "salinitas": {
        "sangat_rendah": (0, 0, 3, 5),      # (12)
        "rendah": (3, 5, 8, 10),            # (13)
        "normal": (8, 10, 30, 32),          # (14)
        "tinggi": (30, 32, 38, 40),         # (15)
        "sangat_tinggi": (38, 40, 50, 50),  # (16)
    },
}


# ---------------------------------------------------------------------------
# 3.3.6.2 Fungsi keanggotaan output, U_N = [0, 100]
# ---------------------------------------------------------------------------

def _mu_aman(n: float) -> float:
    return trapmf(n, 0, 0, 25, 40)  # (17)


def _mu_waspada(n: float) -> float:
    return trimf(n, 30, 50, 70)  # (18)


def _mu_bahaya(n: float) -> float:
    return trapmf(n, 60, 75, 100, 100)  # (19)


OUTPUT_SETS = {"aman": _mu_aman, "waspada": _mu_waspada, "bahaya": _mu_bahaya}


# ---------------------------------------------------------------------------
# 3.3.6.3 Basis aturan, Tabel 3.17 (lima aturan IF-THEN per parameter)
# ---------------------------------------------------------------------------

RULES: dict[str, dict[str, str]] = {
    "suhu": {
        "sangat_rendah": "bahaya",  # R1  T < 20 °C
        "rendah": "waspada",        # R2  20 <= T < 28 °C
        "normal": "aman",           # R3  28 <= T <= 30 °C
        "tinggi": "waspada",        # R4  30 < T <= 35 °C
        "sangat_tinggi": "bahaya",  # R5  T > 35 °C
    },
    "ph": {
        "sangat_asam": "bahaya",    # R1  pH < 6,5
        "asam": "waspada",          # R2  6,5 <= pH < 7,5
        "normal": "aman",           # R3  7,5 <= pH <= 8,5
        "basa": "waspada",          # R4  8,5 < pH <= 9,0
        "sangat_basa": "bahaya",    # R5  pH > 9,0
    },
    "salinitas": {
        "sangat_rendah": "bahaya",  # R1  S < 5 ppt
        "rendah": "waspada",        # R2  5 <= S < 10 ppt
        "normal": "aman",           # R3  10 <= S <= 30 ppt
        "tinggi": "waspada",        # R4  30 < S <= 40 ppt
        "sangat_tinggi": "bahaya",  # R5  S > 40 ppt
    },
}


# ---------------------------------------------------------------------------
# 3.3.6.4 Inferensi & defuzzifikasi, Tabel 3.24
# ---------------------------------------------------------------------------

#: Resolusi Δ defuzzifikasi diskrit pada U_N = [0, 100], Persamaan (24).
DEFUZZ_RESOLUTION = 0.5

#: Batas N*, Tabel 3.24: [0, 40) Aman, [40, 65) Waspada, [65, 100] Bahaya.
N_WASPADA_MIN = 40.0
N_BAHAYA_MIN = 65.0

# Label status di laporan (Aman/Waspada/Bahaya) -> nilai kolom
# quality_category di database backend.
CATEGORY_TO_DB = {"aman": "baik", "waspada": "sedang", "bahaya": "buruk"}
_SEVERITY_ORDER = {"baik": 0, "sedang": 1, "buruk": 2}

#: Dipakai edge_pipeline.py untuk tahu kategori mana yang memicu notifikasi.
ANOMALY_CATEGORIES = {"sedang", "buruk"}


def fuzzify(parameter: str, value: float) -> dict[str, float]:
    """Derajat keanggotaan nilai crisp di kelima himpunan input parameter."""
    return {name: trapmf(value, *abcd) for name, abcd in PARAMETER_SETS[parameter].items()}


def _firing_strengths(parameter: str, memberships: dict[str, float]) -> dict[str, float]:
    """alpha_i, Persamaan (20). Tiap aturan cuma punya satu antecedent, jadi
    alpha_i = derajat keanggotaan himpunannya. Aturan dengan consequent sama
    (mis. R2 dan R4 sama-sama Waspada) digabung dengan max sejak awal: hasil
    agregasi Persamaan (22) tetap sama."""
    alpha = {"aman": 0.0, "waspada": 0.0, "bahaya": 0.0}
    for set_name, degree in memberships.items():
        output = RULES[parameter][set_name]
        alpha[output] = max(alpha[output], degree)
    return alpha


def _centroid(alpha: dict[str, float]) -> float:
    """N* metode centroid diskrit, Persamaan (21)-(24).

    mu_i'(N)  = min(alpha_i, mu_output_i(N))        (21)
    mu_agg(N) = max(mu_1'(N), ..., mu_5'(N))        (22)
    N*        = sum(N_k * mu_agg(N_k)) / sum(mu_agg(N_k))   (24)
    """
    steps = int(round(100 / DEFUZZ_RESOLUTION))
    numerator = 0.0
    denominator = 0.0
    for k in range(steps + 1):
        n = k * DEFUZZ_RESOLUTION
        mu_agg = max(min(alpha[cat], mu(n)) for cat, mu in OUTPUT_SETS.items())
        numerator += n * mu_agg
        denominator += mu_agg
    # Dengan bahu terbuka di himpunan pinggir, setiap nilai input masuk minimal
    # satu himpunan, jadi denominator tidak pernah 0. Penjaga ini cuma untuk
    # input NaN.
    if denominator == 0.0:
        return 0.0
    return numerator / denominator


def status_from_n(n_star: float) -> str:
    """Pemetaan N* ke status, Tabel 3.24."""
    if n_star < N_WASPADA_MIN:
        return "aman"
    if n_star < N_BAHAYA_MIN:
        return "waspada"
    return "bahaya"


def infer_parameter(parameter: str, value: float) -> tuple[float, str, dict[str, float]]:
    """Satu sistem Mamdani untuk satu parameter: (N*, status, keanggotaan)."""
    memberships = fuzzify(parameter, value)
    alpha = _firing_strengths(parameter, memberships)
    n_star = _centroid(alpha)
    return n_star, status_from_n(n_star), memberships


def classify_water_quality(ph: float, temperature_c: float, salinity_ppt: float) -> dict:
    """Klasifikasi kualitas air dari tiga parameter.

    Tiga sistem Mamdani terpisah (suhu, pH, salinitas) sesuai CD-3, lalu
    status kolam mengikuti parameter dengan kategori terburuk (CD-4 4.1.1 B).
    Rincian per parameter dikirim apa adanya ke backend di membership_degrees.
    """
    per_parameter = {}
    for parameter, value in (("suhu", temperature_c), ("ph", ph), ("salinitas", salinity_ppt)):
        n_star, status, memberships = infer_parameter(parameter, value)
        per_parameter[parameter] = {
            "value": value,
            "score": round(n_star, 2),
            "category": CATEGORY_TO_DB[status],
            "membership": {name: round(degree, 4) for name, degree in memberships.items()},
        }

    overall_category = max(
        (p["category"] for p in per_parameter.values()), key=lambda c: _SEVERITY_ORDER[c]
    )
    # Skor kolam = N* terbesar. Status naik searah N* (Tabel 3.24), jadi N*
    # terbesar selalu milik parameter dengan kategori terburuk.
    overall_score = max(p["score"] for p in per_parameter.values())

    return {
        "quality_score": round(overall_score, 2),
        "quality_category": overall_category,
        "membership_degrees": per_parameter,
    }

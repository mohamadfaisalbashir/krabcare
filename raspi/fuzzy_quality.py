"""Klasifikasi kualitas air (Fuzzy Inference System Mamdani), jalan di Raspi5.

Satu file berdiri sendiri (tidak import modul lain di repo), tinggal copy ke Raspi
tanpa perlu bawa seisi repo. Rumusnya dites terhadap acuan skripsi bagian 3.3.6.

Murni stdlib. Tidak butuh histori/buffer apa pun, klasifikasi ini SEKALI JALAN
per reading (beda dari forecast WLR di wlr_forecast.py yang butuh histori).
"""


def trapezoid(x: float, a: float, b: float, c: float, d: float) -> float:
    """T(x; a, b, c, d), Persamaan 3.3.6.1 proposal."""
    if b <= x <= c:
        return 1.0
    if x <= a or x >= d:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    return (d - x) / (d - c)


def triangle(x: float, a: float, b: float, c: float) -> float:
    if x == b:
        return 1.0
    if x <= a or x >= c:
        return 0.0
    if x < b:
        return (x - a) / (b - a)
    return (c - x) / (c - b)


PARAMETER_SETS: dict[str, dict[str, tuple[float, float, float, float]]] = {
    "suhu": {
        "sangat_rendah": (15, 15, 18, 20),
        "rendah": (18, 20, 24, 28),
        "normal": (24, 28, 30, 32),
        "tinggi": (30, 32, 33, 35),
        "sangat_tinggi": (33, 35, 45, 45),
    },
    "ph": {
        "sangat_asam": (4, 4, 6.0, 6.5),
        "asam": (6.0, 6.5, 7.0, 7.5),
        "normal": (7.0, 7.5, 8.5, 9.0),
        "basa": (8.5, 9.0, 9.5, 10.0),
        "sangat_basa": (9.5, 10.0, 11, 11),
    },
    "salinitas": {
        "sangat_rendah": (0, 0, 3, 5),
        "rendah": (3, 5, 8, 10),
        "normal": (8, 10, 30, 32),
        "tinggi": (30, 32, 38, 40),
        "sangat_tinggi": (38, 40, 50, 50),
    },
}

RULE_MAP: dict[str, str] = {
    "sangat_rendah": "bahaya",
    "rendah": "waspada",
    "normal": "aman",
    "tinggi": "waspada",
    "sangat_tinggi": "bahaya",
    "sangat_asam": "bahaya",
    "asam": "waspada",
    "basa": "waspada",
    "sangat_basa": "bahaya",
}

_OUTPUT_SHAPES = {
    "aman": (trapezoid, (0, 0, 25, 40)),
    "waspada": (triangle, (30, 50, 70)),
    "bahaya": (trapezoid, (60, 75, 100, 100)),
}

_DEFUZZ_RESOLUTION = 0.5
_SCORE_WASPADA_MIN = 40
_SCORE_BAHAYA_MIN = 65

CATEGORY_TO_DB = {"aman": "baik", "waspada": "sedang", "bahaya": "buruk"}
_SEVERITY_ORDER = {"baik": 0, "sedang": 1, "buruk": 2}

#: Dipakai edge_pipeline.py buat tahu kategori mana yang perlu memicu notifikasi.
ANOMALY_CATEGORIES = {"sedang", "buruk"}


def fuzzify(parameter: str, value: float) -> dict[str, float]:
    return {name: trapezoid(value, *params) for name, params in PARAMETER_SETS[parameter].items()}


def _output_membership(category: str, x: float) -> float:
    func, params = _OUTPUT_SHAPES[category]
    return func(x, *params)


def _centroid(firing_by_category: dict[str, float]) -> float:
    numerator = 0.0
    denominator = 0.0
    x = 0.0
    while x <= 100:
        clipped = max(
            min(firing_by_category[category], _output_membership(category, x))
            for category in ("aman", "waspada", "bahaya")
        )
        numerator += x * clipped
        denominator += clipped
        x += _DEFUZZ_RESOLUTION
    if denominator == 0.0:
        return 0.0
    return numerator / denominator


def _classify_score(score: float) -> str:
    if score < _SCORE_WASPADA_MIN:
        return "aman"
    if score < _SCORE_BAHAYA_MIN:
        return "waspada"
    return "bahaya"


def infer_parameter(parameter: str, value: float) -> tuple[float, str, dict[str, float]]:
    memberships = fuzzify(parameter, value)
    firing_by_category = {"aman": 0.0, "waspada": 0.0, "bahaya": 0.0}
    for set_name, degree in memberships.items():
        category = RULE_MAP[set_name]
        firing_by_category[category] = max(firing_by_category[category], degree)
    score = _centroid(firing_by_category)
    category = _classify_score(score)
    return score, category, memberships


def classify_water_quality(ph: float, temperature_c: float, salinity_ppt: float) -> dict:
    """Klasifikasi kualitas air dari 3 parameter (proposal 3.3.6).

    3 sistem Mamdani independen (suhu, pH, salinitas) digabung jadi satu
    quality_score/quality_category lewat prinsip worst-case (parameter kondisi
    terburuk menentukan status keseluruhan). Rincian per parameter tetap ada
    di membership_degrees, dikirim apa adanya ke backend."""
    per_parameter = {}
    for parameter, value in (("suhu", temperature_c), ("ph", ph), ("salinitas", salinity_ppt)):
        score, category, memberships = infer_parameter(parameter, value)
        per_parameter[parameter] = {
            "value": value,
            "score": round(score, 2),
            "category": CATEGORY_TO_DB[category],
            "membership": {name: round(degree, 4) for name, degree in memberships.items()},
        }

    overall_category = max(
        (p["category"] for p in per_parameter.values()), key=lambda c: _SEVERITY_ORDER[c]
    )
    overall_score = max(p["score"] for p in per_parameter.values())

    return {
        "quality_score": round(overall_score, 2),
        "quality_category": overall_category,
        "membership_degrees": per_parameter,
    }

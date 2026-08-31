"""Fuzzy Inference System Mamdani untuk klasifikasi kualitas air budidaya kepiting."""

from .membership import trapezoid, triangle

# Himpunan input per parameter: nama -> (a, b, c, d) fungsi trapesium (Persamaan 2-16).
#
# Invarian yang dipegang seluruh himpunan: (c, d) himpunan ke-k == (a, b) himpunan
# ke-(k+1). Itu yang membuat jumlah derajat keanggotaan selalu tepat 1,0 di setiap
# titik universe (partition of unity) — diuji di backend/tests/test_membership_partition.py.
# Suhu "normal" di proposal tertulis (26, 28, 30, 32); nilai a=26 melanggar invarian
# tersebut (menyisakan lubang di 24-28 dengan jumlah keanggotaan cuma 0,75) sementara
# 14 himpunan lain patuh, jadi dikoreksi ke a=24 mengikuti (c, d) himpunan "rendah".
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

# Basis aturan (Tabel 3.17) — pola simetris sama untuk ketiga parameter:
# himpunan ekstrem ("sangat_*") -> bahaya, himpunan ringan -> waspada, normal -> aman.
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

# Himpunan output Notifikasi, U_N = [0, 100] (Persamaan 17-19).
_OUTPUT_SHAPES = {
    "aman": (trapezoid, (0, 0, 25, 40)),
    "waspada": (triangle, (30, 50, 70)),
    "bahaya": (trapezoid, (60, 75, 100, 100)),
}

_DEFUZZ_RESOLUTION = 0.5  # step diskritisasi centroid atas U_N

# Klasifikasi skor crisp N* (Tabel 3.18).
_SCORE_WASPADA_MIN = 40
_SCORE_BAHAYA_MIN = 65

# Pemetaan nama kategori proposal (Aman/Waspada/Bahaya) ke enum yang sudah ada
# di backend (app.models.enums.WaterQualityCategory: baik/sedang/buruk).
CATEGORY_TO_DB = {"aman": "baik", "waspada": "sedang", "bahaya": "buruk"}

_SEVERITY_ORDER = {"baik": 0, "sedang": 1, "buruk": 2}

# Kategori (nilai DB baik/sedang/buruk) yang dianggap anomali — dipakai backend
# (ml_pipeline_service, notification_service) & script ml/scripts/scan_anomaly.py
# untuk memicu notifikasi/peringatan.
ANOMALY_CATEGORIES = {"sedang", "buruk"}


def fuzzify(parameter: str, value: float) -> dict[str, float]:
    """Derajat keanggotaan `value` di tiap himpunan input `parameter`."""
    return {
        name: trapezoid(value, *params) for name, params in PARAMETER_SETS[parameter].items()
    }


def _output_membership(category: str, x: float) -> float:
    func, params = _OUTPUT_SHAPES[category]
    return func(x, *params)


def _centroid(firing_by_category: dict[str, float]) -> float:
    """Defuzzifikasi Centroid diskrit (Persamaan 24) dari hasil agregasi max (Persamaan 22)."""
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
    """Jalankan satu sistem Mamdani (fuzzifikasi -> rule firing -> agregasi -> centroid)
    untuk satu parameter. Return (skor N* 0-100, kategori aman/waspada/bahaya, derajat
    keanggotaan input per himpunan).
    """
    memberships = fuzzify(parameter, value)

    firing_by_category = {"aman": 0.0, "waspada": 0.0, "bahaya": 0.0}
    for set_name, degree in memberships.items():
        category = RULE_MAP[set_name]
        firing_by_category[category] = max(firing_by_category[category], degree)

    score = _centroid(firing_by_category)
    category = _classify_score(score)
    return score, category, memberships


def classify_water_quality(ph: float, temperature_c: float, salinity_ppt: float) -> dict:
    """Klasifikasi kualitas air dari 3 parameter, sesuai proposal 3.3.6.

    Menjalankan 3 sistem Mamdani independen (suhu, pH, salinitas), lalu
    menggabungkan jadi satu quality_score/quality_category dengan prinsip
    worst-case (parameter dengan kondisi terburuk menentukan status keseluruhan)
    supaya sesuai bentuk satu-baris-per-waktu pada tabel `fuzzy_classifications`.
    Rincian tiap parameter tetap disimpan lengkap di `membership_degrees`.
    """
    per_parameter = {}
    for parameter, value in (
        ("suhu", temperature_c),
        ("ph", ph),
        ("salinitas", salinity_ppt),
    ):
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

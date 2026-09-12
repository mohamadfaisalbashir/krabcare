"""Spesiasi amonia: fraksi NH3 tak terionisasi dari pH, suhu, dan salinitas.

Modul ini menghitung berapa persen Total Ammonia Nitrogen (TAN) yang berada
dalam bentuk NH3 yang toksik. Ia tidak menghitung konsentrasi amonia (mg/L),
karena TAN tidak diukur sistem ini (sensor gas amonia dilepas dari hardware
per UAT 2025-11-20). Pemanggil yang butuh mg/L harus menyediakan nilai TAN
sendiri; modul ini tidak menyediakan fungsi untuk itu.

Rujukan:
[1] Emerson et al. 1975, J. Fish. Res. Board Can. 32(12):2379-2383.
[2] Bower & Bidwell 1978, J. Fish. Res. Board Can. 35(7):1012-1016.
[3] Spotte & Adams 1983, Mar. Ecol. Prog. Ser. 10:207-210 (dikoreksi
    menurut Florida DEP SOP).
"""

from dataclasses import dataclass
from enum import Enum


# Rentang berlaku persamaan terkoreksi salinitas.
VALID_SALINITY_PPT = (5.0, 35.0)
VALID_TEMPERATURE_C = (5.0, 35.0)
VALID_PH = (7.8, 8.3)

#: Disimpan di kolom `model_version` tabel ammonia_risks. Naikkan kalau rumus
#: atau ambangnya diganti, supaya baris lama masih bisa dibedakan.
MODEL_VERSION = "speciation-bb78"


class RiskLevel(str, Enum):
    NORMAL = "normal"
    PERHATIAN = "perhatian"
    BERBAHAYA = "berbahaya"


@dataclass(frozen=True)
class AmmoniaRiskResult:
    fraction_nh3: float          # 0.0-1.0, fraction of TAN that would be NH3
    fraction_nh3_pct: float      # same, as percentage, for display
    pka: float                   # dissociation constant used
    risk_level: RiskLevel
    in_valid_range: bool         # False = extrapolated beyond validated envelope
    input_ph: float
    input_temperature_c: float
    input_salinity_ppt: float


def _ionic_strength(salinity_ppt: float) -> float:
    return 19.9273 * salinity_ppt / (1000.0 - 1.005109 * salinity_ppt)


def _pka_saline(temperature_c: float, salinity_ppt: float) -> float:
    ionic = _ionic_strength(salinity_ppt)
    return (
        0.0901821
        + 2729.92 / (temperature_c + 273.2)
        + (0.1552 - 0.0003142 * temperature_c) * ionic
    )


def _pka_freshwater(temperature_c: float) -> float:
    return 0.09018 + 2729.92 / (temperature_c + 273.15)


def nh3_fraction(ph: float, temperature_c: float, salinity_ppt: float) -> tuple[float, float]:
    """Kembalikan (fraction, pKa_used). Fraction dalam rentang 0.0-1.0."""
    pka = _pka_freshwater(temperature_c) if salinity_ppt == 0 else _pka_saline(
        temperature_c, salinity_ppt
    )
    fraction = 1.0 / (1.0 + 10.0 ** (pka - ph))
    return fraction, pka


def _in_valid_range(ph: float, temperature_c: float, salinity_ppt: float) -> bool:
    return (
        VALID_PH[0] <= ph <= VALID_PH[1]
        and VALID_TEMPERATURE_C[0] <= temperature_c <= VALID_TEMPERATURE_C[1]
        and VALID_SALINITY_PPT[0] <= salinity_ppt <= VALID_SALINITY_PPT[1]
    )


def classify_risk(fraction_pct: float) -> RiskLevel:
    """Ambang pada fraksi NH3 (%), bukan pada konsentrasi mg/L.

    Angkanya ilustratif, dari tabel sensitivitas di estimasi_amonia.md Bagian
    6.1, bukan baku mutu resmi krustasea. Ganti di sini kalau ada ambang
    definitif untuk Scylla spp., dan catat sumbernya.
    """
    if fraction_pct < 6.0:
        return RiskLevel.NORMAL
    if fraction_pct < 15.0:
        return RiskLevel.PERHATIAN
    return RiskLevel.BERBAHAYA


def assess_ammonia_risk(
    ph: float, temperature_c: float, salinity_ppt: float
) -> AmmoniaRiskResult:
    """Entry point utama. Tidak memerlukan dan tidak menerima nilai TAN."""
    fraction, pka = nh3_fraction(ph, temperature_c, salinity_ppt)
    fraction_pct = fraction * 100.0
    return AmmoniaRiskResult(
        fraction_nh3=fraction,
        fraction_nh3_pct=fraction_pct,
        pka=pka,
        risk_level=classify_risk(fraction_pct),
        in_valid_range=_in_valid_range(ph, temperature_c, salinity_ppt),
        input_ph=ph,
        input_temperature_c=temperature_c,
        input_salinity_ppt=salinity_ppt,
    )

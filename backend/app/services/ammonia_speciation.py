"""
Ammonia speciation (Opsi 1): un-ionized ammonia (NH3) FRACTION from
pH, temperature, and salinity — no TAN measurement required.

SCIENTIFIC SCOPE — READ BEFORE MODIFYING
------------------------------------------
This module computes what FRACTION of Total Ammonia Nitrogen (TAN) would
be in the toxic un-ionized form (NH3) at a given pH/temperature/salinity.
It does NOT and CANNOT compute an absolute ammonia concentration (mg/L),
because TAN is not measured by this system (ammonia gas sensor removed
from hardware per UAT 2025-11-20). Any caller wanting mg/L must supply
an assumed or measured TAN value explicitly — this module deliberately
offers no such function.

References:
[1] Emerson et al. 1975, J. Fish. Res. Board Can. 32(12):2379-2383.
[2] Bower & Bidwell 1978, J. Fish. Res. Board Can. 35(7):1012-1016.
[3] Spotte & Adams 1983, Mar. Ecol. Prog. Ser. 10:207-210 (corrected
    per Florida DEP SOP).
"""

from dataclasses import dataclass
from enum import Enum


# Validity envelope of the salinity-corrected equation.
VALID_SALINITY_PPT = (5.0, 35.0)
VALID_TEMPERATURE_C = (5.0, 35.0)
VALID_PH = (7.8, 8.3)

#: Ikut disimpan di kolom `model_version` tabel ammonia_risks — kalau rumus atau
#: ambangnya diganti, naikkan nilainya supaya baris lama masih bisa dibedakan.
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
    """Returns (fraction, pKa_used). Fraction is 0.0-1.0."""
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
    """Threshold pada fraksi NH3 (%), BUKAN pada konsentrasi mg/L.

    Ambang berikut ilustratif berdasarkan tabel sensitivitas (lihat dokumen
    estimasi_amonia.md Bagian 6.1) — bukan baku mutu resmi krustasea. Kalau
    pembimbing/mitra punya ambang definitif untuk Scylla spp., ganti di sini
    dan catat sumbernya.
    """
    if fraction_pct < 6.0:
        return RiskLevel.NORMAL
    if fraction_pct < 15.0:
        return RiskLevel.PERHATIAN
    return RiskLevel.BERBAHAYA


def assess_ammonia_risk(
    ph: float, temperature_c: float, salinity_ppt: float
) -> AmmoniaRiskResult:
    """Entry point utama Opsi 1. TIDAK memerlukan dan TIDAK menerima TAN."""
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

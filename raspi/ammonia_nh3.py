"""Estimasi fraksi risiko amonia (NH3), jalan di Raspi5.

Duplikat persis dari backend/app/services/ammonia_speciation.py, dua salinan
ini WAJIB tetap identik (kalau rumus/ambang berubah, ubah dua-duanya, dan
naikkan MODEL_VERSION di sini SEKALIGUS di sana).

SCIENTIFIC SCOPE. Modul ini menghitung FRAKSI Total Ammonia Nitrogen (TAN)
yang berbentuk NH3 toksik pada pH/suhu/salinitas tertentu. TIDAK menghitung
konsentrasi mg/L, karena sensor amonia tidak terpasang di hardware ini.

Referensi:
[1] Hopton, C. M., Nienow, P., & Cockell, C. S. (2025). Ammonia sets limit to life and alters physiology independently of pH in Halomonas meridiana. Scientific Reports, 15, 19549.  
[2] Florida Department of Environmental Protection. (2001). Chemistry Laboratory Methods Manual: Calculation of Un-ionized Ammonia in Fresh Water (Revision 2). Tallahassee, FL: FDEP.
"""

from dataclasses import dataclass
from enum import Enum

VALID_SALINITY_PPT = (5.0, 35.0)
VALID_TEMPERATURE_C = (5.0, 35.0)
VALID_PH = (7.8, 8.3)

#: SAMA dengan MODEL_VERSION backend/app/services/ammonia_speciation.py, jangan
#: dibedakan, ini rumus yang sama, cuma beda tempat jalannya.
MODEL_VERSION = "speciation-bb78"


class RiskLevel(str, Enum):
    NORMAL = "normal"
    PERHATIAN = "perhatian"
    BERBAHAYA = "berbahaya"


@dataclass(frozen=True)
class AmmoniaRiskResult:
    fraction_nh3: float
    fraction_nh3_pct: float
    pka: float
    risk_level: RiskLevel
    in_valid_range: bool
    input_ph: float
    input_temperature_c: float
    input_salinity_ppt: float


def _ionic_strength(salinity_ppt: float) -> float:
    return 19.9273 * salinity_ppt / (1000.0 - 1.005109 * salinity_ppt)


def _pka_saline(temperature_c: float, salinity_ppt: float) -> float:
    ionic = _ionic_strength(salinity_ppt)
    return (
        0.0901821 + 2729.92 / (temperature_c + 273.2) + (0.1552 - 0.0003142 * temperature_c) * ionic
    )


def _pka_freshwater(temperature_c: float) -> float:
    return 0.09018 + 2729.92 / (temperature_c + 273.15)


def nh3_fraction(ph: float, temperature_c: float, salinity_ppt: float) -> tuple[float, float]:
    """Return (fraction 0.0-1.0, pKa yang dipakai)."""
    pka = (
        _pka_freshwater(temperature_c)
        if salinity_ppt == 0
        else _pka_saline(temperature_c, salinity_ppt)
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
    """Ambang ilustratif (bukan baku mutu resmi krustasea), lihat catatan
    di backend/app/services/ammonia_speciation.py kalau perlu diganti."""
    if fraction_pct < 6.0:
        return RiskLevel.NORMAL
    if fraction_pct < 15.0:
        return RiskLevel.PERHATIAN
    return RiskLevel.BERBAHAYA


def assess_ammonia_risk(ph: float, temperature_c: float, salinity_ppt: float) -> AmmoniaRiskResult:
    """Entry point utama. TIDAK memerlukan dan TIDAK menerima TAN."""
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

"""Schema indeks risiko toksisitas amonia — FRAKSI NH3, bukan konsentrasi mg/L."""

from datetime import datetime

from pydantic import BaseModel, Field

#: Ditempel di setiap response supaya angkanya tidak pernah lepas dari batasannya.
#: Jangan dipendekkan: inilah yang membedakan "estimasi fraksi" dari klaim
#: pengukuran yang tidak dimiliki sistem ini (amonia.md:7-8).
DISCLAIMER = (
    "Ini estimasi fraksi risiko dari model kesetimbangan kimia, BUKAN "
    "pengukuran atau prediksi konsentrasi amonia dalam mg/L. Sensor "
    "amonia tidak terpasang pada sistem ini."
)


class AmmoniaRiskOut(BaseModel):
    """Estimasi FRAKSI amonia tak-terionisasi (bukan konsentrasi mg/L).

    Dihitung dari pH, suhu, dan salinitas menggunakan persamaan kesetimbangan
    kimia (Bower & Bidwell 1978 / Spotte & Adams 1983). Tidak memerlukan dan
    tidak menghasilkan nilai TAN — lihat catatan `disclaimer`.
    """

    time: datetime
    target_time: datetime
    horizon_minutes: int = Field(
        ..., description="0 = kondisi terukur dari sensor; >0 = ramalan FTS sekian menit ke depan"
    )
    fraction_nh3_pct: float | None = Field(
        None, description="Persen TAN yang berbentuk NH3 toksik pada kondisi ini"
    )
    risk_level: str | None
    in_valid_range: bool = Field(
        ...,
        description=(
            "False = pH/suhu/salinitas di luar rentang tervalidasi persamaan, hasil ekstrapolasi"
        ),
    )
    input_ph: float | None
    input_temperature_c: float | None
    input_salinity_ppt: float | None
    model_version: str

    model_config = {"from_attributes": True}


class AmmoniaRiskLogOut(AmmoniaRiskOut):
    """Satu baris log historis — sama seperti di atas plus identitas device."""

    device_id: int
    device_code: str | None


class DeviceAmmoniaOut(BaseModel):
    """Risiko amonia satu device: kondisi terukur terkini + horizon ramalan."""

    device_id: int
    device_code: str | None
    current: AmmoniaRiskOut | None = None
    forecast: list[AmmoniaRiskOut] = []
    disclaimer: str = DISCLAIMER

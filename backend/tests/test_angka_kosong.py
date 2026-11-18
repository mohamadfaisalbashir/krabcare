"""NaN dan nilai kosong dari sensor disimpan NULL, bukan ditolak."""

import math

import pytest
from pydantic import ValidationError

from app.schemas.sensor_reading import SensorReadingIn

WAKTU = "2026-11-18T10:00:00+07:00"


def test_nan_dan_kosong_jadi_none():
    r = SensorReadingIn(
        device_code="X", time=WAKTU, ph=math.nan, temperature_c="", salinity_ppt="NaN"
    )
    assert (r.ph, r.temperature_c, r.salinity_ppt) == (None, None, None)
    assert SensorReadingIn(device_code="X", time=WAKTU, temperature_c=math.inf).temperature_c is None


def test_angka_biasa_tetap_dan_batas_tetap_berlaku():
    assert SensorReadingIn(device_code="X", time=WAKTU, ph=7.2).ph == 7.2
    assert SensorReadingIn(device_code="X", time=WAKTU, ph="7.2").ph == 7.2
    with pytest.raises(ValidationError):
        SensorReadingIn(device_code="X", time=WAKTU, ph=15)

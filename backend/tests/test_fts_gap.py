"""Uji FLR tidak dibentuk melintasi celah temporal (ml/fuzzy/fts.py:_build_flrg).

Data riil punya celah — device offline, sensor di-maintenance, atau (dataset NERR)
lubang berbulan-bulan. Kalau FLR dibentuk melompati celah itu, model belajar
transisi yang tidak pernah terjadi secara fisik.

Murni stdlib + pytest, tidak butuh DB.
"""

from datetime import datetime, timedelta

from ml.fuzzy.fts import _build_flrg, _fuzzify_series, forecast_multi_step

BUCKET_MINUTES = 60
START = datetime(2024, 6, 1, 0, 0)


def _hourly(n: int) -> list[datetime]:
    return [START + timedelta(hours=i) for i in range(n)]


def test_flr_putus_di_celah():
    """Deret 5 titik dengan celah 3 jam di tengah -> hanya FLR intra-segmen yang terbentuk."""
    values = [21.0, 27.0, 33.0, 21.0, 27.0]
    states = _fuzzify_series("suhu", values)
    assert states == [0, 2, 4, 0, 2], states

    times = _hourly(3) + [START + timedelta(hours=5), START + timedelta(hours=6)]

    rapat = _build_flrg(states, _hourly(5), BUCKET_MINUTES)
    assert rapat == {0: [2, 2], 2: [4], 4: [0]}, rapat

    # Transisi 4 -> 0 melintasi celah 3 jam, harus hilang. Segmen kedua (0 -> 2)
    # tetap ikut menyumbang ke FLRG yang sama.
    bercelah = _build_flrg(states, times, BUCKET_MINUTES)
    assert bercelah == {0: [2, 2], 2: [4]}, bercelah


def test_tanpa_times_deret_dianggap_rapat():
    """Backward compatible: tanpa times/bucket_minutes, semua pasangan jadi FLR."""
    states = _fuzzify_series("suhu", [21.0, 27.0, 33.0, 21.0, 27.0])
    assert _build_flrg(states, None, None) == _build_flrg(states, _hourly(5), BUCKET_MINUTES)


def test_forecast_berubah_kalau_celah_diperhitungkan():
    """Celah yang diabaikan vs diperhitungkan harus menghasilkan ramalan berbeda.

    Kalau tidak, argumen times/bucket_minutes cuma dekorasi dan bug-nya lolos diam-diam.
    """
    # State [4, 2, 0, 4]; celah ada di pasangan pertama, jadi FLR 4 -> 2 hilang.
    # Tanpa celah: F(n)=A5 punya konsekuen A3 -> ramalan titik tengah A3.
    # Dengan celah: A5 tidak punya konsekuen (Kasus 3) -> titik tengah A5 sendiri.
    values = [33.0, 27.0, 21.0, 33.0]
    times = [START, START + timedelta(hours=5), START + timedelta(hours=6),
             START + timedelta(hours=7)]

    tanpa_celah = forecast_multi_step("suhu", values, 1)
    dengan_celah = forecast_multi_step("suhu", values, 1, times, BUCKET_MINUTES)
    assert tanpa_celah != dengan_celah, (tanpa_celah, dengan_celah)

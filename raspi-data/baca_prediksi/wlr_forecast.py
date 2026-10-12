"""Forecast Weighted Linear Regression (WLR) — jalan LANGSUNG di Raspberry Pi 5 (gateway),
bukan di backend cloud. Prediksi cuma untuk horizon 15, 30, 60 menit (sesuai permintaan),
tidak ada opsi horizon lain.

Kenapa WLR (bukan FTS) yang dipilih buat jalan di edge:
  - FTS butuh FLRG (fuzzy logical relationship groups) yang dibangun ulang dari window
    histori tiap kali dipanggil, lebih berat dan kurang cocok dipanggil tiap menit terus
    menerus di perangkat sekecil Raspi.
  - WLR di sini cuma least-squares tertimbang 2x2 (persamaan normal langsung, bukan iteratif)
    — komputasinya ringan banget, jalan mulus di Raspi5 walau dipanggil tiap menit terus-terusan,
    dan tidak butuh dependency (numpy dst) yang kadang ribet di-pip-install di Raspi OS.

Murni Python stdlib — tidak butuh `pip install` apa pun, jalan di Python 3.9+ yang sudah
ada bawaan Raspberry Pi OS.

CARA PAKAI (integrasi ke script gateway kalian yang sudah baca ESP32):
    from wlr_forecast import WLRForecaster

    forecaster = WLRForecaster()

    # tiap ada reading baru masuk dari ESP32 (GANTI bagian baca sensor asli kalian):
    forecaster.add_reading(waktu_reading, ph=6.9, temperature_c=28.4, salinity_ppt=15.2)

    hasil = forecaster.forecast()
    # hasil = {
    #     15: {"ph": 6.91, "temperature_c": 28.5, "salinity_ppt": 15.3},
    #     30: {"ph": 6.92, "temperature_c": 28.6, "salinity_ppt": 15.4},
    #     60: {"ph": 6.94, "temperature_c": 28.9, "salinity_ppt": 15.6},
    # }
    # Nilai None kalau histori di jendela horizon itu belum cukup (baru nyala/baru mulai).

Jalankan langsung file ini (`python3 wlr_forecast.py`) buat lihat demo tanpa hardware
sama sekali — ada simulasi data di bagian bawah.
"""

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta

HORIZONS_MINUTES: tuple[int, ...] = (15, 30, 60)
PARAMETERS: tuple[str, ...] = ("ph", "temperature_c", "salinity_ppt")

# Presisi pembulatan output — disamakan dengan tipe kolom di backend
# (backend/app/models/sensor_reading.py: ph Numeric(4,2), temperature_c Numeric(4,1),
# salinity_ppt Numeric(5,2)) supaya kalau hasil ini nanti dikirim ke backend, formatnya
# konsisten dari awal.
_ROUNDING = {"ph": 2, "temperature_c": 1, "salinity_ppt": 2}


@dataclass(frozen=True)
class HorizonConfig:
    """window_minutes: seberapa jauh ke belakang data mentah dipakai buat fit garis.
    half_life_minutes: di umur berapa menit bobot suatu titik sudah meluruh jadi separuh
    titik paling baru (titik makin lama makin kurang berpengaruh).

    Default di bawah pakai heuristik "window = horizon" (makin jauh mau diramal, makin
    jauh juga ke belakang lihatnya) — sederhana & gampang dijustifikasi di laporan, tapi
    kalau sudah ada data berjam-jam, VALIDASI ULANG angka ini pakai data riil untuk
    cari kombinasi window/half_life yang RMSE-nya paling kecil buat tiap horizon.
    """

    window_minutes: float
    half_life_minutes: float


DEFAULT_HORIZON_CONFIG: dict[int, HorizonConfig] = {
    15: HorizonConfig(window_minutes=15.0, half_life_minutes=5.0),
    30: HorizonConfig(window_minutes=30.0, half_life_minutes=10.0),
    60: HorizonConfig(window_minutes=60.0, half_life_minutes=20.0),
}


def weighted_linear_forecast(
    times: list[datetime],
    values: list[float],
    target_time: datetime,
    window_minutes: float,
    half_life_minutes: float,
) -> float | None:
    """Regresi linear tertimbang atas titik-titik dalam `window_minutes` terakhir (relatif
    ke titik paling akhir di `times`), diekstrapolasi ke `target_time`. Bobot titik pada
    umur `age` menit = 0.5 ** (age / half_life_minutes).

    File ini BENAR-BENAR berdiri sendiri (tidak import modul lain di repo): tinggal copy
    satu file ini ke Raspi, tidak perlu bawa seisi repo.

    Return None kalau titik dalam jendela < 2 (tidak cukup buat fit garis, misal baru nyala).
    """
    if not times:
        return None

    t_ref = times[-1]
    pts = [
        (t, v)
        for t, v in zip(times, values)
        if t <= t_ref and (t_ref - t).total_seconds() <= window_minutes * 60
    ]
    if len(pts) < 2:
        return None

    xs = [(t - t_ref).total_seconds() / 60.0 for t, _ in pts]
    ys = [v for _, v in pts]
    ws = [0.5 ** (abs(x) / half_life_minutes) for x in xs]

    sw = sum(ws)
    swx = sum(w * x for w, x in zip(ws, xs))
    swy = sum(w * y for w, y in zip(ws, ys))
    swxx = sum(w * x * x for w, x in zip(ws, xs))
    swxy = sum(w * x * y for w, x, y in zip(ws, xs, ys))

    denom = sw * swxx - swx * swx
    if abs(denom) < 1e-9:
        a, b = swy / sw, 0.0
    else:
        b = (sw * swxy - swx * swy) / denom
        a = (swy - b * swx) / sw

    x_target = (target_time - t_ref).total_seconds() / 60.0
    return a + b * x_target


@dataclass
class _Reading:
    time: datetime
    ph: float | None
    temperature_c: float | None
    salinity_ppt: float | None


class WLRForecaster:
    """Buffer rolling di memori + forecast WLR 15/30/60 menit ke depan.

    Buffer otomatis membuang data yang lebih tua dari horizon terpanjang (60 menit) tiap
    kali ada reading baru masuk — jadi aman dijalankan sebagai proses jangka panjang
    (systemd service, lihat README.md) tanpa memori membengkak walau jalan berhari-hari.

    TIDAK thread-safe secara eksplisit — kalau baca sensor & forecast dipanggil dari thread
    berbeda, bungkus `add_reading`/`forecast` dengan `threading.Lock` sendiri. Buat loop
    polling satu-thread biasa (baca sensor -> forecast -> lanjut) ini sudah aman dipakai
    apa adanya.
    """

    def __init__(self, horizon_config: dict[int, HorizonConfig] | None = None):
        self._config = horizon_config or DEFAULT_HORIZON_CONFIG
        self._max_window_minutes = max(c.window_minutes for c in self._config.values())
        self._buffer: deque[_Reading] = deque()

    def add_reading(
        self,
        time: datetime,
        ph: float | None = None,
        temperature_c: float | None = None,
        salinity_ppt: float | None = None,
    ) -> None:
        """Tambah satu reading baru. `time` HARUS timezone-aware (pakai
        `datetime.now(timezone.utc)` atau yang setara) — samakan dengan konvensi ingest API
        backend (lihat rangkuman.md: timestamp naive dianggap salah, bukan otomatis UTC)."""
        if time.tzinfo is None:
            raise ValueError(
                "`time` harus timezone-aware (pakai datetime.now(timezone.utc) atau setara), "
                "biar konsisten dengan konvensi ingest API backend."
            )
        self._buffer.append(_Reading(time, ph, temperature_c, salinity_ppt))
        self._prune(time)

    def _prune(self, as_of: datetime) -> None:
        cutoff = as_of - timedelta(minutes=self._max_window_minutes)
        while self._buffer and self._buffer[0].time < cutoff:
            self._buffer.popleft()

    def forecast(self, as_of: datetime | None = None) -> dict[int, dict[str, float | None]]:
        """Forecast tiap parameter di tiap horizon (15/30/60 menit), dari histori s/d `as_of`
        (default: waktu reading paling akhir yang masuk).

        Return dict {horizon_menit: {"ph": ..., "temperature_c": ..., "salinity_ppt": ...}}.
        Nilai None kalau histori di jendela horizon itu belum cukup (>= 2 titik)."""
        if not self._buffer:
            return {h: dict.fromkeys(PARAMETERS) for h in HORIZONS_MINUTES}

        as_of = as_of or self._buffer[-1].time
        result: dict[int, dict[str, float | None]] = {}
        for h in HORIZONS_MINUTES:
            cfg = self._config[h]
            target_time = as_of + timedelta(minutes=h)
            row: dict[str, float | None] = {}
            for param in PARAMETERS:
                times = [r.time for r in self._buffer if r.time <= as_of and getattr(r, param) is not None]
                vals = [
                    getattr(r, param)
                    for r in self._buffer
                    if r.time <= as_of and getattr(r, param) is not None
                ]
                pred = weighted_linear_forecast(times, vals, target_time, cfg.window_minutes, cfg.half_life_minutes)
                row[param] = round(pred, _ROUNDING[param]) if pred is not None else None
            result[h] = row
        return result

    def forecast_as_records(self, as_of: datetime | None = None) -> list[dict]:
        """Format hasil forecast jadi list of dict siap di-JSON-kan / dikirim ke mana pun
        (backend, MQTT, log file, dst) — satu record per horizon:
        {"horizon_minutes": 15, "target_time": "2026-...+07:00", "ph": ..., ...}."""
        as_of = as_of or (self._buffer[-1].time if self._buffer else None)
        if as_of is None:
            return []
        forecasts = self.forecast(as_of)
        return [
            {
                "horizon_minutes": h,
                "target_time": (as_of + timedelta(minutes=h)).isoformat(),
                **values,
            }
            for h, values in forecasts.items()
        ]


if __name__ == "__main__":
    import random
    from datetime import timezone

    print("=== Demo WLRForecaster — simulasi data, TANPA hardware ===")
    print("(ganti bagian pembacaan sensor di bawah dengan punya Raspi kalian)\n")

    forecaster = WLRForecaster()
    t0 = datetime.now(timezone.utc)
    ph, suhu, sal = 6.9, 28.0, 15.0

    for minute in range(75):  # simulasi 75 menit data masuk tiap 1 menit
        t = t0 + timedelta(minutes=minute)
        # simulasi tren naik pelan + noise kecil — GANTI dengan baca ESP32 asli kalian.
        suhu += 0.02 + random.uniform(-0.05, 0.05)
        ph += random.uniform(-0.01, 0.01)
        sal += random.uniform(-0.05, 0.05)
        forecaster.add_reading(t, ph=round(ph, 2), temperature_c=round(suhu, 1), salinity_ppt=round(sal, 2))

        if minute > 0 and minute % 15 == 0:
            hasil = forecaster.forecast()
            print(f"[menit ke-{minute:>2}] aktual -> ph={ph:.2f}  suhu={suhu:.1f}  sal={sal:.2f}")
            for h in HORIZONS_MINUTES:
                print(f"  +{h:>2} menit -> {hasil[h]}")
            print()

    print("Demo selesai. Ganti loop simulasi di atas dengan pembacaan sensor asli kalian,")
    print("lalu panggil forecaster.add_reading(...) tiap ada data baru masuk.")

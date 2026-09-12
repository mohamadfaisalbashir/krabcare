from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta

HORIZONS_MINUTES: tuple[int, ...] = (15, 30, 60)
PARAMETERS: tuple[str, ...] = ("ph", "temperature_c", "salinity_ppt")

_ROUNDING = {"ph": 2, "temperature_c": 1, "salinity_ppt": 2}


@dataclass(frozen=True)
class HorizonConfig:
    """window_minutes: seberapa jauh ke belakang data mentah dipakai untuk fit garis.
    half_life_minutes: umur (menit) saat bobot sebuah titik meluruh jadi separuh
    titik paling baru.

    Default di bawah memakai heuristik "window = horizon". Kalau sudah ada data
    berjam-jam, validasi ulang angkanya dengan data riil untuk mencari kombinasi
    window/half_life dengan RMSE terkecil per horizon.
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
    """Regresi linear tertimbang atas titik dalam `window_minutes` terakhir
    (relatif ke titik paling akhir di `times`), diekstrapolasi ke `target_time`.
    Bobot titik berumur `age` menit = 0.5 ** (age / half_life_minutes).

    Berkas ini berdiri sendiri, tidak mengimpor modul lain di repo, jadi cukup
    disalin satu berkas ke Raspi.

    Return None kalau titik dalam jendela kurang dari 2.
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

    Buffer membuang data yang lebih tua dari horizon terpanjang (60 menit) tiap
    ada reading baru, jadi aman dijalankan sebagai proses jangka panjang
    (systemd service, lihat README.md).

    Tidak thread-safe. Kalau baca sensor dan forecast dipanggil dari thread
    berbeda, bungkus `add_reading`/`forecast` dengan `threading.Lock` sendiri.
    Untuk loop polling satu thread, aman dipakai apa adanya.
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
        """Tambah satu reading baru. `time` harus timezone-aware (misal
        `datetime.now(timezone.utc)`), mengikuti konvensi ingest API backend:
        timestamp naive dianggap salah, bukan otomatis UTC."""
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
        """Forecast tiap parameter di tiap horizon (15/30/60 menit), dari histori
        sampai `as_of` (default: waktu reading terakhir yang masuk).

        Return {horizon: {"ph": ..., "temperature_c": ..., "salinity_ppt": ...}}.
        Nilai None kalau titik di jendela horizon itu kurang dari 2."""
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
        """Format hasil forecast jadi list dict siap di-JSON-kan, satu record per
        horizon: {"horizon_minutes": 15, "target_time": "2026-...+07:00", ...}."""
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

    print("=== Demo WLRForecaster, simulasi data, TANPA hardware ===")
    print("(ganti bagian pembacaan sensor di bawah dengan punya Raspi kalian)\n")

    forecaster = WLRForecaster()
    t0 = datetime.now(timezone.utc)
    ph, suhu, sal = 6.9, 28.0, 15.0

    for minute in range(75):  # simulasi 75 menit data masuk tiap 1 menit
        t = t0 + timedelta(minutes=minute)
        # Simulasi tren naik pelan + noise kecil, ganti dengan baca ESP32 asli.
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

from datetime import datetime, timedelta

from ammonia_nh3 import MODEL_VERSION as AMMONIA_MODEL_VERSION
from ammonia_nh3 import assess_ammonia_risk
from fuzzy_quality import ANOMALY_CATEGORIES, classify_water_quality
from wlr_forecast import HORIZONS_MINUTES, WLRForecaster

HORIZON_TERUKUR = 0

MODEL_VERSION_CLASSIFICATION = "fuzzy-logic"
MODEL_VERSION_PREDICTION = "wlr"


class EdgePipeline:
    """Bungkus WLRForecaster + fuzzy_quality + ammonia_nh3 jadi satu pemanggilan."""

    def __init__(self, device_code: str):
        self.device_code = device_code
        self._forecaster = WLRForecaster()

    def _classification_row(self, time: datetime, sensor_reading_time: datetime, ph, temperature_c, salinity_ppt) -> dict:
        hasil = classify_water_quality(ph=ph, temperature_c=temperature_c, salinity_ppt=salinity_ppt)
        return {
            "device_code": self.device_code,
            "time": time.isoformat(),
            "sensor_reading_time": sensor_reading_time.isoformat(),
            "quality_score": hasil["quality_score"],
            "quality_category": hasil["quality_category"],
            "membership_degrees": hasil["membership_degrees"],
            "model_version": MODEL_VERSION_CLASSIFICATION,
        }, hasil["quality_category"]

    def _prediction_row(self, time: datetime, target_time: datetime, horizon_minutes: int, ph, temperature_c, salinity_ppt) -> dict:
        hasil = classify_water_quality(ph=ph, temperature_c=temperature_c, salinity_ppt=salinity_ppt)
        return {
            "device_code": self.device_code,
            "time": time.isoformat(),
            "target_time": target_time.isoformat(),
            "horizon_minutes": horizon_minutes,
            "predicted_quality_score": hasil["quality_score"],
            "predicted_category": hasil["quality_category"],
            "predicted_ph": ph,
            "predicted_temperature_c": temperature_c,
            "predicted_salinity_ppt": salinity_ppt,
            "model_version": MODEL_VERSION_PREDICTION,
        }, hasil["quality_category"]

    def _ammonia_row(self, time: datetime, target_time: datetime, horizon_minutes: int, ph, temperature_c, salinity_ppt) -> dict | None:
        if ph is None or temperature_c is None or salinity_ppt is None:
            return None
        hasil = assess_ammonia_risk(ph=float(ph), temperature_c=float(temperature_c), salinity_ppt=float(salinity_ppt))
        return {
            "device_code": self.device_code,
            "time": time.isoformat(),
            "target_time": target_time.isoformat(),
            "horizon_minutes": horizon_minutes,
            "input_ph": hasil.input_ph,
            "input_temperature_c": hasil.input_temperature_c,
            "input_salinity_ppt": hasil.input_salinity_ppt,
            "fraction_nh3_pct": round(hasil.fraction_nh3_pct, 3),
            "pka": round(hasil.pka, 4),
            "risk_level": hasil.risk_level.value,
            "in_valid_range": hasil.in_valid_range,
            "model_version": AMMONIA_MODEL_VERSION,
        }

    def process(self, time: datetime, ph: float | None, temperature_c: float | None, salinity_ppt: float | None) -> dict:
        """Satu reading masuk, keluar payload {classifications, predictions,
        ammonia_risks}.

        `time` harus timezone-aware. Kalau ada parameter None (sensor mati),
        klasifikasi dan amonia kondisi sekarang dilewati, bukan diisi nilai
        palsu, tapi reading tetap masuk ke buffer forecast.
        """
        classifications: list[dict] = []
        predictions: list[dict] = []
        ammonia_risks: list[dict] = []
        anomaly_categories_now: list[str] = []
        anomaly_predictions: list[dict] = []

        if ph is not None and temperature_c is not None and salinity_ppt is not None:
            row, category = self._classification_row(time, time, ph, temperature_c, salinity_ppt)
            classifications.append(row)
            if category in ANOMALY_CATEGORIES:
                anomaly_categories_now.append(category)

            baris_amonia = self._ammonia_row(time, time, HORIZON_TERUKUR, ph, temperature_c, salinity_ppt)
            if baris_amonia is not None:
                ammonia_risks.append(baris_amonia)

        self._forecaster.add_reading(time, ph=ph, temperature_c=temperature_c, salinity_ppt=salinity_ppt)
        forecast = self._forecaster.forecast(time)

        for h in HORIZONS_MINUTES:
            nilai = forecast[h]
            if nilai["ph"] is None or nilai["temperature_c"] is None or nilai["salinity_ppt"] is None:
                continue  # histori belum cukup di jendela horizon ini (baru nyala)

            target_time = time + timedelta(minutes=h)
            row, category = self._prediction_row(
                time, target_time, h, nilai["ph"], nilai["temperature_c"], nilai["salinity_ppt"]
            )
            predictions.append(row)
            if category in ANOMALY_CATEGORIES:
                anomaly_predictions.append(
                    {"target_time": target_time, "category": category, "horizon_minutes": h}
                )

            baris_amonia = self._ammonia_row(
                time, target_time, h, nilai["ph"], nilai["temperature_c"], nilai["salinity_ppt"]
            )
            if baris_amonia is not None:
                ammonia_risks.append(baris_amonia)

        return {
            "classifications": classifications,
            "predictions": predictions,
            "ammonia_risks": ammonia_risks,
            # Info tambahan untuk keperluan lokal (misal menyalakan buzzer).
            # Tidak dikirim: backend memutuskan notifikasi push dari kategori di
            # classifications/predictions.
            "_anomaly_now": anomaly_categories_now,
            "_anomaly_forecast": anomaly_predictions,
        }


if __name__ == "__main__":
    import json
    from datetime import timezone

    print("=== Demo EdgePipeline, satu reading, payload lengkap ===\n")
    pipeline = EdgePipeline(device_code="54D660E9BFB4")
    waktu = datetime.now(timezone.utc)
    payload = pipeline.process(waktu, ph=6.9, temperature_c=28.4, salinity_ppt=15.2)
    print(json.dumps({k: v for k, v in payload.items() if not k.startswith("_")}, indent=2, default=str))
    print("\n(forecast di atas semua None karena baru 1 reading, normal, histori belum cukup)")

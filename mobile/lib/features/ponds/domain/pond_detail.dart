import '../../../core/theme/app_colors.dart';
import 'water_parameter.dart';

/// Nilai terkini satu parameter + status hasil fuzzy logic (FR-08).
class ParameterReading {
  const ParameterReading({
    required this.parameter,
    required this.value,
    required this.status,
  });

  final WaterParameter parameter;
  final double value;
  final WaterStatus status;
}

/// Satu baris prediksi FTS (FR-09), mis. "pH Air: Cenderung stabil di
/// kisaran 7.1 - 7.2 (Aman)."
class ParameterPrediction {
  const ParameterPrediction({
    required this.parameter,
    required this.text,
  });

  final WaterParameter parameter;
  final String text;
}

/// Satu titik pada grafik tren historis.
class TrendPoint {
  const TrendPoint({required this.time, required this.value});

  final DateTime time;
  final double value;
}

/// Data lengkap satu grafik tren (dipakai di 3 chart card).
class TrendSeries {
  const TrendSeries({
    required this.parameter,
    required this.status,
    required this.points,
    required this.minY,
    required this.maxY,
  });

  final WaterParameter parameter;
  final WaterStatus status;
  final List<TrendPoint> points;
  final double minY;
  final double maxY;
}

/// Kumpulan data untuk halaman Detail Kolam (Gambar 3.23).
class PondDetail {
  const PondDetail({
    required this.pondId,
    required this.pondName,
    required this.iotId,
    required this.readings,
    required this.predictions,
    required this.trends,
  });

  final String pondId;
  final String pondName;
  final String iotId;
  final List<ParameterReading> readings;
  final List<ParameterPrediction> predictions;
  final List<TrendSeries> trends;
}

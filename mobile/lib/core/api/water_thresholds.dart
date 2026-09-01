import '../../features/notifications/domain/app_notification.dart';
import '../../features/ponds/domain/water_parameter.dart';
import '../theme/app_colors.dart';

/// Aturan bisnis yang HARUS identik dengan web, supaya angka dan status di
/// kedua aplikasi tidak pernah berbeda. Sumber: web/src/lib/parameter.ts
/// (ambang Tabel 2.1, Bab 2.2.1) dan web/src/components/kolam/PredictionPanel.tsx
/// (kalimat tren). Dart murni tanpa Flutter supaya bisa diuji unit.

/// Batas toleransi & kisaran optimal per parameter.
class ParamRange {
  const ParamRange({
    required this.min,
    required this.max,
    required this.optimalLow,
    required this.optimalHigh,
  });

  final double min;
  final double max;
  final double optimalLow;
  final double optimalHigh;
}

const Map<WaterParameter, ParamRange> kParamRanges = {
  WaterParameter.ph:
      ParamRange(min: 6.5, max: 9.0, optimalLow: 7.5, optimalHigh: 8.5),
  WaterParameter.suhu:
      ParamRange(min: 20, max: 35, optimalLow: 28, optimalHigh: 30),
  WaterParameter.salinitas:
      ParamRange(min: 5, max: 40, optimalLow: 10, optimalHigh: 30),
};

/// Status ambang untuk satu nilai. Batas bersifat inklusif di kedua sisi:
/// pH 6.5 -> waspada, pH 7.5 -> aman, pH 8.5 -> aman, pH 9.0 -> waspada.
WaterStatus statusOf(WaterParameter parameter, double value) {
  final r = kParamRanges[parameter]!;
  if (value < r.min || value > r.max) return WaterStatus.bahaya;
  if (value < r.optimalLow || value > r.optimalHigh) return WaterStatus.waspada;
  return WaterStatus.aman;
}

/// Maksimal 2 desimal, nol di belakang dibuang: 8.75 -> "8.75", 7.70 -> "7.7",
/// 25.00 -> "25". Nilai backend berasal dari kolom NUMERIC, jadi sering membawa
/// nol yang tidak berarti.
String formatValue(double value) {
  final fixed = double.parse(value.toStringAsFixed(2));
  return fixed == fixed.roundToDouble()
      ? fixed.toInt().toString()
      : fixed.toString();
}

/// quality_category backend -> status UI. Fallback sengaja waspada, bukan aman:
/// kategori tak dikenal pada aplikasi keselamatan air harus gagal ke arah aman
/// bagi pengguna, bukan ke arah menenangkan.
WaterStatus categoryToStatus(String? category) {
  switch (category?.trim().toLowerCase()) {
    case 'baik':
      return WaterStatus.aman;
    case 'buruk':
      return WaterStatus.bahaya;
    case 'sedang':
    default:
      return WaterStatus.waspada;
  }
}

extension WaterParameterJson on WaterParameter {
  /// Nama field di payload backend (SensorReadingOut).
  String get jsonKey => switch (this) {
        WaterParameter.ph => 'ph',
        WaterParameter.suhu => 'temperature_c',
        WaterParameter.salinitas => 'salinity_ppt',
      };

  /// Nama field prediksi per parameter di FuzzyPredictionOut.
  String get predictedJsonKey => switch (this) {
        WaterParameter.ph => 'predicted_ph',
        WaterParameter.suhu => 'predicted_temperature_c',
        WaterParameter.salinitas => 'predicted_salinity_ppt',
      };

  /// Selisih di bawah nilai ini dianggap "stabil", bukan naik/turun.
  double get stableThreshold => switch (this) {
        WaterParameter.ph => 0.1,
        WaterParameter.suhu => 0.3,
        WaterParameter.salinitas => 0.5,
      };
}

/// Jendela prediksi yang ditampilkan: hanya horizon <= 3 jam ke depan.
const int kPredictionHorizonLimitMinutes = 180;

/// Kalimat tren satu parameter, meniru trendSentence() di PredictionPanel.tsx.
/// [current] nilai terkini, [predicted] nilai pada horizon terjauh yang dipakai.
String trendSentence(
  WaterParameter parameter,
  double? current,
  double? predicted,
) {
  if (predicted == null) {
    return 'Data prediksi belum tersedia.';
  }
  final unit = parameter.unit;
  if (current == null) {
    return 'Diperkirakan ${formatValue(predicted)} $unit.';
  }

  final delta = predicted - current;
  if (delta.abs() < parameter.stableThreshold) {
    return 'Cenderung stabil di kisaran ${formatValue(predicted)} $unit.';
  }
  final arah = delta > 0 ? 'naik' : 'turun';
  return 'Cenderung $arah ke ${formatValue(predicted)} $unit '
      '(${statusOf(parameter, predicted).label}).';
}

/// Pemicu notifikasi diturunkan dari source + kategori, bukan dari teks pesan.
///
/// Backend hanya menulis baris `classification` saat kategori BERUBAH, dan hanya
/// dalam dua keadaan: kategori baru anomali, atau yang sebelumnya anomali lalu
/// pulih. Karena ANOMALY_CATEGORIES = {sedang, buruk}, "pulih" hanya bisa
/// bernilai `baik`. Lihat backend/app/services/notification_service.py:44-51.
NotificationTrigger triggerFrom(String source, String category) {
  if (source == 'prediction') return NotificationTrigger.prediksi;
  if (category.trim().toLowerCase() == 'baik') {
    return NotificationTrigger.pemulihan;
  }
  return NotificationTrigger.aktual;
}

/// Batas sumbu grafik dihitung dari DATA, bukan dari tabel ambang.
/// MiniLineChart menjepit nilai ke rentang ini (mini_line_chart.dart:78), jadi
/// sumbu berbasis ambang akan menyembunyikan pembacaan di luar batas dan
/// membuat garis bahaya terlihat datar dan aman.
({double minY, double maxY}) axisBoundsFor(List<double> values) {
  if (values.isEmpty) return (minY: 0, maxY: 1);
  var lo = values.first;
  var hi = values.first;
  for (final v in values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi == lo) return (minY: lo - 1, maxY: hi + 1);
  final pad = (hi - lo) * 0.15;
  return (minY: lo - pad, maxY: hi + pad);
}

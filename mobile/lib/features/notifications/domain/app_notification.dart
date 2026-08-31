import '../../../core/theme/app_colors.dart';

/// Tiga pemicu notifikasi sesuai FR-02 & Flowchart 4 (CD-3 3.3.1.D):
/// - aktual: kondisi terkini terdeteksi Waspada/Bahaya
/// - prediksi: hasil fuzzy time series (FR-09) memprediksi Waspada/Bahaya
/// - pemulihan: status yang tadinya bermasalah kembali ke Aman
enum NotificationTrigger { aktual, prediksi, pemulihan }

extension NotificationTriggerX on NotificationTrigger {
  String get title => switch (this) {
        NotificationTrigger.aktual => 'Peringatan Saat Ini',
        NotificationTrigger.prediksi => 'Prediksi Sistem',
        NotificationTrigger.pemulihan => 'Kondisi Kembali Aman',
      };
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.pondName,
    required this.trigger,
    required this.status,
    required this.message,
    required this.time,
  });

  final String id;
  final String pondName;
  final NotificationTrigger trigger;

  /// Status terkait (Aman/Waspada/Bahaya, FR-08) — menentukan warna kartu.
  final WaterStatus status;
  final String message;
  final DateTime time;

  String get relativeTimeLabel {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return 'Baru saja';
    if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
    if (diff.inHours < 24) return '${diff.inHours} jam lalu';
    return '${diff.inDays} hari lalu';
  }
}

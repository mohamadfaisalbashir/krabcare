import '../../../core/theme/app_colors.dart';

/// Model dasar satu kolam. FR-06: sistem mendukung multi-kolam per akun.
///
/// Disusun oleh DashboardController dari tiga sumber backend (GET /kolam,
/// GET /kolam/{id}/devices, GET /quality/latest), bukan dari satu payload —
/// karena itu tidak ada fromJson di sini.
class Pond {
  const Pond({
    required this.id,
    required this.name,
    required this.iotId,
    required this.overallStatus,
  });

  final String id;
  final String name;

  /// Kode device yang diklaim kolam ini, mis. "SLV1".
  /// null = belum ada perangkat terpasang.
  final String? iotId;

  /// Status keseluruhan hasil fuzzy logic (FR-08): Aman/Waspada/Bahaya.
  /// null = perangkat belum punya keluaran ML sama sekali (kolam absen dari
  /// /quality/latest). Sengaja TIDAK di-default ke Waspada — menampilkan status
  /// karangan untuk kolam yang belum terukur lebih menyesatkan daripada
  /// menuliskan bahwa datanya memang belum ada. Web melakukan hal yang sama.
  final WaterStatus? overallStatus;
}

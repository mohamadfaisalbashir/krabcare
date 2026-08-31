import '../../../core/theme/app_colors.dart';

/// Model dasar satu kolam. FR-06: sistem mendukung multi-kolam per akun.
class Pond {
  const Pond({
    required this.id,
    required this.name,
    required this.iotId,
    required this.overallStatus,
  });

  final String id;
  final String name;

  /// mis. "IOT-KPT-001"
  final String iotId;

  /// Status keseluruhan hasil fuzzy logic (FR-08): Aman/Waspada/Bahaya.
  final WaterStatus overallStatus;

  factory Pond.fromJson(Map<String, dynamic> json) {
    return Pond(
      id: json['id'].toString(),
      name: json['name'] as String,
      iotId: json['iot_id'] as String,
      overallStatus: WaterStatusX.fromString(json['status'] as String),
    );
  }
}

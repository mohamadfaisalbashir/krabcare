import 'package:flutter/material.dart';

/// Design tokens diambil dari mockup CD-3 (Gambar 3.20–3.26).
class AppColors {
  AppColors._();

  // Brand
  static const Color primary = Color(0xFF2563EB);
  static const Color primaryDark = Color(0xFF1D4ED8);

  // Neutral / surface
  static const Color background = Color(0xFFF8FAFC);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE2E8F0);
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color textSecondary = Color(0xFF64748B);
  static const Color textHint = Color(0xFF94A3B8);

  // Status: Aman / Waspada / Bahaya (FR-08)
  static const Color statusAmanBg = Color(0xFFDCFCE7);
  static const Color statusAmanText = Color(0xFF16A34A);

  static const Color statusWaspadaBg = Color(0xFFFDEDAA);
  static const Color statusWaspadaText = Color(0xFFB45309);

  static const Color statusBahayaBg = Color(0xFFFBCECE);
  static const Color statusBahayaText = Color(0xFFDC2626);

  // Log Historis (dark/monospace theme, khusus halaman ini)
  static const Color logBackground = Color(0xFF0B1220);
  static const Color logSurface = Color(0xFF111A2E);
  static const Color logBorder = Color(0xFF1E293B);
  static const Color logTextPrimary = Color(0xFFE2E8F0);
  static const Color logTextSecondary = Color(0xFF64748B);
}

/// Mapping status FR-08 ke warna badge. Dipakai di Dashboard, Detail Kolam,
/// Log Historis, dan Notifikasi & Prediksi supaya konsisten satu sumber.
enum WaterStatus { aman, waspada, bahaya }

extension WaterStatusX on WaterStatus {
  String get label => switch (this) {
        WaterStatus.aman => 'Aman',
        WaterStatus.waspada => 'Waspada',
        WaterStatus.bahaya => 'Bahaya',
      };

  Color get bgColor => switch (this) {
        WaterStatus.aman => AppColors.statusAmanBg,
        WaterStatus.waspada => AppColors.statusWaspadaBg,
        WaterStatus.bahaya => AppColors.statusBahayaBg,
      };

  Color get textColor => switch (this) {
        WaterStatus.aman => AppColors.statusAmanText,
        WaterStatus.waspada => AppColors.statusWaspadaText,
        WaterStatus.bahaya => AppColors.statusBahayaText,
      };

  /// Parsing dari string yang dikirim backend, mis. "aman" / "AMAN".
  static WaterStatus fromString(String value) {
    switch (value.trim().toLowerCase()) {
      case 'waspada':
        return WaterStatus.waspada;
      case 'bahaya':
        return WaterStatus.bahaya;
      case 'aman':
      default:
        return WaterStatus.aman;
    }
  }
}

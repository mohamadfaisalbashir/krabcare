import 'package:flutter/material.dart';

/// Tiga parameter kualitas air yang dipantau (FR-01, Bab 2.2.1).
enum WaterParameter { ph, suhu, salinitas }

extension WaterParameterX on WaterParameter {
  String get label => switch (this) {
        WaterParameter.ph => 'pH Air',
        WaterParameter.suhu => 'Suhu',
        WaterParameter.salinitas => 'Salinitas',
      };

  String get unit => switch (this) {
        WaterParameter.ph => 'pH',
        WaterParameter.suhu => '°C',
        WaterParameter.salinitas => 'ppt',
      };

  IconData get icon => switch (this) {
        WaterParameter.ph => Icons.water_drop_outlined,
        WaterParameter.suhu => Icons.thermostat_outlined,
        WaterParameter.salinitas => Icons.waves_outlined,
      };

  /// Slug dipakai untuk path route, mis. /log/ph
  String get slug => switch (this) {
        WaterParameter.ph => 'ph',
        WaterParameter.suhu => 'suhu',
        WaterParameter.salinitas => 'salinitas',
      };

  static WaterParameter fromSlug(String slug) {
    switch (slug) {
      case 'suhu':
        return WaterParameter.suhu;
      case 'salinitas':
        return WaterParameter.salinitas;
      case 'ph':
      default:
        return WaterParameter.ph;
    }
  }
}

import '../../../core/theme/app_colors.dart';

/// Satu baris log historis, mis. "[11.41] pH terukur stabil 7.2".
class LogEntry {
  const LogEntry({
    required this.time,
    required this.message,
    required this.status,
  });

  final DateTime time;
  final String message;
  final WaterStatus status;

  String get timeLabel =>
      '${time.hour.toString().padLeft(2, '0')}.${time.minute.toString().padLeft(2, '0')}';
}

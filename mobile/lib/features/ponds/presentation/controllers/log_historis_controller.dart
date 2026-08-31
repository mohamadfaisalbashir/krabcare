import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/log_entry.dart';
import '../../domain/water_parameter.dart';

typedef LogQuery = ({String pondId, WaterParameter parameter});

/// TODO: ganti _fetchLogs() dengan panggilan ke PondRepository
/// (GET /ponds/{id}/logs?parameter=...) sesuai kebutuhan Log Historis (FR-04/05).
class LogHistorisController
    extends FamilyAsyncNotifier<List<LogEntry>, LogQuery> {
  @override
  Future<List<LogEntry>> build(LogQuery query) {
    return _fetchLogs(query);
  }

  Future<List<LogEntry>> _fetchLogs(LogQuery query) async {
    // --- Data dummy sementara, ganti dengan API call asli ---
    await Future.delayed(const Duration(milliseconds: 500));
    final now = DateTime.now();

    String unit = query.parameter.unit;
    return [
      LogEntry(
        time: now.subtract(const Duration(minutes: 1)),
        message:
            '${query.parameter.label} terukur stabil 7.2 $unit'.trim(),
        status: WaterStatus.aman,
      ),
      LogEntry(
        time: now.subtract(const Duration(minutes: 11)),
        message:
            '${query.parameter.label} terukur stabil 7.1 $unit'.trim(),
        status: WaterStatus.aman,
      ),
      LogEntry(
        time: now.subtract(const Duration(minutes: 25)),
        message: '${query.parameter.label} mendekati ambang atas'.trim(),
        status: WaterStatus.waspada,
      ),
    ];
  }

  Future<void> refresh(LogQuery query) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchLogs(query));
  }
}

final logHistorisControllerProvider = AsyncNotifierProviderFamily<
    LogHistorisController, List<LogEntry>, LogQuery>(
  LogHistorisController.new,
);

/// Filter status yang sedang aktif di halaman Log Historis (UI-local state).
/// null berarti "Semua".
final logHistorisFilterProvider = StateProvider<WaterStatus?>((ref) => null);

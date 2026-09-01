import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/api/water_thresholds.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/log_entry.dart';
import '../../domain/water_parameter.dart';

typedef LogQuery = ({String pondId, WaterParameter parameter});

class LogHistorisController
    extends FamilyAsyncNotifier<List<LogEntry>, LogQuery> {
  @override
  Future<List<LogEntry>> build(LogQuery query) {
    return _fetchLogs(query);
  }

  Future<List<LogEntry>> _fetchLogs(LogQuery query) async {
    final api = ref.watch(apiProvider);
    final kolams = await ref.read(kolamListProvider.future);
    final deviceId = kolams
        .where((k) => k.id.toString() == query.pondId)
        .firstOrNull
        ?.deviceId;

    if (deviceId == null) return const [];

    // Halaman log butuh kedalaman riwayat, bukan kerapatan grafik.
    final rows = (await api.readings(deviceId: deviceId, limit: 200))
        .cast<Map<String, dynamic>>();

    final p = query.parameter;
    return [
      for (final r in rows)
        // Baris yang parameternya null dibuang, bukan ditulis sebagai 0.
        if ((r[p.jsonKey] as num?)?.toDouble() case final v?)
          LogEntry(
            // Timestamp backend UTC; timeLabel membaca .hour mentah.
            time: DateTime.parse(r['time'] as String).toLocal(),
            message: '${p.label} terukur ${formatValue(v)} ${p.unit}',
            // Status per pembacaan memakai ambang (Tabel 2.1), bukan kategori
            // Mamdani: klasifikasi fuzzy hanya ditulis sekali per jam sementara
            // pembacaan masuk tiap 1-15 menit, jadi status fuzzy per baris
            // memang tidak ada. Web melakukan hal yang sama di Log Historis.
            status: statusOf(p, v),
          ),
    ];
  }

  Future<void> refresh(LogQuery query) async {
    state = const AsyncLoading();
    ref.invalidate(kolamListProvider);
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

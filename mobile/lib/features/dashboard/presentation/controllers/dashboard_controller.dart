import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/api/water_thresholds.dart';
import '../../../ponds/domain/pond.dart';

class DashboardController extends AsyncNotifier<List<Pond>> {
  @override
  Future<List<Pond>> build() {
    return _fetchPonds();
  }

  Future<List<Pond>> _fetchPonds() async {
    final api = ref.watch(apiProvider);
    final kolams = await ref.read(kolamListProvider.future);

    // Satu panggilan untuk semua device sekaligus — /quality/latest tanpa
    // device_id sudah mengembalikan seluruh device yang boleh dilihat pemanggil.
    final quality = await api.latestQuality();
    final categoryByDevice = <int, String?>{
      for (final q in quality.cast<Map<String, dynamic>>())
        q['device_id'] as int:
            (q['classification'] as Map<String, dynamic>?)?['quality_category']
                as String?,
    };

    return [
      for (final k in kolams)
        Pond(
          id: k.id.toString(),
          name: k.nama,
          iotId: k.deviceCode,
          // Device tanpa keluaran ML tidak muncul di /quality/latest sama
          // sekali, jadi ketiadaan entri berarti "belum ada data", bukan aman.
          overallStatus: k.deviceId == null ||
                  !categoryByDevice.containsKey(k.deviceId)
              ? null
              : categoryToStatus(categoryByDevice[k.deviceId]),
        ),
    ];
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    ref.invalidate(kolamListProvider);
    state = await AsyncValue.guard(_fetchPonds);
  }
}

final dashboardControllerProvider =
    AsyncNotifierProvider<DashboardController, List<Pond>>(
  DashboardController.new,
);

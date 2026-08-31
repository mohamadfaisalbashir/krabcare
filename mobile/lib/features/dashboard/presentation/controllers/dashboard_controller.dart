import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../ponds/domain/pond.dart';

/// TODO: ganti _fetchPonds() dengan panggilan ke PondRepository (GET /ponds)
/// dan tambahkan polling berkala untuk soft real-time (mengikuti interval
/// pembacaan sensor 1 menit / sesuai kesepakatan backend, ref. FR-01).
class DashboardController extends AsyncNotifier<List<Pond>> {
  @override
  Future<List<Pond>> build() {
    return _fetchPonds();
  }

  Future<List<Pond>> _fetchPonds() async {
    // --- Data dummy sementara, ganti dengan API call asli ---
    await Future.delayed(const Duration(milliseconds: 600));
    return const [
      Pond(
        id: '1',
        name: 'Kolam A',
        iotId: 'IOT-KPT-001',
        overallStatus: WaterStatus.waspada,
      ),
      Pond(
        id: '2',
        name: 'Kolam B',
        iotId: 'IOT-KPT-002',
        overallStatus: WaterStatus.aman,
      ),
    ];
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetchPonds);
  }
}

final dashboardControllerProvider =
    AsyncNotifierProvider<DashboardController, List<Pond>>(
  DashboardController.new,
);

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/pond_detail.dart';
import '../../domain/water_parameter.dart';

/// TODO: ganti _fetchDetail() dengan panggilan ke PondRepository
/// (GET /ponds/{id}, termasuk hasil fuzzy logic & fuzzy time series).
/// Tambahkan polling berkala untuk soft real-time (ref. FR-01, interval 1
/// menit) begitu endpoint sudah tersedia.
class PondDetailController extends FamilyAsyncNotifier<PondDetail, String> {
  @override
  Future<PondDetail> build(String pondId) {
    return _fetchDetail(pondId);
  }

  Future<PondDetail> _fetchDetail(String pondId) async {
    // --- Data dummy sementara, ganti dengan API call asli ---
    await Future.delayed(const Duration(milliseconds: 600));

    final now = DateTime.now();
    List<TrendPoint> genPoints(List<double> values) => [
          for (var i = 0; i < values.length; i++)
            TrendPoint(
              time: now.subtract(
                Duration(minutes: (values.length - i) * 10),
              ),
              value: values[i],
            ),
        ];

    return PondDetail(
      pondId: pondId,
      pondName: pondId == '2' ? 'Kolam B' : 'Kolam A',
      iotId: pondId == '2' ? 'IOT-KPT-002' : 'IOT-KPT-001',
      readings: const [
        ParameterReading(
          parameter: WaterParameter.ph,
          value: 8.0,
          status: WaterStatus.aman,
        ),
        ParameterReading(
          parameter: WaterParameter.suhu,
          value: 30.5,
          status: WaterStatus.waspada,
        ),
        ParameterReading(
          parameter: WaterParameter.salinitas,
          value: 25.0,
          status: WaterStatus.aman,
        ),
      ],
      predictions: const [
        ParameterPrediction(
          parameter: WaterParameter.ph,
          text: 'pH Air: Cenderung stabil di kisaran 7.1 - 7.2 (Aman).',
        ),
        ParameterPrediction(
          parameter: WaterParameter.suhu,
          text: 'Suhu: Diprediksi terus naik mendekati 31.0°C (Waspada).',
        ),
        ParameterPrediction(
          parameter: WaterParameter.salinitas,
          text: 'Salinitas: Stabil di angka 25 ppt (Aman).',
        ),
      ],
      trends: [
        TrendSeries(
          parameter: WaterParameter.suhu,
          status: WaterStatus.waspada,
          points: genPoints([28.1, 28.4, 28.8, 29.2, 29.5, 29.8, 30.1, 30.5]),
          minY: 28,
          maxY: 30,
        ),
        TrendSeries(
          parameter: WaterParameter.ph,
          status: WaterStatus.aman,
          points: genPoints([8.0, 7.9, 8.1, 8.0, 7.9, 8.0, 8.1, 8.0]),
          minY: 7.5,
          maxY: 8.5,
        ),
        TrendSeries(
          parameter: WaterParameter.salinitas,
          status: WaterStatus.aman,
          points: genPoints([24, 26, 23, 27, 25, 24, 26, 25]),
          minY: 10,
          maxY: 30,
        ),
      ],
    );
  }

  Future<void> refresh(String pondId) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _fetchDetail(pondId));
  }
}

final pondDetailControllerProvider = AsyncNotifierProviderFamily<
    PondDetailController, PondDetail, String>(PondDetailController.new);

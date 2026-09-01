import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/api/water_thresholds.dart';
import '../../domain/pond_detail.dart';
import '../../domain/water_parameter.dart';

class PondDetailController extends FamilyAsyncNotifier<PondDetail, String> {
  @override
  Future<PondDetail> build(String pondId) {
    return _fetchDetail(pondId);
  }

  Future<PondDetail> _fetchDetail(String pondId) async {
    final api = ref.watch(apiProvider);
    final kolams = await ref.read(kolamListProvider.future);
    final kolam = kolams.where((k) => k.id.toString() == pondId).firstOrNull;

    if (kolam == null) {
      throw Exception('Kolam tidak ditemukan');
    }

    // Belum ada perangkat: tidak ada gunanya menembak /readings atau /quality.
    final deviceId = kolam.deviceId;
    if (deviceId == null) {
      return PondDetail(
        pondId: pondId,
        pondName: kolam.nama,
        iotId: null,
        readings: const [],
        predictions: const [],
        trends: const [],
      );
    }

    final results = await Future.wait([
      api.readings(deviceId: deviceId, limit: 30),
      api.predictions(deviceId: deviceId),
    ]);
    // Backend mengurutkan time DESC; grafik butuh menaik.
    final rows = (results[0]).cast<Map<String, dynamic>>().reversed.toList();
    final predictionGroups = (results[1]).cast<Map<String, dynamic>>();

    final latest = rows.isEmpty ? null : rows.last;

    double? valueOf(Map<String, dynamic>? row, WaterParameter p) =>
        (row?[p.jsonKey] as num?)?.toDouble();

    // --- Nilai terkini per parameter (FR-08) ---
    final readings = <ParameterReading>[
      for (final p in WaterParameter.values)
        if (valueOf(latest, p) case final v?)
          ParameterReading(
            parameter: p,
            value: v,
            status: statusOf(p, v),
          ),
    ];

    // --- Prediksi (FR-09) ---
    // /quality/predictions memberi seluruh horizon dari satu run terakhir,
    // urut horizon menaik. Ambil horizon terjauh yang masih dalam jendela.
    final horizons = predictionGroups.isEmpty
        ? const <Map<String, dynamic>>[]
        : (predictionGroups.first['predictions'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .where((p) =>
                (p['horizon_minutes'] as int) <=
                kPredictionHorizonLimitMinutes)
            .toList();
    final target = horizons.isEmpty ? null : horizons.last;

    final predictions = <ParameterPrediction>[
      for (final p in WaterParameter.values)
        ParameterPrediction(
          parameter: p,
          text: '${p.label}: '
              '${trendSentence(p, valueOf(latest, p), (target?[p.predictedJsonKey] as num?)?.toDouble())}',
        ),
    ];

    // --- Grafik tren ---
    final trends = <TrendSeries>[
      for (final p in WaterParameter.values)
        if (_pointsFor(rows, p) case final points when points.isNotEmpty)
          () {
            final bounds = axisBoundsFor([for (final t in points) t.value]);
            return TrendSeries(
              parameter: p,
              status: statusOf(p, points.last.value),
              points: points,
              minY: bounds.minY,
              maxY: bounds.maxY,
            );
          }(),
    ];

    return PondDetail(
      pondId: pondId,
      pondName: kolam.nama,
      iotId: kolam.deviceCode,
      readings: readings,
      predictions: predictions,
      trends: trends,
    );
  }

  /// Titik grafik satu parameter. Baris yang nilainya null dilewati — jangan
  /// pernah dikarang jadi 0.0, itu akan tampil sebagai anjlok drastis.
  List<TrendPoint> _pointsFor(
    List<Map<String, dynamic>> rows,
    WaterParameter p,
  ) =>
      [
        for (final r in rows)
          if ((r[p.jsonKey] as num?)?.toDouble() case final v?)
            TrendPoint(
              // Timestamp backend timezone-aware -> DateTime.parse menghasilkan
              // UTC. Tanpa toLocal() seluruh jam meleset dari WIB.
              time: DateTime.parse(r['time'] as String).toLocal(),
              value: v,
            ),
      ];

  Future<void> refresh(String pondId) async {
    state = const AsyncLoading();
    ref.invalidate(kolamListProvider);
    state = await AsyncValue.guard(() => _fetchDetail(pondId));
  }
}

final pondDetailControllerProvider = AsyncNotifierProviderFamily<
    PondDetailController, PondDetail, String>(PondDetailController.new);

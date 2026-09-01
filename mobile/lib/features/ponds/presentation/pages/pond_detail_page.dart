import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/water_parameter.dart';
import '../controllers/pond_detail_controller.dart';
import '../widgets/parameter_card.dart';
import '../widgets/prediction_box.dart';
import '../widgets/trend_chart_card.dart';

class PondDetailPage extends ConsumerWidget {
  const PondDetailPage({super.key, required this.pondId});

  final String pondId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(pondDetailControllerProvider(pondId));

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: detailAsync.maybeWhen(
          data: (detail) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                detail.pondName,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                detail.iotId == null
                    ? 'Belum ada perangkat'
                    : 'ID: ${detail.iotId}',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.normal,
                  color: AppColors.textSecondary,
                ),
              ),
            ],
          ),
          orElse: () => const Text(''),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => context.push(AppRoutes.notifications),
          ),
          IconButton(
            icon: const Icon(Icons.person_outline_rounded),
            onPressed: () => context.push(AppRoutes.profile),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: detailAsync.when(
          data: (detail) => RefreshIndicator(
            onRefresh: () => ref
                .read(pondDetailControllerProvider(pondId).notifier)
                .refresh(pondId),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (detail.iotId == null)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 48, horizontal: 16),
                    child: Text(
                      'Belum ada perangkat terpasang di kolam ini.\n'
                      'Klaim perangkat lewat dashboard web untuk mulai '
                      'memantau.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ),
                Row(
                  children: [
                    for (final reading in detail.readings) ...[
                      Expanded(
                        child: ParameterCard(
                          reading: reading,
                          onLogHistorisTap: () => context.push(
                            AppRoutes.pondLogPath(
                              pondId,
                              reading.parameter.slug,
                            ),
                          ),
                        ),
                      ),
                      if (reading != detail.readings.last)
                        const SizedBox(width: 10),
                    ],
                  ],
                ),
                const SizedBox(height: 16),
                PredictionBox(predictions: detail.predictions),
                const SizedBox(height: 20),
                Row(
                  children: const [
                    Icon(Icons.show_chart_rounded,
                        size: 18, color: AppColors.textPrimary),
                    SizedBox(width: 6),
                    Text(
                      'Grafik Historis Pemantauan',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                for (final series in detail.trends) ...[
                  TrendChartCard(series: series),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('Gagal memuat data: $error')),
        ),
      ),
    );
  }
}

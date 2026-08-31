import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../domain/pond_detail.dart';
import '../../domain/water_parameter.dart';
import 'mini_line_chart.dart';

class TrendChartCard extends StatelessWidget {
  const TrendChartCard({super.key, required this.series});

  final TrendSeries series;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Tren ${series.parameter.label} (${series.parameter.unit})',
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                StatusBadge(status: series.status, compact: true),
              ],
            ),
            const SizedBox(height: 4),
            MiniLineChart(series: series),
          ],
        ),
      ),
    );
  }
}

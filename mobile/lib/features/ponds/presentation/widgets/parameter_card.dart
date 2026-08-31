import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/status_badge.dart';
import '../../domain/pond_detail.dart';
import '../../domain/water_parameter.dart';

class ParameterCard extends StatelessWidget {
  const ParameterCard({
    super.key,
    required this.reading,
    required this.onLogHistorisTap,
  });

  final ParameterReading reading;
  final VoidCallback onLogHistorisTap;

  @override
  Widget build(BuildContext context) {
    final p = reading.parameter;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(p.icon, size: 16, color: AppColors.primary),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    p.label,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              reading.value.toStringAsFixed(1),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            Text(
              p.unit,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            StatusBadge(status: reading.status, compact: true),
            const SizedBox(height: 10),
            InkWell(
              onTap: onLogHistorisTap,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.description_outlined,
                      size: 13, color: AppColors.primary),
                  SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      'Log Historis',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

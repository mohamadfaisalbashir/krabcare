import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/pond_detail.dart';
import '../../domain/water_parameter.dart';

/// Box prediksi FTS (FR-09), ditandai warna biru muda pada mockup.
class PredictionBox extends StatelessWidget {
  const PredictionBox({
    super.key,
    required this.predictions,
    this.horizonLabel = '3 Jam Kedepan',
  });

  final List<ParameterPrediction> predictions;
  final String horizonLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFBFDBFE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.query_stats_rounded,
                  size: 18, color: AppColors.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Prediksi Kualitas Air ($horizonLabel)',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryDark,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final p in predictions) ...[
            _PredictionLine(prediction: p),
            if (p != predictions.last) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _PredictionLine extends StatelessWidget {
  const _PredictionLine({required this.prediction});

  final ParameterPrediction prediction;

  @override
  Widget build(BuildContext context) {
    // "pH Air: ..." -> bold bagian sebelum ':' saja
    final parts = prediction.text.split(':');
    final label = parts.first;
    final rest = parts.length > 1 ? parts.sublist(1).join(':').trim() : '';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(prediction.parameter.icon, size: 14, color: AppColors.primary),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textPrimary,
                height: 1.4,
              ),
              children: [
                TextSpan(
                  text: '$label: ',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                TextSpan(text: rest),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

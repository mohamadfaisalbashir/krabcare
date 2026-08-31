import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/app_notification.dart';

class NotificationCard extends StatelessWidget {
  const NotificationCard({super.key, required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    final status = notification.status;
    final trigger = notification.trigger;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: status.bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: status.textColor.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_iconFor(status, trigger), color: status.textColor, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        '${trigger.title} · ${notification.pondName}',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: status.textColor,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      notification.relativeTimeLabel,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  notification.message,
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textPrimary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconFor(WaterStatus status, NotificationTrigger trigger) {
    if (trigger == NotificationTrigger.pemulihan) {
      return Icons.check_circle_outline_rounded;
    }
    // Bahaya pakai ikon "cancel" (⊗) sesuai mockup, Waspada pakai warning.
    return status == WaterStatus.bahaya
        ? Icons.cancel_outlined
        : Icons.warning_amber_rounded;
  }
}

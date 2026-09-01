import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/app_notification.dart';
import '../controllers/notifications_controller.dart';

class NotificationCard extends ConsumerWidget {
  const NotificationCard({super.key, required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = notification.status;
    final trigger = notification.trigger;
    final isRead = notification.isRead;

    final card = Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        // Yang sudah dibaca ditampilkan lebih pudar supaya yang baru menonjol.
        color: isRead ? AppColors.surface : status.bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isRead
              ? AppColors.border
              : status.textColor.withValues(alpha: 0.25),
        ),
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
                    if (!isRead) ...[
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: status.textColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
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

    if (isRead) return card;
    return InkWell(
      onTap: () => ref
          .read(notificationsControllerProvider.notifier)
          .markRead(notification.id),
      borderRadius: BorderRadius.circular(14),
      child: card,
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

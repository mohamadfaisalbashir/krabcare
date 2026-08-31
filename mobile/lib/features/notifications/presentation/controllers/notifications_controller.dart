import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/app_notification.dart';

/// TODO: ganti _fetchNotifications() dengan panggilan ke NotificationRepository
/// (GET /notifications) begitu endpoint sudah tersedia. Untuk push notification
/// real-time (FR-05), integrasikan Firebase Cloud Messaging terpisah dari
/// controller ini (controller ini untuk riwayat/log notifikasi).
class NotificationsController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() {
    return _fetchNotifications();
  }

  Future<List<AppNotification>> _fetchNotifications() async {
    // --- Data dummy sementara, ganti dengan API call asli ---
    await Future.delayed(const Duration(milliseconds: 500));
    final now = DateTime.now();
    return [
      AppNotification(
        id: '1',
        pondName: 'Kolam A',
        trigger: NotificationTrigger.prediksi,
        status: WaterStatus.waspada,
        message:
            'Dalam 2 jam ke depan, Suhu Kolam Utama diprediksi mencapai 31°C (Waspada).',
        time: now.subtract(const Duration(seconds: 30)),
      ),
      AppNotification(
        id: '2',
        pondName: 'Kolam A',
        trigger: NotificationTrigger.aktual,
        status: WaterStatus.waspada,
        message: 'Suhu Kolam Utama saat ini 30.5°C (Waspada).',
        time: now.subtract(const Duration(minutes: 5)),
      ),
      AppNotification(
        id: '3',
        pondName: 'Kolam B',
        trigger: NotificationTrigger.aktual,
        status: WaterStatus.bahaya,
        message: 'Salinitas Kolam Pembesaran sempat drop ke 15 ppt.',
        time: now.subtract(const Duration(hours: 2)),
      ),
      AppNotification(
        id: '4',
        pondName: 'Kolam B',
        trigger: NotificationTrigger.pemulihan,
        status: WaterStatus.aman,
        message: 'Salinitas Kolam Pembesaran telah kembali stabil di 25 ppt.',
        time: now.subtract(const Duration(hours: 2, minutes: 10)),
      ),
    ];
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_fetchNotifications);
  }
}

final notificationsControllerProvider =
    AsyncNotifierProvider<NotificationsController, List<AppNotification>>(
  NotificationsController.new,
);

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/api/water_thresholds.dart';
import '../../domain/app_notification.dart';

class NotificationsController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() {
    return _fetchNotifications();
  }

  Future<List<AppNotification>> _fetchNotifications() async {
    final api = ref.watch(apiProvider);
    final kolams = await ref.read(kolamListProvider.future);
    // NotificationOut tidak membawa nama kolam, jadi dicocokkan dari daftar
    // kolam yang sudah di-cache.
    //
    // device_code didahulukan daripada kolam_id: kolam_id disimpan
    // terdenormalisasi saat notifikasi dibuat, sehingga memindahkan device ke
    // kolam lain membuat notifikasi lama menunjuk kolam yang salah.
    // device_code di-join hidup dari tabel devices, jadi selalu mutakhir dan
    // konsisten dengan isi pesan notifikasinya sendiri.
    final namaByDevice = {
      for (final k in kolams)
        if (k.deviceCode != null) k.deviceCode!: k.nama,
    };
    final namaByKolam = {for (final k in kolams) k.id: k.nama};

    final rows = (await api.notifications(limit: 50))
        .cast<Map<String, dynamic>>();

    return [
      for (final n in rows)
        AppNotification(
          id: n['id'] as int,
          pondName: namaByDevice[n['device_code']] ??
              namaByKolam[n['kolam_id'] as int] ??
              (n['device_code'] as String?) ??
              'Kolam #${n['kolam_id']}',
          trigger: triggerFrom(
            n['source'] as String,
            n['quality_category'] as String,
          ),
          status: categoryToStatus(n['quality_category'] as String?),
          message: n['message'] as String,
          time: DateTime.parse(n['created_at'] as String).toLocal(),
          isRead: n['is_read'] as bool,
        ),
    ];
  }

  /// Tandai satu notifikasi sudah dibaca.
  ///
  /// ponytail: menunggu respons sebelum membalik state, tanpa optimistic update.
  /// Backend berada di host yang sama (10.0.2.2), jadi jedanya tak terasa;
  /// rollback baru sepadan kalau aplikasi dipakai lewat jaringan lapangan.
  Future<void> markRead(int id) async {
    final current = state.valueOrNull;
    if (current == null) return;

    await ref.read(apiProvider).markNotificationRead(id);

    state = AsyncData([
      for (final n in current) n.id == id ? n.copyWithRead() : n,
    ]);
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

/// Jumlah notifikasi yang belum dibaca — dipakai titik merah di dashboard.
/// Backend tidak menyediakan endpoint hitungan, jadi dihitung di klien.
final unreadCountProvider = Provider<int>((ref) {
  return ref.watch(notificationsControllerProvider).maybeWhen(
        data: (list) => list.where((n) => !n.isRead).length,
        orElse: () => 0,
      );
});

import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/api/water_thresholds.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/log_entry.dart';
import '../../domain/water_parameter.dart';

typedef LogQuery = ({String pondId, WaterParameter parameter});

/// Satu halaman log. [hasMore] = halaman terakhir terisi penuh, jadi masih ada
/// lanjutannya di server.
typedef LogPage = ({List<LogEntry> entries, bool hasMore});

/// Satu permintaan = 25 baris, diiris di database (LIMIT/OFFSET).
const int kLogPageSize = 25;

class LogHistorisController extends FamilyAsyncNotifier<LogPage, LogQuery> {
  @override
  Future<LogPage> build(LogQuery query) {
    // apiProvider di-watch supaya ganti/keluar akun membuang data basi; filter
    // status & rentang tanggal juga, supaya menggantinya otomatis memuat ulang
    // dari halaman pertama tanpa kode sinkronisasi manual di halaman.
    ref.watch(apiProvider);
    ref.watch(logHistorisFilterProvider);
    ref.watch(logHistorisRangeProvider);
    return _muat(query, offset: 0);
  }

  Future<LogPage> _muat(LogQuery query, {required int offset}) async {
    final api = ref.read(apiProvider);
    final kolams = await ref.read(kolamListProvider.future);
    final deviceId = kolams
        .where((k) => k.id.toString() == query.pondId)
        .firstOrNull
        ?.deviceId;

    if (deviceId == null) return (entries: const <LogEntry>[], hasMore: false);

    final p = query.parameter;
    final rentang = ref.read(logHistorisRangeProvider);
    final rows = (await api.readings(
      deviceId: deviceId,
      // Filter parameter & status jalan di SQL, bukan di sini: filter setelah
      // LIMIT membuat halaman 25 baris bisa menyisakan 2 baris.
      param: p.jsonKey,
      status: ref.read(logHistorisFilterProvider)?.name,
      limit: kLogPageSize,
      offset: offset,
      startTime: rentang?.start,
      // Tanggal dari date picker itu tengah malam; tanpa ini hari terakhir
      // yang dipilih ikut terpotong.
      endTime: rentang == null ? null : _akhirHari(rentang.end),
    ))
        .cast<Map<String, dynamic>>();

    return (
      entries: [
        for (final r in rows)
          // Backend sudah membuang baris yang parameternya null; cek ini yang
          // membuat tipenya non-null di sisi Dart.
          if ((r[p.jsonKey] as num?)?.toDouble() case final v?)
            LogEntry(
              // Timestamp backend UTC; timeLabel membaca .hour mentah.
              time: DateTime.parse(r['time'] as String).toLocal(),
              message: '${p.label} terukur ${formatValue(v)} ${p.unit}',
              // Status per pembacaan memakai ambang (Tabel 2.1), bukan kategori
              // Mamdani: klasifikasi fuzzy hanya ditulis sekali per jam sementara
              // pembacaan masuk tiap 1-15 menit, jadi status fuzzy per baris
              // memang tidak ada. Web melakukan hal yang sama di Log Historis.
              status: statusOf(p, v),
            ),
      ],
      hasMore: rows.length == kLogPageSize,
    );
  }

  /// Halaman berikutnya, ditambahkan ke yang sudah tampil.
  Future<void> loadMore() async {
    final sekarang = state.valueOrNull;
    if (sekarang == null || !sekarang.hasMore) return;

    final berikutnya = await _muat(arg, offset: sekarang.entries.length);
    state = AsyncData((
      entries: [...sekarang.entries, ...berikutnya.entries],
      hasMore: berikutnya.hasMore,
    ));
  }

  Future<void> refresh(LogQuery query) async {
    state = const AsyncLoading();
    ref.invalidate(kolamListProvider);
    state = await AsyncValue.guard(() => _muat(query, offset: 0));
  }
}

DateTime _akhirHari(DateTime d) =>
    DateTime(d.year, d.month, d.day, 23, 59, 59, 999);

final logHistorisControllerProvider =
    AsyncNotifierProviderFamily<LogHistorisController, LogPage, LogQuery>(
  LogHistorisController.new,
);

/// Filter status yang sedang aktif di halaman Log Historis (UI-local state).
/// null berarti "Semua". Di-watch controller, jadi mengubahnya memicu fetch ulang.
final logHistorisFilterProvider = StateProvider<WaterStatus?>((ref) => null);

/// Rentang tanggal yang sedang dilihat. null = semua waktu.
final logHistorisRangeProvider = StateProvider<DateTimeRange?>((ref) => null);

import 'package:app_kepiting/core/api/api_client.dart';
import 'package:app_kepiting/core/theme/app_colors.dart';
import 'package:app_kepiting/features/ponds/presentation/controllers/log_historis_controller.dart';
import 'package:app_kepiting/features/ponds/domain/water_parameter.dart';
import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Membuktikan halaman Log Historis mobile benar-benar meminta data
/// per-halaman ke server (LIMIT/OFFSET + filter di SQL), bukan menarik semua
/// lalu menyaring di HP. Yang diperiksa: isi query yang dikirim.
class _FakeApi extends Api {
  _FakeApi() : super(token: 'token-uji', onUnauthorized: _diam);

  static Future<void> _diam() async {}

  /// Total baris yang "ada di server" — 30 = satu halaman penuh + sisa 5.
  static const int total = 30;

  final List<Map<String, Object?>> permintaan = [];

  @override
  Future<List<dynamic>> listKolam() async => [
        {'id': 1, 'nama': 'Rak Uji'},
      ];

  @override
  Future<List<dynamic>> kolamDevices(int kolamId) async => [
        {'id': 7, 'device_code': 'SLV1'},
      ];

  @override
  Future<List<dynamic>> readings({
    int? deviceId,
    int limit = 100,
    int offset = 0,
    String? param,
    String? status,
    DateTime? startTime,
    DateTime? endTime,
  }) async {
    permintaan.add({
      'deviceId': deviceId,
      'limit': limit,
      'offset': offset,
      'param': param,
      'status': status,
      'start': startTime,
      'end': endTime,
    });

    final sisa = (total - offset).clamp(0, limit);
    return [
      for (var i = 0; i < sisa; i++)
        {
          'time': DateTime.utc(2026, 8, 1)
              .subtract(Duration(minutes: offset + i))
              .toIso8601String(),
          'ph': 7.8,
        },
    ];
  }
}

void main() {
  late _FakeApi api;
  late ProviderContainer container;
  const query = (pondId: '1', parameter: WaterParameter.ph);

  setUp(() {
    api = _FakeApi();
    container = ProviderContainer(
      overrides: [apiProvider.overrideWithValue(api)],
    );
  });

  tearDown(() => container.dispose());

  Future<LogPage> muat() =>
      container.read(logHistorisControllerProvider(query).future);

  test('halaman pertama minta 25 baris, bukan seluruh riwayat', () async {
    final page = await muat();

    expect(page.entries.length, kLogPageSize);
    expect(page.hasMore, isTrue);
    expect(api.permintaan.single['limit'], kLogPageSize);
    expect(api.permintaan.single['offset'], 0);
    // Parameter disaring di SQL, jadi halaman 25 baris tetap penuh.
    expect(api.permintaan.single['param'], 'ph');
    expect(api.permintaan.single['deviceId'], 7);
  });

  test('loadMore menambah halaman berikutnya lewat OFFSET', () async {
    await muat();
    await container
        .read(logHistorisControllerProvider(query).notifier)
        .loadMore();

    final page = container.read(logHistorisControllerProvider(query)).value!;
    expect(page.entries.length, _FakeApi.total);
    // Halaman kedua tidak penuh -> tidak ada lagi lanjutannya.
    expect(page.hasMore, isFalse);
    expect(api.permintaan.last['offset'], kLogPageSize);

    // Sudah habis: loadMore berikutnya tidak menembak server lagi.
    final sebelum = api.permintaan.length;
    await container
        .read(logHistorisControllerProvider(query).notifier)
        .loadMore();
    expect(api.permintaan.length, sebelum);
  });

  test('filter status dikirim ke server dan mengulang dari halaman 1', () async {
    await muat();
    await container
        .read(logHistorisControllerProvider(query).notifier)
        .loadMore();

    container.read(logHistorisFilterProvider.notifier).state =
        WaterStatus.bahaya;
    final page = await muat();

    expect(api.permintaan.last['status'], 'bahaya');
    expect(api.permintaan.last['offset'], 0, reason: 'harus balik ke halaman 1');
    expect(page.entries.length, kLogPageSize);
  });

  test('rentang tanggal dikirim sebagai start_time/end_time, akhir hari penuh',
      () async {
    await muat();

    container.read(logHistorisRangeProvider.notifier).state = DateTimeRange(
      start: DateTime(2026, 8, 1),
      end: DateTime(2026, 8, 3),
    );
    await muat();

    final terakhir = api.permintaan.last;
    expect(terakhir['start'], DateTime(2026, 8, 1));
    // Tanggal dari date picker itu tengah malam; tanpa penyesuaian ini hari
    // terakhir yang dipilih ikut terpotong.
    expect(terakhir['end'], DateTime(2026, 8, 3, 23, 59, 59, 999));
  });
}

// Porting kasus web/src/lib/export.test.ts + batas statusOf.
import 'package:flutter_test/flutter_test.dart';
import 'package:krabcare/logic.dart';

/// Baris palsu. `time` naik seiring index, received_at default +2 detik.
Json baris(int i, [int latensiDtk = 2]) {
  final t = DateTime.utc(2026, 9, 9).add(Duration(minutes: i));
  return {
    'device_id': 1,
    'device_code': 'AAA',
    'time': t.toIso8601String(),
    'received_at': t.add(Duration(seconds: latensiDtk)).toIso8601String(),
    'ph': 7.5,
    'temperature_c': 29,
    'salinity_ppt': 20,
  };
}

String geser(int i, int ms) => DateTime.parse(baris(i)['time']).add(Duration(milliseconds: ms)).toIso8601String();

Map<int, List<BarisAmonia>> amoniaDi(String time, num? pct, String? risk, [int dev = 1]) => petaAmonia([
  {'device_id': dev, 'time': time, 'fraction_nh3_pct': pct, 'risk_level': risk},
]);

List<String> sel(String csv) => csv.split('\n')[1].split(',');

final tanpaAmonia = petaAmonia([]);

GetPage dariHalaman(List<List<Json>> halaman) {
  var n = 0;
  return ({required deviceId, required startTime, required endTime, required limit}) async =>
      n < halaman.length ? halaman[n++] : <Json>[];
}

void main() {
  test('statusOf: batas toleransi & optimal inklusif', () {
    expect(statusOf('ph', 6.5), 'Waspada');
    expect(statusOf('ph', 6.49), 'Bahaya');
    expect(statusOf('ph', 7.5), 'Aman');
    expect(statusOf('ph', 8.5), 'Aman');
    expect(statusOf('ph', 9.01), 'Bahaya');
    expect(statusOf('temperature_c', 29), 'Aman');
    expect(statusOf('temperature_c', 31), 'Waspada');
    expect(statusOf('salinity_ppt', 41), 'Bahaya');
  });

  test('formatValue & formatFraksi', () {
    expect(formatValue(7.63), '7.6');
    expect(formatValue(25.0), '25');
    expect(formatFraksi(5.9985), '6,0');
  });

  test('fetchAllReadings: terlama dulu, satu duplikat batas halaman dibuang', () async {
    final getPage = dariHalaman([
      [for (var k = 0; k < chunk; k++) baris(1999 - k)],
      [for (var k = 0; k < chunk; k++) baris(1000 - k)],
    ]);
    final r = await fetchAllReadings(getPage, 1, '', '');
    expect(r.truncated, false);
    expect(r.rows.length, 1999);
    expect(r.rows.first['time'], baris(1)['time']);
    expect(r.rows.last['time'], baris(1999)['time']);
    expect(r.rows.map((e) => e['time']).toSet().length, 1999);
  });

  test('fetchAllReadings: halaman lanjutan pendek berisi duplikat', () async {
    final getPage = dariHalaman([
      [for (var k = 0; k < chunk; k++) baris(1999 - k)],
      [baris(1000), baris(999)],
    ]);
    final r = await fetchAllReadings(getPage, 1, '', '');
    expect(r.rows.length, chunk + 1);
  });

  test('toCsv: header, latensi, nilai mentah', () {
    final csv = toCsv([baris(0, 3)], paramKeys, {1: 'Kolam A'}, tanpaAmonia);
    expect(
      csv.split('\n')[0],
      'waktu_lokal,waktu_diterima,latensi_detik,device_code,kolam,ph,temperature_c,salinity_ppt,amonia_nh3_persen,amonia_risiko',
    );
    final s = sel(csv);
    expect(s[2], '3');
    expect(s[3], 'AAA');
    expect(s[4], 'Kolam A');
    expect(s.sublist(5, 8), ['7.5', '29', '20']);
  });

  test('toCsv: null jadi sel kosong', () {
    expect(
      sel(
        toCsv(
          [
            {...baris(0), 'ph': null},
          ],
          ['ph'],
          {},
          tanpaAmonia,
        ),
      )[5],
      '',
    );
  });

  test('toCsv: nama kolam berkoma & berkutip dibungkus', () {
    expect(toCsv([baris(0)], ['ph'], {1: 'Kolam A, Rak "1"'}, tanpaAmonia), contains('"Kolam A, Rak ""1"""'));
  });

  test('toCsv: amonia dipasangkan ±30 detik, yang paling dekat', () {
    expect(sel(toCsv([baris(0)], ['ph'], {}, amoniaDi(baris(0)['time'], 3.7, 'perhatian'))).sublist(5), [
      '7.5',
      '3.7',
      'perhatian',
    ]);
    expect(sel(toCsv([baris(0)], ['ph'], {}, amoniaDi(geser(0, 4000), 2.4, 'normal')))[6], '2.4');
    expect(sel(toCsv([baris(0)], ['ph'], {}, amoniaDi(geser(0, toleransiAmoniaMs + 1000), 2.4, 'normal'))).sublist(6), [
      '',
      '',
    ]);
    final peta = petaAmonia([
      {'device_id': 1, 'time': geser(0, -20000), 'fraction_nh3_pct': 1.1, 'risk_level': 'jauh-sebelum'},
      {'device_id': 1, 'time': geser(0, 3000), 'fraction_nh3_pct': 2.2, 'risk_level': 'paling-dekat'},
      {'device_id': 1, 'time': geser(0, 25000), 'fraction_nh3_pct': 3.3, 'risk_level': 'jauh-sesudah'},
    ]);
    expect(sel(toCsv([baris(0)], ['ph'], {}, peta)).sublist(6), ['2.2', 'paling-dekat']);
  });

  test('petaAmonia: device dipisah, bukan cuma waktu', () {
    final peta = petaAmonia([
      {'device_id': 1, 'time': baris(0)['time'], 'fraction_nh3_pct': 1.1, 'risk_level': 'normal'},
      {'device_id': 2, 'time': baris(0)['time'], 'fraction_nh3_pct': 9.9, 'risk_level': 'berbahaya'},
    ]);
    expect(
      sel(
        toCsv(
          [
            {...baris(0), 'device_id': 2},
          ],
          ['ph'],
          {},
          peta,
        ),
      )[6],
      '9.9',
    );
  });

  test('latensiDetik boleh negatif', () => expect(latensiDetik(baris(0, -5)), -5));

  test('namaBerkas', () {
    expect(
      namaBerkas('semua', ['ph'], '2026-09-01', '2026-09-09', 'csv'),
      'log-sensor_semua_ph_2026-09-01_2026-09-09.csv',
    );
    expect(namaBerkas('semua', paramKeys, 'a', 'b', 'xlsx'), 'log-sensor_semua_a_b.xlsx');
    expect(namaBerkas('semua', [], 'a', 'b', 'csv'), 'log-sensor_semua_amonia_a_b.csv');
  });

  test('toCsv tanpa parameter sensor tetap membawa kolom amonia', () {
    final csv = toCsv([baris(0)], [], {}, amoniaDi(baris(0)['time'], 4.2, 'perhatian'));
    expect(
      csv.split('\n')[0],
      'waktu_lokal,waktu_diterima,latensi_detik,device_code,kolam,amonia_nh3_persen,amonia_risiko',
    );
    expect(sel(csv).sublist(5), ['4.2', 'perhatian']);
  });

  // Input ISO UTC tetap: hasilnya harus jam Jakarta apa pun zona waktu mesin.
  test('format tanggal selalu WIB (UTC+7), dd-mm-yyyy dipad', () {
    expect(formatTanggal('2026-01-04T17:00:00Z'), '05-01-2026');
    expect(formatWaktu('2026-03-01T21:05:00Z'), '02-03-2026 04:05');
    expect(formatWaktuDetik('2026-09-09T07:32:07.123456Z'), '09-09-2026 14:32:07');
    expect(formatWaktuDetik('2026-12-31T17:05:07Z'), '01-01-2027 00:05:07');
    expect(formatWaktu('2026-09-09T14:32:00+07:00'), '09-09-2026 14:32');
  });

  test('dayRangeToIso: hari penuh WIB', () {
    final r = dayRangeToIso(DateTime(2026, 9, 1), DateTime(2026, 9, 9));
    expect(r.start, '2026-08-31T17:00:00.000Z');
    expect(r.end, '2026-09-09T16:59:59.999Z');
  });
}

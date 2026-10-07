// Logika murni tanpa Flutter: ambang parameter, format tanggal, dan ekspor.
// Porting dari web/src/lib/{parameter,ammonia,tanggal,export}.ts dan
// categoryToLabel di types.ts. Angka ambang di sini SALINAN KETIGA dari
// Tabel 2.1: ubah bersamaan dengan backend/app/core/water_thresholds.py dan
// web/src/lib/parameter.ts.

typedef Json = Map<String, dynamic>;

const paramKeys = ['ph', 'temperature_c', 'salinity_ppt'];

/// Batas toleransi (min/max) & optimal, Tabel 2.1 dokumen CD GAB.
const range = {
  'ph': (min: 6.5, max: 9.0, lo: 7.5, hi: 8.5),
  'temperature_c': (min: 20.0, max: 35.0, lo: 28.0, hi: 30.0),
  'salinity_ppt': (min: 5.0, max: 40.0, lo: 10.0, hi: 30.0),
};

const paramUi = {
  'ph': (label: 'Konsentrasi pH air', short: 'pH', unit: 'pH', color: 0xFF0E6E5C),
  'temperature_c': (label: 'Suhu kolam', short: 'Suhu', unit: '°C', color: 0xFFC1873A),
  'salinity_ppt': (label: 'Tingkat salinitas', short: 'Salinitas', unit: 'ppt', color: 0xFF1B7FAE),
};

/// Di luar toleransi → Bahaya. Di luar optimal (masih toleransi) → Waspada.
String statusOf(String param, num value) {
  final r = range[param]!;
  if (value < r.min || value > r.max) return 'Bahaya';
  if (value < r.lo || value > r.hi) return 'Waspada';
  return 'Aman';
}

/// Angka mentah tanpa ".0" di belakang: 29.0 → "29", 7.5 → "7.5" (sama dengan String(n) di JS).
String numStr(num v) => v == v.truncate() ? v.truncate().toString() : v.toString();

/// Maksimal 1 desimal tanpa nol di belakang: 7.63 → "7.6", 25.00 → "25".
String formatValue(num v) => numStr(double.parse(v.toStringAsFixed(1)));

/// Posisi nilai di rentang toleransi, 0..1, dijepit.
double rangeFrac(String param, num v) {
  final r = range[param]!;
  return ((v - r.min) / (r.max - r.min)).clamp(0.0, 1.0).toDouble();
}

const _stable = {'ph': 0.1, 'temperature_c': 0.3, 'salinity_ppt': 0.5};

/// Kalimat tren dari deret ramalan satu parameter.
String trendSentence(String param, List<num> values) {
  final ui = paramUi[param]!;
  final first = values.first, last = values.last;
  final satuan = ui.unit == ui.short ? '' : ' ${ui.unit}';
  if ((last - first).abs() < _stable[param]!) {
    final mn = values.reduce((a, b) => a < b ? a : b);
    final mx = values.reduce((a, b) => a > b ? a : b);
    final angka = mn == mx ? formatValue(mx) : '${formatValue(mn)} sampai ${formatValue(mx)}';
    return '${ui.short} berkisar di angka $angka$satuan.';
  }
  return '${ui.short} diprediksi ${last > first ? 'naik' : 'turun'} mendekati ${formatValue(last)}$satuan.';
}

/// baik/sedang/buruk dari backend → label UI. Nilai asing jatuh ke Waspada.
String categoryToLabel(String? cat) => const {'baik': 'Aman', 'sedang': 'Waspada', 'buruk': 'Bahaya'}[cat] ?? 'Waspada';

// Amonia (web/src/lib/ammonia.ts)

const amoniaPerhatian = 6.0, amoniaBerbahaya = 15.0, amoniaSkalaMaks = 20.0;
const amoniaDisclaimer =
    'Amonia hanya perkiraan karena sensornya tidak terpasang. Angkanya dihitung dari pH, suhu, dan salinitas.';

const riskToStatusMap = {'normal': 'Aman', 'perhatian': 'Waspada', 'berbahaya': 'Bahaya'};
const statusToRisk = {'Aman': 'normal', 'Waspada': 'perhatian', 'Bahaya': 'berbahaya'};

String? riskToStatus(String? level) => riskToStatusMap[level];

/// Satu desimal, koma ala Indonesia: 5.9985 → "6,0".
String formatFraksi(num pct) => pct.toStringAsFixed(1).replaceAll('.', ',');

String trenAmonia(List<num> values) {
  final first = values.first, last = values.last;
  if ((last - first).abs() < 0.3) {
    final mn = values.reduce((a, b) => a < b ? a : b);
    final mx = values.reduce((a, b) => a > b ? a : b);
    final angka = mn == mx ? formatFraksi(mx) : '${formatFraksi(mn)} sampai ${formatFraksi(mx)}';
    return 'Fraksi NH₃ berkisar $angka% dari TAN.';
  }
  return 'Fraksi NH₃ diprediksi ${last > first ? 'naik' : 'turun'} mendekati ${formatFraksi(last)}% dari TAN.';
}

// Tanggal (web/src/lib/tanggal.ts): dd-mm-yyyy, selalu jam Jakarta apa pun zona
// waktu HP, sama dengan web. WIB = UTC+7 tanpa DST, jadi offset tetap sudah benar.

const wibOffset = Duration(hours: 7);

/// Waktu `iso` sebagai jam dinding WIB: baca lewat .year/.day/.hour, bukan dikonversi lagi.
DateTime wib(String iso) => DateTime.parse(iso).toUtc().add(wibOffset);

/// Tanggal kalender hari ini di Jakarta (nilai awal date picker & ekspor).
DateTime hariIniWib() {
  final n = DateTime.now().toUtc().add(wibOffset);
  return DateTime(n.year, n.month, n.day);
}

/// Tanggal kalender (hasil date picker) → ISO UTC dari jam `jam` WIB hari itu.
DateTime wibKeUtc(DateTime tanggal, [int jam = 0]) =>
    DateTime.utc(tanggal.year, tanggal.month, tanggal.day, jam).subtract(wibOffset);

String _p(int n) => n.toString().padLeft(2, '0');

/// dd-mm-yyyy dari tanggal kalender (hasil date picker), tanpa konversi zona.
String tanggal(DateTime d) => '${_p(d.day)}-${_p(d.month)}-${d.year}';

String formatTanggal(String iso) => tanggal(wib(iso));

String formatJam(String iso) {
  final d = wib(iso);
  return '${_p(d.hour)}:${_p(d.minute)}';
}

String formatWaktu(String iso) => '${formatTanggal(iso)} ${formatJam(iso)}';

String formatWaktuDetik(String iso) => '${formatWaktu(iso)}:${_p(wib(iso).second)}';

/// yyyy-mm-dd dari tanggal kalender, untuk nama berkas ekspor.
String isoDay(DateTime d) => '${d.year}-${_p(d.month)}-${_p(d.day)}';

/// Rentang hari WIB [00:00, 23:59:59.999] sebagai ISO UTC untuk query API.
({String start, String end}) dayRangeToIso(DateTime from, DateTime to) => (
  start: wibKeUtc(from).toIso8601String(),
  end: wibKeUtc(to, 24).subtract(const Duration(milliseconds: 1)).toIso8601String(),
);

// Ekspor (web/src/lib/export.ts)

const chunk = 1000;
const maxPages = 20;
const toleransiAmoniaMs = 30000;
const csvBom = '\uFEFF';

typedef GetPage = Future<List<Json>> Function({
  required int deviceId,
  required String startTime,
  required String endTime,
  required int limit,
});

/// Semua reading satu device dalam rentang, menembus batas 1000. /readings
/// tidak punya cursor, jadi paging mundur lewat end_time (inklusif): baris
/// pertama tiap halaman lanjutan = baris terakhir halaman sebelumnya, dibuang
/// tepat satu. `time` dipakai verbatim (presisi mikrodetik). Hasil terlama dulu.
Future<({List<Json> rows, bool truncated})> fetchAllReadings(
  GetPage getPage,
  int deviceId,
  String startTime,
  String endIso,
) async {
  final rows = <Json>[];
  var cursor = endIso;
  for (var i = 0; i < maxPages; i++) {
    final page = await getPage(deviceId: deviceId, startTime: startTime, endTime: cursor, limit: chunk);
    rows.addAll(rows.isNotEmpty && page.isNotEmpty && page.first['time'] == cursor ? page.skip(1) : page);
    if (page.length < chunk) return (rows: rows.reversed.toList(), truncated: false);
    cursor = page.last['time'] as String;
  }
  return (rows: rows.reversed.toList(), truncated: true);
}

String _cell(String s) => RegExp(r'[",\n;]').hasMatch(s) ? '"${s.replaceAll('"', '""')}"' : s;

/// Detik antara jam device (`time`) dan jam backend (`received_at`). Boleh negatif.
num latensiDetik(Json r) {
  final us = DateTime.parse(r['received_at']).difference(DateTime.parse(r['time'])).inMicroseconds;
  return us % 1000000 == 0 ? us ~/ 1000000 : us / 1e6;
}

typedef BarisAmonia = ({int t, num? pct, String? risk});

/// Amonia per device, terurut waktu naik (syarat binary search di cariAmonia).
Map<int, List<BarisAmonia>> petaAmonia(List<Json> rows) {
  final peta = <int, List<BarisAmonia>>{};
  for (final a in rows) {
    peta.putIfAbsent(a['device_id'] as int, () => []).add((
      t: DateTime.parse(a['time']).millisecondsSinceEpoch,
      pct: a['fraction_nh3_pct'] as num?,
      risk: a['risk_level'] as String?,
    ));
  }
  for (final arr in peta.values) {
    arr.sort((x, y) => x.t.compareTo(y.t));
  }
  return peta;
}

/// Amonia device ini yang waktunya paling dekat dengan `time`, maks. ±30 detik.
BarisAmonia? cariAmonia(Map<int, List<BarisAmonia>> peta, int deviceId, String time) {
  final arr = peta[deviceId];
  if (arr == null || arr.isEmpty) return null;
  final target = DateTime.parse(time).millisecondsSinceEpoch;
  var lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    final mid = (lo + hi) >> 1;
    if (arr[mid].t < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  var best = arr[lo];
  if (lo > 0 && (arr[lo - 1].t - target).abs() < (best.t - target).abs()) best = arr[lo - 1];
  return (best.t - target).abs() <= toleransiAmoniaMs ? best : null;
}

List<String> headerFor(List<String> params) => [
  'waktu_lokal',
  'waktu_diterima',
  'latensi_detik',
  'device_code',
  'kolam',
  ...params,
  'amonia_nh3_persen',
  'amonia_risiko',
];

String toCsv(List<Json> rows, List<String> params, Map<int, String> kolamByDevice, Map<int, List<BarisAmonia>> amonia) {
  final lines = [headerFor(params).join(',')];
  for (final r in rows) {
    final a = cariAmonia(amonia, r['device_id'], r['time']);
    lines.add(
      [
        formatWaktuDetik(r['time']),
        formatWaktuDetik(r['received_at']),
        numStr(latensiDetik(r)),
        _cell(r['device_code']),
        _cell(kolamByDevice[r['device_id']] ?? ''),
        for (final p in params) r[p] == null ? '' : numStr(r[p]),
        a?.pct == null ? '' : numStr(a!.pct!),
        a?.risk == null ? '' : _cell(a!.risk!),
      ].join(','),
    );
  }
  return lines.join('\n');
}

String namaBerkas(String label, List<String> params, String from, String to, String format) {
  final part = params.isEmpty
      ? '_amonia'
      : params.length == 3
      ? ''
      : '_${params.join('-')}';
  return 'log-sensor_$label${part}_${from}_$to.$format';
}

// Dashboard operator + detail kolam. Porting dashboard/page.tsx, PondCard,
// RakDetail, ParameterStrip, AmmoniaCell, PredictionPanel, CombinedChart, DangerZone.
import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../logic.dart';
import '../ui.dart';

typedef KolamItem = ({Json kolam, List<Json> devices, Json? quality, Json? reading, Json? ammonia});

String? _statusKualitas(Json? quality) {
  final c = quality?['classification'];
  return c == null ? null : categoryToLabel(c['quality_category']);
}

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<KolamItem> items = [];
  bool loading = true, formOpen = false, creating = false;
  String? error, formError;
  Timer? poll;
  final nama = TextEditingController(), kode = TextEditingController();

  @override
  void initState() {
    super.initState();
    load();
    // Sensor kirim jauh lebih sering daripada orang menarik layar untuk refresh.
    poll = Timer.periodic(const Duration(seconds: 60), (_) => load(silent: true));
  }

  @override
  void dispose() {
    poll?.cancel();
    super.dispose();
  }

  Future<T?> _atauNull<T>(Future<T> f) async {
    try {
      return await f;
    } catch (_) {
      return null;
    }
  }

  /// Reading diambil per device: /readings memotong `limit` secara global.
  Future<void> load({bool silent = false}) async {
    if (!silent) setState(() => loading = true);
    try {
      final [kolamList, qualityList] = await Future.wait([api.listKolam(), api.getLatestQuality()]);
      final hasil = await Future.wait(
        kolamList.map((kolam) async {
          final devices = await _atauNull(api.getKolamDevices(kolam['id'])) ?? [];
          final ids = devices.map((d) => d['id']).toSet();
          final quality = qualityList.where((q) => ids.contains(q['device_id'])).firstOrNull;
          Json? reading, ammonia;
          if (devices.isNotEmpty) {
            final id = devices.first['id'] as int;
            reading = (await _atauNull(api.getReadings(deviceId: id, limit: 1)))?.firstOrNull;
            ammonia = (await _atauNull(api.getAmmoniaRisk(id)))?.firstOrNull?['current'];
          }
          return (kolam: kolam, devices: devices, quality: quality, reading: reading, ammonia: ammonia);
        }),
      );
      if (mounted) {
        setState(() {
          items = hasil;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> tambahKolam() async {
    setState(() {
      creating = true;
      formError = null;
    });
    try {
      await api.createKolam(nama.text.trim(), kode.text.trim());
      nama.clear();
      kode.clear();
      setState(() => formOpen = false);
      await load();
    } catch (e) {
      setState(() => formError = '$e');
    } finally {
      if (mounted) setState(() => creating = false);
    }
  }

  Future<void> buka(KolamItem item) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => RakDetailScreen(kolam: item.kolam)));
    load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final hitung = <String, int>{};
    for (final i in items) {
      final s = _statusKualitas(i.quality);
      if (s != null) hitung[s] = (hitung[s] ?? 0) + 1;
    }
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _Banner(jumlah: items.length, hitung: hitung),
          const SizedBox(height: 16),
          if (loading && items.isEmpty) const Center(child: CircularProgressIndicator()),
          ErrorText(error),
          if (!loading && items.isEmpty && error == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('Belum ada kolam. Tambahkan kolam pertama dengan kode device-nya.'),
            ),
          for (final item in items) ...[_PondCard(item: item, onTap: () => buka(item)), const SizedBox(height: 10)],
          Card(
            child: formOpen
                ? Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Tambah kolam', style: TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 10),
                        TextField(
                          controller: nama,
                          decoration: const InputDecoration(labelText: 'Nama kolam'),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: kode,
                          textCapitalization: TextCapitalization.characters,
                          decoration: const InputDecoration(
                            labelText: 'Kode device',
                            helperText: 'MAC ESP32 tanpa titik dua, huruf besar',
                          ),
                        ),
                        ErrorText(formError),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            TextButton(onPressed: () => setState(() => formOpen = false), child: const Text('Batal')),
                            FilledButton(
                              onPressed: creating ? null : tambahKolam,
                              child: Text(creating ? 'Menyimpan…' : 'Simpan'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  )
                : ListTile(
                    leading: const Icon(Icons.add, color: cBrand600),
                    title: const Text('Tambah kolam', style: TextStyle(color: cBrand600)),
                    onTap: () => setState(() => formOpen = true),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.jumlah, required this.hitung});
  final int jumlah;
  final Map<String, int> hitung;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(8),
    child: Stack(
      children: [
        Positioned.fill(
          child: Image.asset('assets/kepiting.png', fit: BoxFit.cover, alignment: Alignment.centerLeft),
        ),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [cHero.withValues(alpha: .92), cHero.withValues(alpha: .55)]),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Monitoring kualitas air', style: TextStyle(color: Color(0xFFC4E3D9))),
              const Text(
                'Dashboard',
                style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700),
              ),
              Text('$jumlah kolam terhubung', style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  for (final s in ['Aman', 'Waspada', 'Bahaya'])
                    Chip(
                      visualDensity: VisualDensity.compact,
                      backgroundColor: statusStyle[s]!.bg,
                      side: BorderSide.none,
                      label: Text(
                        '${hitung[s] ?? 0} $s',
                        style: TextStyle(color: statusStyle[s]!.fg, fontWeight: FontWeight.w600),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _PondCard extends StatelessWidget {
  const _PondCard({required this.item, required this.onTap});
  final KolamItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = _statusKualitas(item.quality);
    final r = item.reading;
    String v(String p, [String suffix = '']) => r?[p] == null ? 'N/A' : '${formatValue(r![p])}$suffix';
    final nh3 = item.ammonia?['fraction_nh3_pct'];
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: statusStyle[status]?.bg ?? cBrand50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(Icons.waves, color: status == null ? cBrand600 : statusColor(status)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.kolam['nama'],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                        Row(
                          children: [
                            Dot(statusColor(status)),
                            const SizedBox(width: 6),
                            Text(status ?? 'Belum ada data', style: TextStyle(color: statusColor(status))),
                            if (r != null) Text('  ·  ${formatJam(r['time'])}', style: const TextStyle(color: cInk)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: cAxis),
                ],
              ),
              const Divider(height: 20),
              DefaultTextStyle.merge(
                style: mono.copyWith(fontSize: 13, color: cMuted),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('pH ${v('ph')}'),
                    Text(v('temperature_c', '°')),
                    Text('${v('salinity_ppt')} ppt'),
                    Text('NH₃ ${nh3 == null ? 'N/A' : '${formatFraksi(nh3)}%'}'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RakDetailScreen extends StatefulWidget {
  const RakDetailScreen({super.key, required this.kolam});
  final Json kolam;
  @override
  State<RakDetailScreen> createState() => _RakDetailScreenState();
}

class _RakDetailScreenState extends State<RakDetailScreen> {
  late String namaKolam = widget.kolam['nama'];
  int get kolamId => widget.kolam['id'];
  Json? device, quality, ammonia;
  List<Json> history = [], predictions = [];
  bool loading = true, busy = false;
  String? error, rakMsg, hapusError;
  String param = 'ph';
  String? panel; // panel Pengaturan Kolam yang terbuka: 'nama' | 'hapus' | null
  Timer? poll;
  final kode = TextEditingController(), namaBaru = TextEditingController(), ketikNama = TextEditingController();

  @override
  void initState() {
    super.initState();
    namaBaru.text = namaKolam;
    loadDevice();
    poll = Timer.periodic(const Duration(seconds: 60), (_) => loadData());
  }

  @override
  void dispose() {
    poll?.cancel();
    super.dispose();
  }

  Future<void> loadDevice() async {
    try {
      final devices = await api.getKolamDevices(kolamId);
      device = devices.firstOrNull;
      await loadData();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> loadData() async {
    final d = device;
    if (d == null) return;
    try {
      final res = await Future.wait([
        api.getLatestQuality(d['id']),
        api.getReadings(deviceId: d['id'], limit: 100),
        api.getPredictions(d['id']),
        api.getAmmoniaRisk(d['id']),
      ]);
      if (!mounted) return;
      setState(() {
        quality = res[0].firstOrNull;
        history = res[1].reversed.toList(); // backend: terbaru dulu
        predictions = ((res[2].firstOrNull?['predictions'] ?? []) as List).cast<Json>();
        ammonia = res[3].firstOrNull;
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> run(Future<void> Function() f, void Function(String) onError) async {
    setState(() => busy = true);
    try {
      await f();
    } catch (e) {
      onError('$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _statusKualitas(quality);
    final reading = history.lastOrNull;
    return Scaffold(
      appBar: AppBar(title: const Text('Detail Kolam')),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: loadDevice,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                children: [
                  Text(
                    namaKolam,
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: cBrand700),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (status != null) StatusBadge(status),
                      _Pill(
                        Icons.power_outlined,
                        device == null ? 'Belum terhubung ke device' : 'Terhubung ke ${device!['device_code']}',
                      ),
                      if (reading != null) _Pill(Icons.schedule, 'Pembacaan terakhir ${formatWaktu(reading['time'])}'),
                    ],
                  ),
                  ErrorText(error),
                  const SizedBox(height: 12),
                  if (device == null) _klaim() else ..._data(reading),
                  const SizedBox(height: 12),
                  _pengaturan(),
                ],
              ),
            ),
    );
  }

  Widget _klaim() => Section(
    title: 'Hubungkan device',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Kolam ini belum terhubung ke device. Masukkan kode device (MAC ESP32 tanpa titik dua).'),
        const SizedBox(height: 10),
        TextField(
          controller: kode,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Kode device'),
        ),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: busy
              ? null
              : () => run(() async {
                  await api.claimDevice(kolamId, kode.text.trim());
                  kode.clear();
                  setState(() => loading = true);
                  await loadDevice();
                }, (e) => setState(() => error = e)),
          child: const Text('Hubungkan'),
        ),
      ],
    ),
  );

  List<Widget> _data(Json? reading) {
    final current = ammonia?['current'] as Json?;
    final forecast = ((ammonia?['forecast'] ?? []) as List).cast<Json>();
    final window = predictions.where((p) => p['horizon_minutes'] <= 60).toList();
    const field = {
      'ph': 'predicted_ph',
      'temperature_c': 'predicted_temperature_c',
      'salinity_ppt': 'predicted_salinity_ppt',
    };
    return [
      // Judul, catatan, keterangan, dan legenda warna disamakan dengan
      // SECTION / WarnaKondisiLegend di web/src/components/kolam/RakDetail.tsx.
      Section(
        title: 'Parameter',
        note: amoniaDisclaimer,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final p in paramKeys) _ParamCell(param: p, value: reading?[p]),
            _AmoniaCell(current: current),
            const SizedBox(height: 12),
            Text.rich(
              TextSpan(
                style: const TextStyle(fontSize: 13, color: cMuted, height: 1.5),
                children: [
                  TextSpan(
                    text: 'Angka hijau',
                    style: TextStyle(fontWeight: FontWeight.w700, color: statusColor('Aman')),
                  ),
                  const TextSpan(
                    text: ' di tengah batang adalah rentang optimal untuk kepiting bakau. Selama nilai '
                        'parameter berada di rentang itu, lingkungan kolam sedang paling mendukung pertumbuhan.',
                  ),
                ],
              ),
            ),
            const _WarnaKondisiLegend(),
          ],
        ),
      ),
      const SizedBox(height: 12),
      Section(
        title: 'Prediksi 15/30/60 menit',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final p in paramKeys) ...[
              Text(paramUi[p]!.label, style: const TextStyle(fontWeight: FontWeight.w600)),
              // Garis aksen netral seperti PredictionPanel.tsx: status 15/30/60
              // menit bisa berbeda, jadi warnanya ada di bulatan tiap baris.
              const _AksenNetral(),
              for (final h in const [15, 30, 60])
                _PrediksiRow(h, () {
                  final v = window.where((x) => x['horizon_minutes'] == h).firstOrNull?[field[p]];
                  if (v is! num) return null;
                  return (text: trendSentence(p, [v]), status: statusOf(p, v));
                }()),
              const SizedBox(height: 8),
            ],
            const Text('Risiko amonia (NH₃)', style: TextStyle(fontWeight: FontWeight.w600)),
            const _AksenNetral(),
            for (final h in const [15, 30, 60])
              _PrediksiRow(h, () {
                final f = forecast.where((x) => x['horizon_minutes'] == h && x['fraction_nh3_pct'] != null).firstOrNull;
                if (f == null) return null;
                return (text: trenAmonia([f['fraction_nh3_pct']]), status: riskToStatus(f['risk_level']));
              }()),
            const _WarnaKondisiLegend(),
          ],
        ),
      ),
      const SizedBox(height: 12),
      Section(
        title: 'Grafik Pemantauan',
        note:
            'Pita hijau adalah rentang optimal, garis putus-putus merah adalah batas toleransi. '
            'Nilai di luar garis merah masuk kategori Bahaya. Pilih Semua untuk melihat ketiganya sekaligus.',
        child: history.isEmpty
            ? const Text('Belum ada pembacaan tersimpan untuk rak ini.')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    segments: [
                      for (final p in paramKeys)
                        ButtonSegment(
                          value: p,
                          label: Text(paramUi[p]!.short, style: TextStyle(color: Color(paramUi[p]!.color))),
                        ),
                      const ButtonSegment(value: 'all', label: Text('Semua')),
                    ],
                    selected: {param},
                    onSelectionChanged: (s) => setState(() => param = s.first),
                  ),
                  const SizedBox(height: 12),
                  if (param != 'all') ...[
                    // ParamChip web: kotak warna garis + nama + (satuan).
                    Row(
                      children: [
                        _Swatch(Color(paramUi[param]!.color)),
                        const SizedBox(width: 8),
                        Text(paramUi[param]!.label, style: const TextStyle(fontWeight: FontWeight.w600, color: cInk)),
                        Text(' (${paramUi[param]!.unit})', style: const TextStyle(color: cMuted)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    HistoryChart(rows: history, param: param),
                  ] else
                    for (final p in paramKeys) ...[
                      Row(
                        children: [
                          _Swatch(Color(paramUi[p]!.color)),
                          const SizedBox(width: 6),
                          Text(paramUi[p]!.short, style: const TextStyle(fontWeight: FontWeight.w600)),
                          const Spacer(),
                          Text(() {
                            final v = history.lastWhere((r) => r[p] != null, orElse: () => {})[p];
                            return v == null ? '–' : '${formatValue(v)} ${paramUi[p]!.unit}';
                          }(), style: mono),
                        ],
                      ),
                      HistoryChart(
                        rows: history,
                        param: p,
                        height: p == 'salinity_ppt' ? 150 : 120,
                        showX: p == 'salinity_ppt',
                      ),
                      const SizedBox(height: 8),
                    ],
                  if (param == 'all')
                    const Text(
                      'Tiap parameter punya sumbu nilainya sendiri dalam satuan asli, dan ketiganya berbagi '
                      'sumbu waktu yang sama. Arti pita warnanya sama dengan grafik satu parameter.',
                      style: TextStyle(fontSize: 13, color: cMuted),
                    ),
                ],
              ),
      ),
    ];
  }

  Widget _pengaturan() => Section(
    title: 'Pengaturan Kolam',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => setState(() => panel = panel == 'nama' ? null : 'nama'),
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Ubah nama kolam'),
            ),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: statusColor('Bahaya')),
              onPressed: () => setState(() => panel = panel == 'hapus' ? null : 'hapus'),
              icon: const Icon(Icons.delete_outline, size: 18),
              label: const Text('Hapus Kolam'),
            ),
          ],
        ),
        if (panel == 'nama') ...[
          const SizedBox(height: 12),
          TextField(
            controller: namaBaru,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(labelText: 'Nama kolam'),
          ),
          if (rakMsg != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(rakMsg!)),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: busy || namaBaru.text.trim().isEmpty || namaBaru.text.trim() == namaKolam
                ? null
                : () => run(() async {
                    await api.updateKolam(kolamId, namaBaru.text.trim());
                    setState(() {
                      namaKolam = namaBaru.text.trim();
                      rakMsg = 'Nama kolam berhasil diperbarui.';
                    });
                  }, (e) => setState(() => rakMsg = e)),
            child: Text(busy ? 'Menyimpan...' : 'Simpan'),
          ),
        ],
        if (panel == 'hapus') ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: statusStyle['Bahaya']!.bg.withValues(alpha: .6),
              border: Border.all(color: statusColor('Bahaya').withValues(alpha: .3)),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(Icons.report_outlined, color: statusColor('Bahaya')),
                    const SizedBox(width: 6),
                    Text(
                      'Zona berbahaya',
                      style: TextStyle(color: statusColor('Bahaya'), fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Menghapus kolam ini bersifat permanen dan tidak dapat dibatalkan.',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                Text(
                  'Tidak ada fitur pemulihan. Sekali dihapus, kolam ini beserta notifikasinya hilang selamanya. '
                  'Yang tetap aman: seluruh riwayat pengukuran, klasifikasi, dan prediksi, karena semuanya '
                  'menempel pada perangkat, bukan pada rak. '
                  '${device == null ? 'Kolam ini belum terhubung ke perangkat mana pun.' : 'Perangkat ${device!['device_code']} tidak ikut terhapus, hanya kembali menjadi belum terklaim dan bisa diklaim ulang untuk membuka datanya lagi.'}',
                  style: const TextStyle(fontSize: 13, color: cMuted),
                ),
                const SizedBox(height: 12),
                Text(
                  'Ketik "$namaKolam" untuk mengonfirmasi',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: ketikNama,
                  onChanged: (_) => setState(() {}),
                  autocorrect: false,
                  decoration: InputDecoration(hintText: namaKolam),
                ),
                ErrorText(hapusError),
                const SizedBox(height: 8),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: statusColor('Bahaya')),
                  onPressed: busy || ketikNama.text.trim() != namaKolam
                      ? null
                      : () async {
                          final ok = await confirm(
                            context,
                            'Hapus kolam "$namaKolam" secara permanen?\n\nSeluruh notifikasi kolam ini ikut terhapus. '
                            'Device-nya tidak terhapus, hanya kembali jadi belum diklaim beserta riwayat sensornya.\n\n'
                            'Tindakan ini tidak bisa dibatalkan.',
                            ok: 'Hapus',
                          );
                          if (!ok) return;
                          await run(() async {
                            await api.deleteKolam(kolamId);
                            if (mounted) Navigator.pop(context);
                          }, (e) => setState(() => hapusError = e));
                        },
                  child: Text(busy ? 'Menghapus...' : 'Hapus kolam ini'),
                ),
              ],
            ),
          ),
        ],
      ],
    ),
  );
}

/// DetailPill web: ikon + teks di atas latar putih bergaris tipis.
class _Pill extends StatelessWidget {
  const _Pill(this.icon, this.text);
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: cBorder),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: cInk),
        const SizedBox(width: 6),
        Flexible(
          child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: cInk)),
        ),
      ],
    ),
  );
}

/// Kotak kecil warna garis grafik (ParamChip / label CombinedChart di web).
class _Swatch extends StatelessWidget {
  const _Swatch(this.color);
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: 10,
    height: 10,
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)),
  );
}

/// Garis pemisah netral di bawah judul kolom prediksi (bg-ink h-0.5 di web).
class _AksenNetral extends StatelessWidget {
  const _AksenNetral();
  @override
  Widget build(BuildContext context) => Container(
    height: 2,
    margin: const EdgeInsets.only(top: 6, bottom: 4),
    decoration: BoxDecoration(color: cInk, borderRadius: BorderRadius.circular(1)),
  );
}

/// Legenda warna kondisi, sama isi & warnanya dengan WarnaKondisiLegend di RakDetail.tsx.
class _WarnaKondisiLegend extends StatelessWidget {
  const _WarnaKondisiLegend();

  @override
  Widget build(BuildContext context) {
    Widget item(String s, String teks) => Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Dot(statusColor(s)),
          const SizedBox(width: 6),
          Expanded(
            child: Text('$s: $teks', style: TextStyle(fontSize: 13, color: statusColor(s))),
          ),
        ],
      ),
    );
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 10),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: cBorder))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Warna kondisi:',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: cInk),
          ),
          item('Aman', 'dalam rentang optimal'),
          item('Waspada', 'di luar optimal, masih toleransi'),
          item('Bahaya', 'di luar rentang toleransi'),
        ],
      ),
    );
  }
}

/// Status di pojok kanan kolom: titik membawa warna, kata ditulis warna tinta
/// (seperti ParameterStrip.tsx; teks kuning Waspada di latar terang kurang kontras).
class _StatusPojok extends StatelessWidget {
  const _StatusPojok(this.status);
  final String? status;
  @override
  Widget build(BuildContext context) => status == null
      ? const Text('Belum ada data', style: TextStyle(fontSize: 13, color: cMuted))
      : Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Dot(statusColor(status)),
            const SizedBox(width: 6),
            Text(status!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: cInk)),
          ],
        );
}

/// Label di bawah track: batas bawah, rentang optimal (hijau), batas atas.
class _LabelTrack extends StatelessWidget {
  const _LabelTrack(this.kiri, this.tengah, this.kanan);
  final String kiri, tengah, kanan;
  @override
  Widget build(BuildContext context) {
    final gaya = mono.copyWith(fontSize: 10, color: cMuted);
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(child: Text(kiri, style: gaya)),
          Expanded(
            child: Text(tengah, textAlign: TextAlign.center, style: gaya.copyWith(color: statusColor('Aman'))),
          ),
          Expanded(child: Text(kanan, textAlign: TextAlign.right, style: gaya)),
        ],
      ),
    );
  }
}

/// Track rentang (ParameterStrip.tsx / AmmoniaCell.tsx): batang krem = rentang
/// toleransi, pita teal = rentang optimal, pita merah opsional = wilayah
/// berbahaya (amonia), penanda = nilai sekarang berwarna status.
class _Track extends StatelessWidget {
  const _Track({required this.frac, required this.band, required this.color, this.bahayaMulai});
  final double? frac;
  final (double, double) band; // awal & akhir pita, 0..1
  final Color color;
  final double? bahayaMulai; // 0..1, mulai pita merah sampai ujung kanan

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (_, c) => SizedBox(
      height: 16,
      child: Stack(
        alignment: Alignment.centerLeft,
        children: [
          Container(
            height: 6,
            decoration: BoxDecoration(
              color: statusStyle['Waspada']!.bg.withValues(alpha: .8),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          Positioned(
            left: c.maxWidth * band.$1,
            width: c.maxWidth * (band.$2 - band.$1),
            child: Container(
              height: 6,
              decoration: BoxDecoration(
                color: cBrand700.withValues(alpha: .25),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ),
          if (bahayaMulai != null)
            Positioned(
              left: c.maxWidth * bahayaMulai!,
              right: 0,
              child: Container(
                height: 6,
                decoration: BoxDecoration(
                  color: statusColor('Bahaya').withValues(alpha: .2),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          if (frac != null)
            Positioned(
              left: (c.maxWidth * frac! - 5).clamp(0, c.maxWidth - 10),
              child: Container(
                width: 10,
                height: 16,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(99),
                  border: Border.all(color: Colors.white, width: 2),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class _ParamCell extends StatelessWidget {
  const _ParamCell({required this.param, required this.value});
  final String param;
  final num? value;

  @override
  Widget build(BuildContext context) {
    final ui = paramUi[param]!, r = range[param]!;
    final status = value == null ? null : statusOf(param, value!);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(ui.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              ),
              _StatusPojok(status),
            ],
          ),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: value == null ? 'N/A' : formatValue(value!),
                  style: mono.copyWith(fontSize: 26, fontWeight: FontWeight.w600, color: cInk),
                ),
                if (ui.unit != ui.short || value == null)
                  TextSpan(
                    text: ' ${ui.unit}',
                    style: const TextStyle(color: cMuted),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          _Track(
            frac: value == null ? null : rangeFrac(param, value!),
            band: (rangeFrac(param, r.lo), rangeFrac(param, r.hi)),
            color: statusColor(status),
          ),
          _LabelTrack(formatValue(r.min), '${formatValue(r.lo)} s/d ${formatValue(r.hi)}', formatValue(r.max)),
        ],
      ),
    );
  }
}

class _AmoniaCell extends StatelessWidget {
  const _AmoniaCell({required this.current});
  final Json? current;

  @override
  Widget build(BuildContext context) {
    final pct = current?['fraction_nh3_pct'] as num?;
    final status = riskToStatus(current?['risk_level']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text('Risiko amonia (NH₃)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            ),
            _StatusPojok(status),
          ],
        ),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: pct == null ? 'N/A' : formatFraksi(pct),
                style: mono.copyWith(fontSize: 26, fontWeight: FontWeight.w600, color: cInk),
              ),
              // "%" polos seperti AmmoniaCell.tsx, supaya selebar satuan kolom lain.
              const TextSpan(
                text: ' %',
                style: TextStyle(color: cMuted),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        _Track(
          frac: pct == null ? null : (pct / amoniaSkalaMaks).clamp(0.0, 1.0).toDouble(),
          band: (0, amoniaPerhatian / amoniaSkalaMaks),
          bahayaMulai: amoniaBerbahaya / amoniaSkalaMaks,
          color: statusColor(status),
        ),
        _LabelTrack('0', '0 s/d ${formatFraksi(amoniaPerhatian)}%', numStr(amoniaSkalaMaks)),
        if (current != null && current!['in_valid_range'] == false)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'Di luar rentang tervalidasi persamaan, angka ini hasil ekstrapolasi.',
              style: TextStyle(fontSize: 12, color: cInk),
            ),
          ),
      ],
    );
  }
}

class _PrediksiRow extends StatelessWidget {
  const _PrediksiRow(this.horizon, this.row);
  final int horizon;
  final ({String text, String? status})? row;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6, right: 8),
          // Tanpa data: bulatan tinta pudar (bg-ink/15 di web).
          child: Dot(row == null ? cInk.withValues(alpha: .15) : statusColor(row!.status)),
        ),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$horizon menit: ',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                TextSpan(text: row?.text ?? 'Belum ada data prediksi.'),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

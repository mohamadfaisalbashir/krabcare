// Log historis + ekspor CSV/XLSX. Porting log-historis/page.tsx, ExportPanel.tsx,
// lib/export.ts (bagian unduh).
import 'dart:convert';
import 'dart:typed_data';

import 'package:excel/excel.dart' hide TextSpan;
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../logic.dart';
import '../ui.dart';

const _page = 25;
const _amonia = 'amonia';

typedef Sensor = ({int deviceId, String deviceCode, String kolamNama});

class LogScreen extends StatefulWidget {
  const LogScreen({super.key});
  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  String param = 'ph', statusFilter = 'Semua', mode = 'hari';
  DateTime? dari, sampai;
  int jamDari = 0, jamSampai = 0;
  List<Json> rows = [];
  List<Sensor> sensors = [];
  bool loading = true, loadingMore = false, hasMore = false;
  String? error;
  int _req = 0; // abaikan balasan permintaan lama saat filter berganti cepat

  bool get isAmonia => param == _amonia;

  @override
  void initState() {
    super.initState();
    _loadSensors();
    reload();
  }

  Future<void> _loadSensors() async {
    try {
      final kolams = await api.listKolam();
      final per = await Future.wait(
        kolams.map((k) async {
          try {
            return [
              for (final d in await api.getKolamDevices(k['id']))
                (deviceId: d['id'] as int, deviceCode: d['device_code'] as String, kolamNama: k['nama'] as String),
            ];
          } catch (_) {
            return <Sensor>[];
          }
        }),
      );
      if (mounted) setState(() => sensors = per.expand((e) => e).toList());
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  ({String? start, String? end}) _rentang() {
    if (mode == 'hari') {
      return (
        start: dari == null ? null : dayRangeToIso(dari!, dari!).start,
        end: sampai == null ? null : dayRangeToIso(sampai!, sampai!).end,
      );
    }
    if (dari == null) return (start: null, end: null);
    final start = wibKeUtc(dari!, jamDari);
    var end = wibKeUtc(dari!, jamSampai);
    // Jam akhir <= jam awal berarti lewat tengah malam; 00→00 = sehari penuh.
    if (!end.isAfter(start)) end = end.add(const Duration(days: 1));
    return (start: start.toIso8601String(), end: end.toIso8601String());
  }

  Future<List<Json>> _muat(int offset) {
    final r = _rentang();
    if (isAmonia) {
      return api.getAmmoniaHistory(
        startTime: r.start,
        endTime: r.end,
        onlyMeasured: true,
        riskLevel: statusToRisk[statusFilter],
        limit: _page,
        offset: offset,
      );
    }
    return api.getReadings(
      startTime: r.start,
      endTime: r.end,
      param: param,
      status: statusFilter == 'Semua' ? null : statusFilter.toLowerCase(),
      limit: _page,
      offset: offset,
    );
  }

  Future<void> reload() async {
    final req = ++_req;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final page = await _muat(0);
      if (req != _req || !mounted) return;
      setState(() {
        rows = page;
        hasMore = page.length == _page;
      });
    } catch (e) {
      if (req == _req && mounted) {
        setState(() {
          rows = <Json>[];
          error = '$e';
        });
      }
    } finally {
      if (req == _req && mounted) setState(() => loading = false);
    }
  }

  Future<void> more() async {
    final req = _req;
    setState(() => loadingMore = true);
    try {
      final page = await _muat(rows.length);
      if (req != _req || !mounted) return;
      setState(() {
        rows = [...rows, ...page];
        hasMore = page.length == _page;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loadingMore = false);
    }
  }

  void set(VoidCallback f) {
    setState(f);
    reload();
  }

  Future<DateTime?> _pilihTanggal(DateTime? awal) => showDatePicker(
    context: context,
    initialDate: awal ?? hariIniWib(),
    firstDate: DateTime(2024),
    lastDate: hariIniWib(),
  );

  @override
  Widget build(BuildContext context) {
    String tgl(DateTime? d) => d == null ? 'Pilih' : tanggal(d);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Log historis'),
        actions: [
          IconButton(
            tooltip: 'Unduh data',
            icon: const Icon(Icons.download),
            onPressed: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => ExportSheet(sensors: sensors),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: [
                  for (final p in paramKeys) ButtonSegment(value: p, label: Text(paramUi[p]!.short)),
                  const ButtonSegment(value: _amonia, label: Text('Amonia')),
                ],
                selected: {param},
                onSelectionChanged: (s) => set(() => param = s.first),
              ),
            ),
            const SizedBox(height: 12),
            Section(
              title: 'Rentang waktu',
              trailing: TextButton(
                onPressed: () => set(() {
                  dari = null;
                  sampai = null;
                  jamDari = 0;
                  jamSampai = 0;
                }),
                child: const Text('Semua waktu'),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SegmentedButton<String>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(value: 'hari', label: Text('Per hari')),
                      ButtonSegment(value: 'jam', label: Text('Per jam')),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => set(() => mode = s.first),
                  ),
                  const SizedBox(height: 10),
                  if (mode == 'hari')
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final d = await _pilihTanggal(dari);
                              if (d != null) set(() => dari = d);
                            },
                            child: Text('Dari: ${tgl(dari)}'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final d = await _pilihTanggal(sampai);
                              if (d != null) set(() => sampai = d);
                            },
                            child: Text('Sampai: ${tgl(sampai)}'),
                          ),
                        ),
                      ],
                    )
                  else
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () async {
                              final d = await _pilihTanggal(dari);
                              if (d != null) set(() => dari = d);
                            },
                            child: Text(tgl(dari)),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _Jam(jamDari, (v) => set(() => jamDari = v)),
                        const Text(' – '),
                        _Jam(jamSampai, (v) => set(() => jamSampai = v)),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final s in ['Semua', 'Aman', 'Waspada', 'Bahaya'])
                  ChoiceChip(
                    label: Text(s),
                    selected: statusFilter == s,
                    onSelected: (_) => set(() => statusFilter = s),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            ErrorText(error),
            if (loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (rows.isEmpty && error == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('Tidak ada data pada filter ini.')),
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final r in rows) ...[isAmonia ? _barisAmonia(r) : _barisSensor(r), const Divider(height: 1)],
                  ],
                ),
              ),
            if (hasMore && !loading)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: OutlinedButton(
                  onPressed: loadingMore ? null : more,
                  child: Text(loadingMore ? 'Memuat…' : 'Muat lebih banyak'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _barisSensor(Json r) {
    final v = r[param] as num?;
    final ui = paramUi[param]!;
    return ListTile(
      title: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '${r['device_code']} ',
              style: mono.copyWith(fontSize: 12, color: cAxis),
            ),
            TextSpan(text: '${ui.short} terukur '),
            TextSpan(
              text: v == null ? 'N/A' : '${formatValue(v)} ${ui.unit}',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
      subtitle: Text(formatWaktu(r['time']), style: const TextStyle(color: cBrand700)),
      trailing: v == null ? null : StatusBadge(statusOf(param, v)),
    );
  }

  Widget _barisAmonia(Json r) {
    final pct = r['fraction_nh3_pct'] as num?;
    final status = riskToStatus(r['risk_level']);
    return ListTile(
      title: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '${r['device_code']} ',
              style: mono.copyWith(fontSize: 12, color: cAxis),
            ),
            const TextSpan(text: 'fraksi NH₃ toksik '),
            TextSpan(
              text: pct == null ? 'N/A' : '${formatFraksi(pct)}% dari TAN',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
      subtitle: Text(formatWaktu(r['target_time']), style: const TextStyle(color: cBrand700)),
      trailing: status == null ? null : StatusBadge(status),
    );
  }
}

class _Jam extends StatelessWidget {
  const _Jam(this.value, this.onChanged);
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButton<int>(
    value: value,
    items: [for (var h = 0; h < 24; h++) DropdownMenuItem(value: h, child: Text('${h.toString().padLeft(2, '0')}.00'))],
    onChanged: (v) => onChanged(v!),
  );
}

/// Unduh data mentah sensor (ExportPanel.tsx). Berkas dibagikan lewat lembar
/// share Android, dari situ bisa disimpan ke Files/Drive atau dikirim.
class ExportSheet extends StatefulWidget {
  const ExportSheet({super.key, required this.sensors});
  final List<Sensor> sensors;
  @override
  State<ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends State<ExportSheet> {
  // 7 hari terakhir, termasuk hari ini (WIB). day - 6 dinormalkan DateTime, aman lintas bulan.
  late DateTime to = hariIniWib(), from = DateTime(to.year, to.month, to.day - 6);
  String paramSel = 'semua', format = 'csv';
  bool busy = false;
  int progress = 0;
  String? error, note;

  /// Riwayat amonia terukur; endpoint ini punya offset, jadi paging biasa cukup.
  Future<List<Json>> _ambilAmonia(String start, String end) async {
    final semua = <Json>[];
    for (var i = 0; i < maxPages; i++) {
      final page = await api.getAmmoniaHistory(
        startTime: start,
        endTime: end,
        onlyMeasured: true,
        limit: chunk,
        offset: i * chunk,
      );
      semua.addAll(page);
      if (page.length < chunk) break;
    }
    return semua;
  }

  Future<void> unduh() async {
    setState(() {
      error = null;
      note = null;
    });
    if (from.isAfter(to)) return setState(() => error = "Tanggal 'Dari' melewati tanggal 'Sampai'.");
    if (widget.sensors.isEmpty) return setState(() => error = 'Belum ada sensor yang bisa diunduh.');

    setState(() {
      busy = true;
      progress = 0;
    });
    try {
      Future<List<Json>> getPage({
        required int deviceId,
        required String startTime,
        required String endTime,
        required int limit,
      }) async {
        final rows = await api.getReadings(deviceId: deviceId, startTime: startTime, endTime: endTime, limit: limit);
        if (mounted) setState(() => progress += rows.length);
        return rows;
      }

      final r = dayRangeToIso(from, to);
      final results = await Future.wait(
        widget.sensors.map((s) => fetchAllReadings(getPage, s.deviceId, r.start, r.end)),
      );
      final rows = results.expand((x) => x.rows).toList()
        ..sort((a, b) => DateTime.parse(a['time']).compareTo(DateTime.parse(b['time'])));
      if (rows.isEmpty) return setState(() => error = 'Tidak ada data pada rentang tanggal itu.');

      final params = paramSel == 'semua'
          ? paramKeys
          : paramSel == _amonia
          ? <String>[]
          : [paramSel];
      final kolamByDevice = {for (final s in widget.sensors) s.deviceId: s.kolamNama};
      final amonia = petaAmonia(await _ambilAmonia(r.start, r.end));
      final name = namaBerkas('semua', params, isoDay(from), isoDay(to), format);

      final Uint8List bytes = format == 'xlsx'
          ? _xlsx(rows, params, kolamByDevice, amonia)
          : Uint8List.fromList(utf8.encode(csvBom + toCsv(rows, params, kolamByDevice, amonia)));
      final mime = format == 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile.fromData(bytes, name: name, mimeType: mime)],
          fileNameOverrides: [name],
        ),
      );

      if (results.any((x) => x.truncated)) {
        setState(
          () => note =
              'Batas ${maxPages * chunk} baris per sensor tercapai. Data paling lama terpotong, '
              "jadi berkas ini tidak mulai dari tanggal 'Dari' yang dipilih. Persempit rentang tanggalnya.",
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Kolom sama dengan CSV (headerFor); waktu sebagai sel tanggal, angka sebagai angka.
  Uint8List _xlsx(
    List<Json> rows,
    List<String> params,
    Map<int, String> kolamByDevice,
    Map<int, List<BarisAmonia>> amonia,
  ) {
    final excel = Excel.createExcel();
    final sheet = excel[excel.getDefaultSheet()!];
    final bold = CellStyle(bold: true);
    final gayaTanggal = CellStyle(numberFormat: const CustomDateTimeNumFormat(formatCode: 'dd-mm-yyyy hh:mm:ss'));
    CellValue? angka(num? v) => v == null ? null : (v is int ? IntCellValue(v) : DoubleCellValue(v.toDouble()));

    final header = headerFor(params);
    for (var c = 0; c < header.length; c++) {
      sheet.updateCell(
        CellIndex.indexByColumnRow(columnIndex: c, rowIndex: 0),
        TextCellValue(header[c]),
        cellStyle: bold,
      );
    }
    for (var i = 0; i < rows.length; i++) {
      final r = rows[i];
      final a = cariAmonia(amonia, r['device_id'], r['time']);
      final values = <CellValue?>[
        // Jam dinding WIB, sama dengan kolom waktu di CSV.
        DateTimeCellValue.fromDateTime(wib(r['time'])),
        DateTimeCellValue.fromDateTime(wib(r['received_at'])),
        angka(latensiDetik(r)),
        TextCellValue(r['device_code']),
        TextCellValue(kolamByDevice[r['device_id']] ?? ''),
        for (final p in params) angka(r[p]),
        angka(a?.pct),
        a?.risk == null ? null : TextCellValue(a!.risk!),
      ];
      for (var c = 0; c < values.length; c++) {
        if (values[c] == null) continue; // sel benar-benar kosong, bukan 0
        sheet.updateCell(
          CellIndex.indexByColumnRow(columnIndex: c, rowIndex: i + 1),
          values[c],
          cellStyle: c < 2 ? gayaTanggal : null,
        );
      }
    }
    return Uint8List.fromList(excel.encode()!);
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
    child: SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Unduh data sensor', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (label, isFrom) in [('Dari', true), ('Sampai', false)]) ...[
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final d = await showDatePicker(
                        context: context,
                        initialDate: isFrom ? from : to,
                        firstDate: DateTime(2024),
                        lastDate: hariIniWib(),
                      );
                      if (d != null) setState(() => isFrom ? from = d : to = d);
                    },
                    child: Text('$label: ${tanggal(isFrom ? from : to)}'),
                  ),
                ),
                if (isFrom) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: paramSel,
            decoration: const InputDecoration(labelText: 'Parameter'),
            items: [
              const DropdownMenuItem(value: 'semua', child: Text('Semua parameter')),
              for (final p in paramKeys) DropdownMenuItem(value: p, child: Text(paramUi[p]!.short)),
              const DropdownMenuItem(value: _amonia, child: Text('Amonia saja')),
            ],
            onChanged: (v) => setState(() => paramSel = v!),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'csv', label: Text('CSV')),
              ButtonSegment(value: 'xlsx', label: Text('XLSX')),
            ],
            selected: {format},
            onSelectionChanged: (s) => setState(() => format = s.first),
          ),
          const SizedBox(height: 8),
          const Text(
            'Kolom amonia (fraksi NH₃ & risiko) selalu ikut di berkas.',
            style: TextStyle(fontSize: 12, color: cAxis),
          ),
          ErrorText(error),
          if (note != null) Text(note!, style: TextStyle(color: statusColor('Waspada'))),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: busy ? null : unduh,
            icon: const Icon(Icons.download),
            label: Text(busy ? 'Mengunduh… $progress baris' : 'Unduh'),
          ),
        ],
      ),
    ),
  );
}

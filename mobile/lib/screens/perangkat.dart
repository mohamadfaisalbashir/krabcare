// Kelola device, khusus admin. Porting perangkat/page.tsx.
import 'package:flutter/material.dart';

import '../api.dart';
import '../logic.dart';
import '../ui.dart';
import 'profil.dart' show Msg;

/// Gateway tidak bisa didaftarkan dari sini: ia di-seed lewat SQL dan tidak diklaim ke kolam.
const _tipeLabel = {'slave_node': 'Slave node', 'master_node': 'Master node', 'gateway': 'Gateway'};

class PerangkatScreen extends StatefulWidget {
  const PerangkatScreen({super.key});
  @override
  State<PerangkatScreen> createState() => _PerangkatScreenState();
}

class _PerangkatScreenState extends State<PerangkatScreen> {
  List<Json> devices = [], targetKolams = [];
  bool loading = true, submitting = false;
  int? busyId;
  String tipe = 'slave_node';
  int? parentId; // master slave baru; null = belum ditentukan
  String? listError;
  Msg? formMsg, aksiMsg;
  final kode = TextEditingController();

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final res = await Future.wait([api.listDevices(), api.getTargetKolams().catchError((_) => <Json>[])]);
      if (mounted) {
        setState(() {
          devices = res[0];
          targetKolams = res[1];
          listError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => listError = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> tambah() async {
    setState(() {
      submitting = true;
      formMsg = null;
    });
    try {
      final code = kode.text.trim();
      await api.createDevice(code, tipe, parentId: tipe == 'slave_node' ? parentId : null);
      kode.clear();
      parentId = null;
      setState(() => formMsg = (ok: true, text: "Device '$code' berhasil ditambahkan, siap diklaim ke kolam."));
      await load();
    } catch (e) {
      setState(() => formMsg = (ok: false, text: '$e'));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  Future<void> aksi(Json d, String tanya, Future<void> Function() f, String sukses) async {
    if (!await confirm(context, tanya)) return;
    setState(() {
      busyId = d['id'];
      aksiMsg = null;
    });
    try {
      await f();
      setState(() => aksiMsg = (ok: true, text: sukses));
      await load();
    } catch (e) {
      setState(() => aksiMsg = (ok: false, text: '$e'));
    } finally {
      if (mounted) setState(() => busyId = null);
    }
  }

  Future<void> pasang(Json d) async {
    int? pilih;
    final kolamId = await showDialog<int>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          title: Text('Pasang ${d['device_code']}'),
          content: SizedBox(
            width: double.maxFinite,
            child: targetKolams.isEmpty
                ? const Text('Belum ada kolam yang bisa dipasangi device.')
                : RadioGroup<int>(
                    groupValue: pilih,
                    onChanged: (v) => set(() => pilih = v),
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final k in targetKolams)
                          // Kolam yang sudah memegang device lain tidak bisa dipilih: satu kolam satu device.
                          RadioListTile<int>(
                            value: k['id'],
                            enabled: k['current_device_id'] == null || k['current_device_id'] == d['id'],
                            title: Text('${k['nama']}'),
                            subtitle: Text(
                              '${k['owner_name']} (${k['owner_email']})\n'
                              '${k['current_device_code'] == null ? 'Kosong / Siap' : 'Sudah ada: ${k['current_device_code']}'}',
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
            FilledButton(onPressed: pilih == null ? null : () => Navigator.pop(c, pilih), child: const Text('Pasang')),
          ],
        ),
      ),
    );
    if (kolamId == null) return;
    setState(() {
      busyId = d['id'];
      aksiMsg = null;
    });
    try {
      await api.claimDeviceToKolam(d['id'], kolamId);
      final nama = targetKolams.firstWhere((k) => k['id'] == kolamId)['nama'];
      setState(() => aksiMsg = (ok: true, text: "Device '${d['device_code']}' berhasil dipasang ke kolam '$nama'."));
      await load();
    } catch (e) {
      setState(() => aksiMsg = (ok: false, text: '$e'));
    } finally {
      if (mounted) setState(() => busyId = null);
    }
  }

  /// Keterangan jalur data slave dari parent_device_id (sama dengan keteranganJalur
  /// di perangkat/page.tsx). Hanya catatan untuk admin: yang meneruskan data slave
  /// adalah firmware master, backend tidak memakai relasi ini untuk logika.
  String? _jalur(Json d) {
    if (d['device_type'] != 'slave_node') return null;
    final master = devices.where((m) => m['id'] == d['parent_device_id']).firstOrNull;
    return master == null ? 'Master belum ditentukan' : 'Lewat master ${master['device_code']}';
  }

  Widget _row(Json d) {
    final busy = busyId == d['id'];
    final klaim = d['kolam_id'] != null;
    final jalur = _jalur(d);
    return ListTile(
      title: Text('${d['device_code']}', style: mono.copyWith(fontWeight: FontWeight.w600)),
      subtitle: Text(
        [
          [_tipeLabel[d['device_type']] ?? '${d['device_type']}', ?jalur].join(' · '),
          if (klaim) 'Kolam: ${d['kolam_nama']} (Milik: ${d['owner_nama']})',
          d['last_seen_at'] == null ? 'Belum pernah kirim data' : 'Terakhir aktif: ${formatWaktu(d['last_seen_at'])}',
        ].join('\n'),
      ),
      isThreeLine: true,
      trailing: busy
          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          : PopupMenuButton<String>(
              onSelected: (v) => switch (v) {
                'pasang' => pasang(d),
                'lepas' => aksi(
                  d,
                  "Lepaskan device '${d['device_code']}' dari kolam '${d['kolam_nama']}'?",
                  () => api.unclaimDevice(d['id']),
                  "Device '${d['device_code']}' berhasil dilepas dari kolam '${d['kolam_nama']}'.",
                ),
                _ => aksi(
                  d,
                  "Hapus device '${d['device_code']}' secara permanen?\n\nPerangkat dan seluruh riwayat pengukurannya akan dihapus dari sistem.",
                  () => api.deleteDevice(d['id']),
                  "Device '${d['device_code']}' berhasil dihapus.",
                ),
              },
              itemBuilder: (_) => [
                if (!klaim) const PopupMenuItem(value: 'pasang', child: Text('Pasang ke kolam')),
                if (klaim) const PopupMenuItem(value: 'lepas', child: Text('Lepas dari kolam')),
                const PopupMenuItem(value: 'hapus', child: Text('Hapus')),
              ],
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final belum = devices.where((d) => d['kolam_id'] == null).toList();
    final sudah = devices.where((d) => d['kolam_id'] != null).toList();
    final masters = devices.where((d) => d['device_type'] == 'master_node').toList();
    Widget daftar(String judul, List<Json> list) => Section(
      title: '$judul (${list.length})',
      child: list.isEmpty
          ? const Text('Tidak ada device.', style: TextStyle(color: cInk))
          : Column(children: [for (final d in list) _row(d)]),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Perangkat')),
      body: RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          children: [
            Section(
              title: 'Tambah device',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: kode,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Kode device',
                      helperText: 'Sama persis dengan firmware (MAC tanpa titik dua)',
                    ),
                  ),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                    initialValue: tipe,
                    decoration: const InputDecoration(labelText: 'Tipe'),
                    items: [
                      for (final t in ['slave_node', 'master_node'])
                        DropdownMenuItem(value: t, child: Text(_tipeLabel[t]!)),
                    ],
                    onChanged: (v) => setState(() => tipe = v!),
                  ),
                  if (tipe == 'slave_node') ...[
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int?>(
                      // initialValue hanya dibaca saat dibuat: key memaksa bangun ulang
                      // sesudah form dikosongkan atau daftar master berubah.
                      key: ValueKey('master-$parentId-${masters.length}'),
                      initialValue: parentId,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: 'Terhubung ke master',
                        helperText: masters.isEmpty
                            ? 'Belum ada master. Daftarkan ESP32 yang tersambung ke Raspberry Pi lebih dulu.'
                            : 'ESP32 yang tersambung kabel ke Raspberry Pi dan meneruskan data slave ini.',
                        helperMaxLines: 3,
                      ),
                      items: [
                        const DropdownMenuItem<int?>(value: null, child: Text('Belum ditentukan')),
                        for (final m in masters)
                          DropdownMenuItem<int?>(
                            value: m['id'] as int,
                            child: Text(
                              '${m['device_code']}${m['kolam_nama'] == null ? '' : ', kolam ${m['kolam_nama']}'}',
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => parentId = v),
                    ),
                  ],
                  if (formMsg != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(formMsg!.text, style: TextStyle(color: statusColor(formMsg!.ok ? 'Aman' : 'Bahaya'))),
                    ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: submitting ? null : tambah,
                    child: Text(submitting ? 'Menyimpan…' : 'Tambah device'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (aksiMsg != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(aksiMsg!.text, style: TextStyle(color: statusColor(aksiMsg!.ok ? 'Aman' : 'Bahaya'))),
              ),
            ErrorText(listError),
            if (loading)
              const Center(child: CircularProgressIndicator())
            else ...[
              daftar('Belum diklaim', belum),
              const SizedBox(height: 12),
              daftar('Sudah diklaim', sudah),
            ],
          ],
        ),
      ),
    );
  }
}

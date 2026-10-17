// Porting notifikasi/page.tsx + NotificationItem.tsx.
import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../logic.dart';
import '../main.dart';
import '../ui.dart';

const _pageSize = 20;
const _tabs = [
  (label: 'Semua', source: null),
  (label: 'Kualitas Kolam', source: 'classification'),
  (label: 'Parameter', source: 'parameter'),
  (label: 'Prediksi', source: 'prediction'),
];
const _sourceLabel = {'classification': 'Kondisi aktual', 'prediction': 'Prediksi', 'parameter': 'Parameter'};
const _paramLabel = {'ph': 'pH', 'temperature_c': 'Suhu', 'salinity_ppt': 'Salinitas', 'ammonia': 'Amonia'};

/// Kata status di pesan → label warna. "Baik/Sedang/Buruk" dari baris notifikasi lama.
const _kataStatus = {
  'aman': 'Aman',
  'baik': 'Aman',
  'waspada': 'Waspada',
  'sedang': 'Waspada',
  'bahaya': 'Bahaya',
  'buruk': 'Bahaya',
};

class NotifikasiScreen extends StatefulWidget {
  const NotifikasiScreen({super.key});
  @override
  State<NotifikasiScreen> createState() => _NotifikasiScreenState();
}

class _NotifikasiScreenState extends State<NotifikasiScreen> {
  int tab = 0;
  List<Json> items = [];
  bool loading = true, loadingMore = false, hasMore = false;
  String? error;
  Timer? poll;

  @override
  void initState() {
    super.initState();
    load();
    // Hanya halaman pertama yang disegarkan, supaya halaman yang sudah dimuat tidak hilang.
    poll = Timer.periodic(const Duration(seconds: 60), (_) => load(silent: true));
  }

  @override
  void dispose() {
    poll?.cancel();
    super.dispose();
  }

  Future<List<Json>> _page(int offset) =>
      api.getNotifications(limit: _pageSize, offset: offset, source: _tabs[tab].source);

  Future<void> load({bool silent = false}) async {
    final t = tab;
    if (!silent) setState(() => loading = true);
    try {
      final page = await _page(0);
      if (!mounted || t != tab) return;
      setState(() {
        items = silent && items.length > page.length ? [...page, ...items.skip(page.length)] : page;
        if (!silent) hasMore = page.length == _pageSize;
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
    refreshUnread();
  }

  Future<void> more() async {
    setState(() => loadingMore = true);
    try {
      final page = await _page(items.length);
      setState(() {
        items = [...items, ...page];
        hasMore = page.length == _pageSize;
      });
    } catch (e) {
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loadingMore = false);
    }
  }

  Future<void> markRead(Json n) async {
    setState(() => n['is_read'] = true);
    try {
      await api.markNotificationRead(n['id']);
      refreshUnread();
    } catch (e) {
      if (!mounted) return;
      setState(() => n['is_read'] = false);
      toast(context, '$e');
    }
  }

  Future<void> hapus(Json n) async {
    final i = items.indexOf(n);
    setState(() => items.remove(n));
    try {
      await api.deleteNotification(n['id']);
      refreshUnread();
    } catch (e) {
      if (!mounted) return;
      setState(() => items.insert(i, n));
      toast(context, 'Gagal menghapus notifikasi: $e');
    }
  }

  Future<void> bacaSemua() async {
    try {
      await api.markAllNotificationsRead();
      if (!mounted) return;
      setState(() {
        for (final n in items) {
          n['is_read'] = true;
        }
      });
      refreshUnread();
    } catch (e) {
      if (mounted) toast(context, '$e');
    }
  }

  Future<void> hapusSemua() async {
    if (!await confirm(context, 'Hapus semua notifikasi? Tindakan ini tidak bisa dibatalkan.', ok: 'Hapus semua')) {
      return;
    }
    try {
      await api.deleteAllNotifications();
      await load();
    } catch (e) {
      if (mounted) toast(context, '$e');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Notifikasi'),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(20),
        child: ValueListenableBuilder(
          valueListenable: unreadCount,
          builder: (_, n, _) => Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                n > 0 ? '$n notifikasi belum dibaca' : 'Peringatan kualitas air kolam Anda',
                style: const TextStyle(color: cInk),
              ),
            ),
          ),
        ),
      ),
      actions: [
        IconButton(
          tooltip: 'Baca semua',
          icon: const Icon(Icons.done_all),
          onPressed: items.every((n) => n['is_read'] == true) ? null : bacaSemua,
        ),
        IconButton(
          tooltip: 'Hapus semua',
          icon: const Icon(Icons.delete_sweep_outlined),
          onPressed: items.isEmpty ? null : hapusSemua,
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          const _PanduanBaca(),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_tabs[i].label),
                      selected: tab == i,
                      onSelected: (_) {
                        setState(() {
                          tab = i;
                          items = <Json>[];
                        });
                        load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          ErrorText(error),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('Belum ada notifikasi.')),
            )
          else
            Card(
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (final n in items) ...[
                    _Item(n: n, onRead: () => markRead(n), onDelete: () => hapus(n)),
                    const Divider(height: 1),
                  ],
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

/// Chip label notifikasi. Tanpa warna = jenis (abu-abu); dengan warna = subjek, ikut status.
Widget _chip(String text, [Color? fg, Color? bg]) => Container(
  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
  decoration: BoxDecoration(color: bg ?? cBg, borderRadius: BorderRadius.circular(4)),
  child: Text(
    text,
    style: TextStyle(fontSize: 11, color: fg ?? cMuted, fontWeight: FontWeight.w600),
  ),
);

/// Panduan membaca deretan label di setiap notifikasi. Isinya sama dengan
/// PanduanBaca di web/src/app/(app)/notifikasi/page.tsx. Tertutup secara
/// default supaya daftar notifikasi tetap langsung terlihat.
class _PanduanBaca extends StatelessWidget {
  const _PanduanBaca();

  @override
  Widget build(BuildContext context) {
    final bahaya = statusStyle['Bahaya']!;
    // Label di kiri, penjelasan di kanan yang turun baris kalau panjang.
    Widget baris(Widget label, String teks) => Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          label,
          const SizedBox(width: 8),
          Expanded(child: Text(teks, style: const TextStyle(fontSize: 13, color: cInk))),
        ],
      ),
    );
    Widget judul(String t) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700, color: cInk)),
    );

    return Card(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        title: const Text('Cara membaca notifikasi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        shape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: cBg, borderRadius: BorderRadius.circular(8)),
            child: Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('54D660E9BFB4', style: mono.copyWith(fontWeight: FontWeight.w600)),
                _chip('Prediksi'),
                _chip('Kualitas Kolam', bahaya.fg, bahaya.bg),
                const StatusBadge('Bahaya'),
              ],
            ),
          ),
          const SizedBox(height: 8),
          const Text('Label di setiap notifikasi dibaca dari kiri ke kanan:', style: TextStyle(color: cInk)),
          judul('1. Kode perangkat'),
          const Text('Sensor kolam yang mengirim data, misalnya 54D660E9BFB4.', style: TextStyle(color: cInk)),
          judul('2. Jenis notifikasi (label abu-abu)'),
          baris(_chip('Kondisi aktual'), 'hasil pengukuran sensor saat ini.'),
          baris(_chip('Parameter'), 'satu parameter (pH, suhu, salinitas, atau amonia) berubah status.'),
          baris(
            _chip('Prediksi'),
            'perkiraan kondisi 15–60 menit ke depan berdasarkan tren data terakhir. Belum terjadi, '
                'jadi bisa dipakai untuk berjaga-jaga.',
          ),
          judul('3. Yang dinilai (label berwarna)'),
          baris(_chip('Kualitas Kolam', bahaya.fg, bahaya.bg), 'penilaian gabungan pH, suhu, dan salinitas.'),
          baris(_chip('Suhu', bahaya.fg, bahaya.bg), 'nama parameter berarti hanya parameter itu.'),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text('Warna labelnya mengikuti status.', style: TextStyle(fontSize: 13, color: cInk)),
          ),
          judul('4. Status'),
          baris(
            const StatusBadge('Aman'),
            'kondisi berada di rentang optimal. Notifikasi Aman biasanya berarti kondisi sudah pulih.',
          ),
          baris(
            const StatusBadge('Waspada'),
            'mulai keluar dari rentang optimal tetapi masih dalam batas toleransi kepiting. Pantau kolam.',
          ),
          baris(const StatusBadge('Bahaya'), 'melewati batas toleransi kepiting. Segera periksa kolam.'),
          judul('5. Belum dibaca'),
          baris(
            const Padding(padding: EdgeInsets.only(top: 5), child: Dot(Color(0xFFC23B22))),
            'titik merah dan latar kebiruan berarti notifikasi belum dibaca.'),
          const SizedBox(height: 12),
          const Text(
            'Contoh di atas dibaca: sensor 54D660E9BFB4 memperkirakan kualitas air kolam akan masuk '
            'kondisi Bahaya dalam beberapa menit ke depan.',
            style: TextStyle(color: cMuted, fontStyle: FontStyle.italic),
          ),
        ],
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.n, required this.onRead, required this.onDelete});
  final Json n;
  final VoidCallback onRead, onDelete;

  /// Warnai setiap kata status di dalam pesan.
  TextSpan _pesan(String teks) {
    final spans = <TextSpan>[];
    teks.splitMapJoin(
      RegExp(r'(Aman|Waspada|Bahaya|Baik|Sedang|Buruk)', caseSensitive: false),
      onMatch: (m) {
        final s = _kataStatus[m[0]!.toLowerCase()]!;
        spans.add(
          TextSpan(
            text: m[0],
            style: TextStyle(color: statusColor(s), fontWeight: FontWeight.w700),
          ),
        );
        return '';
      },
      onNonMatch: (t) {
        spans.add(TextSpan(text: t));
        return '';
      },
    );
    return TextSpan(children: spans);
  }

  @override
  Widget build(BuildContext context) {
    final status = categoryToLabel(n['quality_category']);
    final s = statusStyle[status]!;
    final unread = n['is_read'] != true;
    return Container(
      color: unread ? cBrand50.withValues(alpha: .5) : null,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: s.bg,
            child: Icon(s.icon, color: s.fg, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      n['device_code'] ?? 'Device #${n['device_id']}',
                      style: mono.copyWith(fontWeight: FontWeight.w600),
                    ),
                    _chip(_sourceLabel[n['source']] ?? '${n['source']}'),
                    // Seperti web: chip subjek selalu diwarnai status, termasuk
                    // "Kualitas Kolam" pada baris kondisi aktual dan prediksi.
                    _chip(
                      n['parameter'] != null && _paramLabel.containsKey(n['parameter'])
                          ? _paramLabel[n['parameter']]!
                          : 'Kualitas Kolam',
                      s.fg,
                      s.bg,
                    ),
                    StatusBadge(status),
                    if (unread) const Dot(Color(0xFFC23B22)),
                  ],
                ),
                const SizedBox(height: 6),
                Text.rich(_pesan('${n['message']}')),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(formatWaktu(n['created_at']), style: const TextStyle(fontSize: 12, color: cInk)),
                    const Spacer(),
                    if (unread)
                      TextButton(
                        style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                        onPressed: onRead,
                        child: const Text('Tandai dibaca'),
                      ),
                    IconButton(
                      tooltip: 'Hapus',
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.delete_outline, size: 20, color: cAxis),
                      onPressed: onDelete,
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
}

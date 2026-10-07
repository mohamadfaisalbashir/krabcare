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
                style: const TextStyle(color: cAxis),
              ),
            ),
          ),
        ),
      ),
      actions: [
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
    Widget chip(String text, [Color? fg, Color? bg]) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg ?? cBg, borderRadius: BorderRadius.circular(4)),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, color: fg ?? cMuted, fontWeight: FontWeight.w600),
      ),
    );
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
                    chip(_sourceLabel[n['source']] ?? '${n['source']}'),
                    n['parameter'] != null && _paramLabel.containsKey(n['parameter'])
                        ? chip(_paramLabel[n['parameter']]!, s.fg, s.bg)
                        : chip('Kualitas Kolam'),
                    StatusBadge(status),
                    if (unread) const Dot(Color(0xFFC23B22)),
                  ],
                ),
                const SizedBox(height: 6),
                Text.rich(_pesan('${n['message']}')),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(formatWaktu(n['created_at']), style: const TextStyle(fontSize: 12, color: cAxis)),
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

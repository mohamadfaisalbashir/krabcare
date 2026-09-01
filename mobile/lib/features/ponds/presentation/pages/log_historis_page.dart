import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/api/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/skeleton_box.dart';
import '../../domain/log_entry.dart';
import '../../domain/water_parameter.dart';
import '../controllers/log_historis_controller.dart';

/// Halaman ini sengaja pakai tema gelap/monospace tersendiri, berbeda dari
/// halaman lain di aplikasi (sesuai Gambar 3.24).
class LogHistorisPage extends ConsumerWidget {
  const LogHistorisPage({
    super.key,
    required this.pondId,
    required this.parameter,
  });

  final String pondId;
  final WaterParameter parameter;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = (pondId: pondId, parameter: parameter);
    final logsAsync = ref.watch(logHistorisControllerProvider(query));
    final activeFilter = ref.watch(logHistorisFilterProvider);
    // Nama kolam diambil dari daftar kolam yang sudah di-cache seumur sesi.
    // Sebelumnya halaman ini memantau pondDetailControllerProvider hanya demi
    // satu string, yang pada pembukaan dingin memicu fetch readings + quality
    // + predictions seukuran halaman Detail — semuanya dibuang.
    final pondName = ref.watch(kolamListProvider).maybeWhen(
          data: (rows) =>
              rows.where((r) => r.id.toString() == pondId).firstOrNull?.nama ??
              pondId,
          orElse: () => pondId,
        );

    return Scaffold(
      backgroundColor: AppColors.logBackground,
      appBar: AppBar(
        backgroundColor: AppColors.logBackground,
        foregroundColor: AppColors.logTextPrimary,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Log: ${parameter.label}',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.logTextPrimary,
                )),
            Text(
              pondName,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.logTextSecondary,
              ),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            _buildFilterBar(context, ref, activeFilter),
            const Divider(height: 1, color: AppColors.logBorder),
            Expanded(
              child: logsAsync.when(
                data: (page) {
                  // Filter status & parameter sudah dikerjakan backend; di sini
                  // tinggal menampilkan halaman yang sudah termuat.
                  final entries = page.entries;
                  return RefreshIndicator(
                    onRefresh: () => ref
                        .read(logHistorisControllerProvider(query).notifier)
                        .refresh(query),
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: entries.length + 1,
                      itemBuilder: (context, index) {
                        if (index == entries.length) {
                          if (!page.hasMore) {
                            return const Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: Center(
                                child: Text(
                                  '--- Akhir dari log ---',
                                  style: TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 12,
                                    color: AppColors.logTextSecondary,
                                  ),
                                ),
                              ),
                            );
                          }
                          return _LoadMoreButton(
                            onPressed: () => ref
                                .read(
                                    logHistorisControllerProvider(query).notifier)
                                .loadMore(),
                          );
                        }
                        return _LogRow(entry: entries[index]);
                      },
                    ),
                  );
                },
                loading: () => const _LogRowsSkeleton(),
                error: (error, _) => Center(
                  child: Text(
                    'Gagal memuat log: $error',
                    style: const TextStyle(color: AppColors.logTextSecondary),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterBar(
    BuildContext context,
    WidgetRef ref,
    WaterStatus? activeFilter,
  ) {
    final rentang = ref.watch(logHistorisRangeProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          const Icon(Icons.filter_alt_outlined,
              size: 15, color: AppColors.logTextSecondary),
          const SizedBox(width: 6),
          const Text(
            'Filter Log',
            style: TextStyle(fontSize: 12, color: AppColors.logTextSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'SEMUA',
                    selected: activeFilter == null,
                    onTap: () =>
                        ref.read(logHistorisFilterProvider.notifier).state =
                            null,
                  ),
                  const SizedBox(width: 6),
                  for (final status in WaterStatus.values) ...[
                    _FilterChip(
                      label: status.label.toUpperCase(),
                      selected: activeFilter == status,
                      color: status.textColor,
                      onTap: () => ref
                          .read(logHistorisFilterProvider.notifier)
                          .state = status,
                    ),
                    const SizedBox(width: 6),
                  ],
                  // Rentang tanggal: showDateRangePicker bawaan Material,
                  // tanpa paket tambahan.
                  _FilterChip(
                    label: rentang == null
                        ? 'TANGGAL'
                        : '${_tanggalPendek(rentang.start)} - '
                            '${_tanggalPendek(rentang.end)}',
                    selected: rentang != null,
                    onTap: () async {
                      final dipilih = await showDateRangePicker(
                        context: context,
                        firstDate: DateTime(2024),
                        lastDate: DateTime.now(),
                        initialDateRange: rentang,
                      );
                      if (dipilih != null) {
                        ref.read(logHistorisRangeProvider.notifier).state =
                            dipilih;
                      }
                    },
                  ),
                  if (rentang != null) ...[
                    const SizedBox(width: 6),
                    _FilterChip(
                      label: 'SEMUA WAKTU',
                      selected: false,
                      onTap: () => ref
                          .read(logHistorisRangeProvider.notifier)
                          .state = null,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.color,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final chipColor = color ?? AppColors.primary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? chipColor : AppColors.logSurface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? chipColor : AppColors.logBorder,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.logTextSecondary,
          ),
        ),
      ),
    );
  }
}

class _LogRow extends StatelessWidget {
  const _LogRow({required this.entry});

  final LogEntry entry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.arrow_right_rounded,
              size: 18, color: entry.status.textColor),
          const SizedBox(width: 4),
          Text(
            '[${entry.timeLabel}]',
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12.5,
              color: AppColors.logTextSecondary,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              entry.message,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12.5,
                color: AppColors.logTextPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Kerangka baris log. Warnanya logBorder, bukan border: halaman ini bertema
/// gelap dan balok terang akan menyala di atasnya.
class _LogRowsSkeleton extends StatelessWidget {
  const _LogRowsSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 8,
      itemBuilder: (_, _) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SkeletonBox(width: 18, height: 14, color: AppColors.logBorder),
            SizedBox(width: 8),
            SkeletonBox(width: 64, height: 14, color: AppColors.logBorder),
            SizedBox(width: 8),
            Expanded(
              child: SkeletonBox(height: 14, color: AppColors.logBorder),
            ),
          ],
        ),
      ),
    );
  }
}

String _tanggalPendek(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}';

/// Tombol halaman berikutnya. Punya state sibuk sendiri supaya satu ketukan
/// tidak memicu dua permintaan, tanpa provider tambahan.
class _LoadMoreButton extends StatefulWidget {
  const _LoadMoreButton({required this.onPressed});

  final Future<void> Function() onPressed;

  @override
  State<_LoadMoreButton> createState() => _LoadMoreButtonState();
}

class _LoadMoreButtonState extends State<_LoadMoreButton> {
  bool _sibuk = false;

  Future<void> _tekan() async {
    if (_sibuk) return;
    setState(() => _sibuk = true);
    try {
      await widget.onPressed();
    } catch (e) {
      // Gagal memuat halaman berikutnya tidak boleh membuang baris yang sudah
      // tampil, jadi ditangani di sini, bukan dilempar ke AsyncValue.error.
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal memuat halaman berikutnya: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Center(
        child: OutlinedButton(
          onPressed: _sibuk ? null : _tekan,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.logTextPrimary,
            side: const BorderSide(color: AppColors.logBorder),
          ),
          child: Text(
            _sibuk ? 'Memuat...' : 'Muat lebih banyak',
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          ),
        ),
      ),
    );
  }
}

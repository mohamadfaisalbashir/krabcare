// Tema, widget bersama, dan grafik riwayat. Warna dari palet "Muara"
// web/tailwind.config.ts.
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import 'logic.dart';

const cBg = Color(0xFFF2F6F2);
const cInk = Color(0xFF122B26);
const cMuted = Color(0xFF1E332D);
const cBorder = Color(0xFFDCE5DD);
const cBrand = Color(0xFF19A8B2);
const cBrand50 = Color(0xFFE8F6F7);
const cBrand600 = Color(0xFF12838C);
const cBrand700 = Color(0xFF0F7078);
const cHero = Color(0xFF0A2620);
const cBrass = Color(0xFFC1873A);
const cAxis = Color(0xFF5C7A72);

/// label status → (warna teks, latar, ikon)
const statusStyle = {
  'Aman': (fg: Color(0xFF1F9D55), bg: Color(0xFFE4F6EB), icon: Icons.check_circle_outline),
  'Waspada': (fg: Color(0xFFB9740E), bg: Color(0xFFFBF0DA), icon: Icons.warning_amber_rounded),
  'Bahaya': (fg: Color(0xFFC23B22), bg: Color(0xFFFBE7E2), icon: Icons.report_outlined),
};

Color statusColor(String? label) => statusStyle[label]?.fg ?? cAxis;

final theme = ThemeData(
  colorScheme: ColorScheme.fromSeed(seedColor: cBrand, primary: cBrand600, surface: Colors.white),
  scaffoldBackgroundColor: cBg,
  appBarTheme: const AppBarTheme(backgroundColor: cBg, foregroundColor: cInk, centerTitle: false),
  cardTheme: const CardThemeData(
    color: Colors.white,
    elevation: 0,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(8)),
      side: BorderSide(color: cBorder),
    ),
  ),
  inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder(), isDense: true, errorMaxLines: 3),
);

const mono = TextStyle(fontFamily: 'monospace', fontFeatures: [FontFeature.tabularFigures()]);

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) {
    final s = statusStyle[label]!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(s.icon, size: 14, color: s.fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(color: s.fg, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class Dot extends StatelessWidget {
  const Dot(this.color, {super.key});
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    width: 8,
    height: 8,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

class Logo extends StatelessWidget {
  const Logo({super.key, this.light = false});
  final bool light;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const CircleAvatar(
        radius: 15,
        backgroundColor: cBrand,
        child: Icon(Icons.waves, size: 18, color: cBrand50),
      ),
      const SizedBox(width: 8),
      Text.rich(
        TextSpan(
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: light ? Colors.white : cInk),
          children: [
            const TextSpan(text: 'Krab'),
            TextSpan(
              text: 'Care',
              style: TextStyle(color: light ? const Color(0xFFDDAE64) : cBrand600),
            ),
          ],
        ),
      ),
    ],
  );
}

/// Kartu bagian berjudul, pengganti `<Card>` + judul di web.
class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    ),
  );
}

class ErrorText extends StatelessWidget {
  const ErrorText(this.message, {super.key});
  final String? message;
  @override
  Widget build(BuildContext context) => message == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(message!, style: TextStyle(color: statusColor('Bahaya'))),
        );
}

void toast(BuildContext context, String msg) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

Future<bool> confirm(BuildContext context, String message, {String ok = 'Ya'}) async =>
    await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ok)),
        ],
      ),
    ) ??
    false;

double _round1(double n) => (n * 10).round() / 10;

/// Riwayat satu parameter di atas pita ambangnya (HistoryChart.tsx): merah di
/// luar toleransi, hijau di pita optimal, garis putus di batas toleransi.
/// Domain Y dipatok ke toleransi ±8 %, melebar kalau datanya keluar.
class HistoryChart extends StatelessWidget {
  const HistoryChart({super.key, required this.rows, required this.param, this.height = 220, this.showX = true});
  final List<Json> rows; // urut waktu naik
  final String param;
  final double height;
  final bool showX;

  @override
  Widget build(BuildContext context) {
    final r = range[param]!;
    final color = Color(paramUi[param]!.color);
    final pad = (r.max - r.min) * 0.08;
    final spots = [
      for (var i = 0; i < rows.length; i++)
        if (rows[i][param] != null) FlSpot(i.toDouble(), (rows[i][param] as num).toDouble()),
    ];
    final ys = spots.map((s) => s.y);
    final lo = _round1([r.min - pad, ...ys].reduce((a, b) => a < b ? a : b));
    final hi = _round1([r.max + pad, ...ys].reduce((a, b) => a > b ? a : b));
    final red = statusColor('Bahaya');

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: (rows.length - 1).clamp(1, 1 << 30).toDouble(),
          minY: lo,
          maxY: hi,
          clipData: const FlClipData.all(),
          borderData: FlBorderData(show: false),
          gridData: FlGridData(
            drawVerticalLine: false,
            getDrawingHorizontalLine: (_) => const FlLine(color: cBorder, strokeWidth: 1),
          ),
          rangeAnnotations: RangeAnnotations(
            horizontalRangeAnnotations: [
              HorizontalRangeAnnotation(y1: lo, y2: r.min, color: red.withValues(alpha: .05)),
              HorizontalRangeAnnotation(y1: r.max, y2: hi, color: red.withValues(alpha: .05)),
              HorizontalRangeAnnotation(y1: r.lo, y2: r.hi, color: statusColor('Aman').withValues(alpha: .07)),
            ],
          ),
          extraLinesData: ExtraLinesData(
            horizontalLines: [
              for (final y in [r.min, r.max])
                HorizontalLine(y: y, color: red.withValues(alpha: .6), strokeWidth: 1, dashArray: [4, 4]),
            ],
          ),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 40,
                // Ujung domain (mis. 9.2/6.3) bukan angka bulat dan menempel ke label 9/6.5.
                minIncluded: false,
                maxIncluded: false,
                getTitlesWidget: (v, meta) => SideTitleWidget(
                  meta: meta,
                  child: Text(
                    numStr(double.parse(v.toStringAsFixed(2))),
                    style: const TextStyle(fontSize: 10, color: cAxis),
                  ),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: showX,
                reservedSize: 40,
                interval: (rows.length / 3).ceilToDouble().clamp(1, double.infinity),
                getTitlesWidget: (v, meta) {
                  final i = v.toInt();
                  if (i < 0 || i >= rows.length || v != i) return const SizedBox.shrink();
                  final t = rows[i]['time'] as String;
                  return SideTitleWidget(
                    meta: meta,
                    child: Text(
                      '${formatTanggal(t).substring(0, 5)}\n${formatJam(t)}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 10, color: cAxis),
                    ),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => Colors.white,
              tooltipBorder: const BorderSide(color: cBorder),
              getTooltipItems: (spots) => [
                for (final s in spots)
                  LineTooltipItem(
                    '${formatWaktu(rows[s.x.toInt()]['time'])}\n',
                    const TextStyle(fontSize: 11, color: cAxis),
                    children: [
                      TextSpan(
                        text: '${formatValue(s.y)} ${paramUi[param]!.unit} · ${statusOf(param, s.y)}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: statusColor(statusOf(param, s.y))),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              preventCurveOverShooting: true,
              color: color,
              barWidth: 2,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [color.withValues(alpha: .25), color.withValues(alpha: 0)],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

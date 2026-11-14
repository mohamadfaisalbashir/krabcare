// Tema, widget bersama, dan grafik riwayat. Warna dari palet "Muara"
// web/src/app/globals.css.
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'logic.dart';

/// true = mode gelap. Hanya diubah lewat setGelap() di main.dart, yang juga
/// menyimpan pilihannya dan membangun ulang seluruh layar.
///
/// Warna di bawah ini getter, bukan const, supaya nilainya ikut `gelap`.
/// Akibatnya widget yang memakainya tidak bisa `const`. Nilai mode terang
/// sama persis dengan sebelumnya; nilai mode gelap sama dengan `.dark` di
/// web/src/app/globals.css.
bool gelap = false;

Color get cBg => gelap ? const Color(0xFF0D1715) : const Color(0xFFF2F6F2);

/// Latar kartu, pil, dan tooltip. Pengganti Colors.white.
Color get cSurface => gelap ? const Color(0xFF14211E) : Colors.white;
Color get cInk => gelap ? const Color(0xFFE4EEEA) : const Color(0xFF122B26);
Color get cMuted => gelap ? const Color(0xFFC3D3CC) : const Color(0xFF1E332D);
Color get cBorder => gelap ? const Color(0xFF2C3E39) : const Color(0xFFDCE5DD);
const cBrand = Color(0xFF19A8B2);
Color get cBrand50 => gelap ? const Color(0xFF10343A) : const Color(0xFFE8F6F7);

/// Warna merek untuk TEKS dan ikon. Dipisah dari warna tombol karena di mode
/// gelap teks merek harus terang supaya terbaca di latar gelap.
Color get cBrand600 => gelap ? const Color(0xFF7ACDD2) : const Color(0xFF12838C);
Color get cBrand700 => gelap ? const Color(0xFF7ACDD2) : const Color(0xFF0F7078);
const cHero = Color(0xFF0A2620);
const cBrass = Color(0xFFC1873A);
Color get cAxis => gelap ? const Color(0xFF8FA9A0) : const Color(0xFF5C7A72);

typedef GayaStatus = ({Color fg, Color bg, IconData icon});

const _statusTerang = <String, GayaStatus>{
  'Aman': (fg: Color(0xFF1F9D55), bg: Color(0xFFE4F6EB), icon: Icons.check_circle_outline),
  'Waspada': (fg: Color(0xFFB9740E), bg: Color(0xFFFBF0DA), icon: Icons.warning_amber_rounded),
  'Bahaya': (fg: Color(0xFFC23B22), bg: Color(0xFFFBE7E2), icon: Icons.report_outlined),
};
const _statusGelap = <String, GayaStatus>{
  'Aman': (fg: Color(0xFF4CC38A), bg: Color(0xFF12301F), icon: Icons.check_circle_outline),
  'Waspada': (fg: Color(0xFFE0A84A), bg: Color(0xFF3A2C10), icon: Icons.warning_amber_rounded),
  'Bahaya': (fg: Color(0xFFF0806A), bg: Color(0xFF3D1A14), icon: Icons.report_outlined),
};

/// label status → (warna teks, latar, ikon)
Map<String, GayaStatus> get statusStyle => gelap ? _statusGelap : _statusTerang;

Color statusColor(String? label) => statusStyle[label]?.fg ?? cAxis;

const _paramGelap = {'ph': 0xFF3FBFA3, 'temperature_c': 0xFFDDAE64, 'salinity_ppt': 0xFF5AB0DD};

/// Warna garis grafik satu parameter. Di mode gelap diterangkan: warna asli
/// (logic.dart) terlalu pekat untuk latar gelap.
Color paramColor(String param) => Color(gelap ? _paramGelap[param]! : paramUi[param]!.color);

/// Semua kolom isian dibatasi 50 karakter, sama dengan MAKS_INPUT di backend
/// (schemas/user.py) dan maxLength di web. Formatter, bukan `maxLength`:
/// `maxLength` menambah penghitung "0/50" di bawah tiap kolom.
final batas50 = <TextInputFormatter>[LengthLimitingTextInputFormatter(50)];

ThemeData buatTema() => ThemeData(
  colorScheme: gelap
      ? ColorScheme.fromSeed(
          seedColor: cBrand,
          brightness: Brightness.dark,
          primary: const Color(0xFF7ACDD2),
          surface: cSurface,
        )
      : ColorScheme.fromSeed(seedColor: cBrand, primary: const Color(0xFF12838C), surface: Colors.white),
  scaffoldBackgroundColor: cBg,
  appBarTheme: AppBarTheme(backgroundColor: cBg, foregroundColor: cInk, centerTitle: false),
  cardTheme: CardThemeData(
    color: cSurface,
    elevation: 0,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: const BorderRadius.all(Radius.circular(8)),
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
      CircleAvatar(
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

/// Judul bagian dengan keterangan kecil dalam kurung, seperti "Rentang Waktu" dan
/// "Interval" di log-historis/page.tsx: judul tebal 15, kurung 12 abu tidak tebal.
Widget judulBerkurung(String judul, String? kurung) => Text.rich(
  TextSpan(
    text: judul,
    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
    children: [
      if (kurung != null)
        TextSpan(
          text: ' ($kurung)',
          style: TextStyle(fontWeight: FontWeight.w400, fontSize: 12, color: cMuted),
        ),
    ],
  ),
);

/// Kartu bagian berjudul, pengganti `<Card>` + judul di web.
class Section extends StatelessWidget {
  const Section({
    super.key,
    required this.title,
    required this.child,
    this.trailing,
    this.note,
    this.onTap,
    this.kurung,
  });
  final String title;

  /// Keterangan kecil dalam kurung di samping judul, lihat [judulBerkurung].
  final String? kurung;
  final Widget? child; // null = kartu tinggal baris judul (mis. header yang dikuncupkan)
  final Widget? trailing;

  /// Diisi untuk bagian lipat: seluruh baris judul bisa diketuk, bukan hanya panahnya.
  final VoidCallback? onTap;

  /// Catatan pendek di bawah judul, padanan prop `note` Section di RakDetail.tsx.
  final String? note;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: onTap,
            child: Row(
              children: [
                Expanded(child: judulBerkurung(title, kurung)),
                ?trailing,
              ],
            ),
          ),
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(note!, style: TextStyle(fontSize: 13, color: cMuted)),
            ),
          if (child != null) const SizedBox(height: 10),
          ?child,
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
    final color = paramColor(param);
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
          // Kisi tegak seperti HistoryChart.tsx: terbaca sebagai penanda waktu.
          gridData: FlGridData(
            drawHorizontalLine: false,
            verticalInterval: (rows.length / 6).ceilToDouble().clamp(1, double.infinity),
            getDrawingVerticalLine: (_) => FlLine(color: cBorder.withValues(alpha: .9), strokeWidth: 1),
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
                HorizontalLine(y: y, color: red.withValues(alpha: .3), strokeWidth: 1, dashArray: [4, 4]),
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
                    style: TextStyle(fontSize: 10, color: cInk),
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
                      style: TextStyle(fontSize: 10, color: cInk),
                    ),
                  );
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => cSurface,
              tooltipBorder: BorderSide(color: cBorder),
              getTooltipItems: (spots) => [
                for (final s in spots)
                  LineTooltipItem(
                    '${formatWaktu(rows[s.x.toInt()]['time'])}\n',
                    TextStyle(fontSize: 11, color: cInk),
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
              barWidth: 2.2,
              isStrokeCapRound: true,
              dotData: const FlDotData(show: false),
              // Gradasi sama dengan linearGradient di HistoryChart.tsx (0,28 → 0,08 → 0).
              belowBarData: BarAreaData(
                show: true,
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [color.withValues(alpha: .28), color.withValues(alpha: .08), color.withValues(alpha: 0)],
                  stops: const [0, .6, 1],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Kolom kata sandi dengan tombol mata untuk menampilkan isinya (Input.tsx web).
class PasswordField extends StatefulWidget {
  const PasswordField({super.key, required this.controller, required this.label, this.validator});
  final TextEditingController controller;
  final String label;
  final FormFieldValidator<String>? validator;
  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool hide = true;
  @override
  Widget build(BuildContext context) => TextFormField(
    inputFormatters: batas50,
    controller: widget.controller,
    obscureText: hide,
    validator: widget.validator,
    decoration: InputDecoration(
      labelText: widget.label,
      suffixIcon: IconButton(
        tooltip: hide ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi',
        icon: Icon(hide ? Icons.visibility : Icons.visibility_off),
        onPressed: () => setState(() => hide = !hide),
      ),
    ),
  );
}

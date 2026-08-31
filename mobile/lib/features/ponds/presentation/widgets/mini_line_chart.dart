import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/pond_detail.dart';

/// Grafik garis ringan tanpa dependency eksternal (fl_chart dsb).
/// Kalau tim mau visual lebih kaya (tooltip, zoom, dsb), tinggal ganti
/// implementasi widget ini dengan package fl_chart tanpa mengubah caller-nya.
class MiniLineChart extends StatelessWidget {
  const MiniLineChart({super.key, required this.series, this.height = 110});

  final TrendSeries series;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: CustomPaint(
        painter: _LineChartPainter(series: series),
        child: Container(),
      ),
    );
  }
}

class _LineChartPainter extends CustomPainter {
  _LineChartPainter({required this.series});

  final TrendSeries series;

  @override
  void paint(Canvas canvas, Size size) {
    const leftPadding = 34.0;
    const bottomPadding = 18.0;
    final chartWidth = size.width - leftPadding;
    final chartHeight = size.height - bottomPadding;

    final gridPaint = Paint()
      ..color = AppColors.border
      ..strokeWidth = 1;

    // grid horizontal (3 garis)
    for (var i = 0; i <= 2; i++) {
      final y = chartHeight * i / 2;
      canvas.drawLine(
        Offset(leftPadding, y),
        Offset(size.width, y),
        gridPaint,
      );
    }

    // label sumbu Y (max, min)
    final textStyle = const TextStyle(
      fontSize: 9,
      color: AppColors.textSecondary,
    );
    _drawText(canvas, '${series.maxY.toStringAsFixed(0)}', 0, -4, textStyle);
    _drawText(
      canvas,
      '${series.minY.toStringAsFixed(0)}',
      0,
      chartHeight - 8,
      textStyle,
    );

    if (series.points.isEmpty) return;

    double xFor(int index) =>
        leftPadding +
        (series.points.length == 1
            ? chartWidth / 2
            : chartWidth * index / (series.points.length - 1));

    double yFor(double value) {
      final range = (series.maxY - series.minY).abs();
      if (range == 0) return chartHeight / 2;
      final clamped = value.clamp(series.minY, series.maxY);
      return chartHeight - ((clamped - series.minY) / range) * chartHeight;
    }

    final linePath = Path();
    for (var i = 0; i < series.points.length; i++) {
      final point = Offset(xFor(i), yFor(series.points[i].value));
      if (i == 0) {
        linePath.moveTo(point.dx, point.dy);
      } else {
        linePath.lineTo(point.dx, point.dy);
      }
    }

    final lineColor = series.status.textColor;

    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas.drawPath(linePath, linePaint);

    final dotPaint = Paint()..color = lineColor;
    for (var i = 0; i < series.points.length; i++) {
      canvas.drawCircle(
        Offset(xFor(i), yFor(series.points[i].value)),
        2.4,
        dotPaint,
      );
    }

    // label sumbu X: awal, tengah, akhir (format HH:mm)
    final labelIndexes = <int>{
      0,
      series.points.length ~/ 2,
      series.points.length - 1,
    };
    for (final i in labelIndexes) {
      final time = series.points[i].time;
      final label =
          '${time.hour.toString().padLeft(2, '0')}.${time.minute.toString().padLeft(2, '0')}';
      _drawText(
        canvas,
        label,
        xFor(i) - 12,
        chartHeight + 4,
        const TextStyle(fontSize: 9, color: AppColors.textSecondary),
      );
    }
  }

  void _drawText(
    Canvas canvas,
    String text,
    double x,
    double y,
    TextStyle style,
  ) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    );
    painter.layout();
    painter.paint(canvas, Offset(x, y));
  }

  @override
  bool shouldRepaint(covariant _LineChartPainter oldDelegate) {
    return oldDelegate.series != series;
  }
}

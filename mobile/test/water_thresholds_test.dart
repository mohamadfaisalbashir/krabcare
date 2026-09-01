import 'package:app_kepiting/core/api/water_thresholds.dart';
import 'package:app_kepiting/core/theme/app_colors.dart';
import 'package:app_kepiting/features/notifications/domain/app_notification.dart';
import 'package:app_kepiting/features/ponds/domain/water_parameter.dart';
import 'package:flutter_test/flutter_test.dart';

/// Cerminan web/src/lib/parameter.test.ts. Kalau salah satu tes di sini gagal,
/// mobile dan web sudah tidak sepakat soal status yang sama.
void main() {
  group('statusOf', () {
    test('di luar toleransi -> bahaya', () {
      expect(statusOf(WaterParameter.ph, 6.4), WaterStatus.bahaya);
      expect(statusOf(WaterParameter.ph, 9.1), WaterStatus.bahaya);
      expect(statusOf(WaterParameter.suhu, 19.9), WaterStatus.bahaya);
      expect(statusOf(WaterParameter.salinitas, 40.1), WaterStatus.bahaya);
    });

    test('tepat di batas toleransi -> waspada, bukan bahaya', () {
      expect(statusOf(WaterParameter.ph, 6.5), WaterStatus.waspada);
      expect(statusOf(WaterParameter.ph, 9.0), WaterStatus.waspada);
      expect(statusOf(WaterParameter.suhu, 20), WaterStatus.waspada);
      expect(statusOf(WaterParameter.salinitas, 40), WaterStatus.waspada);
    });

    test('batas optimal inklusif -> aman', () {
      expect(statusOf(WaterParameter.ph, 7.5), WaterStatus.aman);
      expect(statusOf(WaterParameter.ph, 8.5), WaterStatus.aman);
      expect(statusOf(WaterParameter.suhu, 28), WaterStatus.aman);
      expect(statusOf(WaterParameter.suhu, 30), WaterStatus.aman);
    });

    test('tiap parameter memakai ambangnya sendiri', () {
      // 25 aman untuk salinitas, tapi bahaya untuk pH dan suhu.
      expect(statusOf(WaterParameter.salinitas, 25), WaterStatus.aman);
      expect(statusOf(WaterParameter.ph, 25), WaterStatus.bahaya);
      expect(statusOf(WaterParameter.suhu, 25), WaterStatus.waspada);
    });

    test('invarian: min <= optimalLow && optimalHigh <= max', () {
      for (final entry in kParamRanges.entries) {
        final r = entry.value;
        expect(r.min <= r.optimalLow, isTrue, reason: '${entry.key}');
        expect(r.optimalLow <= r.optimalHigh, isTrue, reason: '${entry.key}');
        expect(r.optimalHigh <= r.max, isTrue, reason: '${entry.key}');
      }
    });
  });

  group('formatValue', () {
    test('membuang nol di belakang, maksimal 2 desimal', () {
      expect(formatValue(8.75), '8.75');
      expect(formatValue(7.70), '7.7');
      expect(formatValue(25.00), '25');
      expect(formatValue(7.006), '7.01');
    });
  });

  group('categoryToStatus', () {
    test('memetakan ketiga kategori backend', () {
      expect(categoryToStatus('baik'), WaterStatus.aman);
      expect(categoryToStatus('sedang'), WaterStatus.waspada);
      expect(categoryToStatus('buruk'), WaterStatus.bahaya);
    });

    test('kategori tak dikenal jatuh ke waspada, bukan aman', () {
      expect(categoryToStatus(null), WaterStatus.waspada);
      expect(categoryToStatus('entah'), WaterStatus.waspada);
    });
  });

  group('trendSentence', () {
    test('selisih di bawah ambang stabil disebut stabil', () {
      // pH ambang stabil 0.1
      expect(trendSentence(WaterParameter.ph, 8.0, 8.09), contains('stabil'));
    });

    test('selisih di atas ambang stabil disebut naik', () {
      final s = trendSentence(WaterParameter.ph, 8.0, 8.2);
      expect(s, contains('naik'));
      expect(s, isNot(contains('stabil')));
    });

    test('selisih nominal 0.1 masih stabil (float biner, sama seperti web)', () {
      // 8.1 - 8.0 = 0.09999999999999964 di Dart maupun JS, jadi lolos uji
      // `< 0.1`. Dicatat sebagai tes supaya perilaku ini tetap sama dengan
      // PredictionPanel.tsx kalau ada yang tergoda "membetulkan" pembandingnya.
      expect(trendSentence(WaterParameter.ph, 8.0, 8.1), contains('stabil'));
    });

    test('turun terdeteksi dan membawa label status', () {
      final s = trendSentence(WaterParameter.suhu, 30.0, 21.0);
      expect(s, contains('turun'));
      expect(s, contains('Waspada'));
    });

    test('prediksi kosong tidak mengarang angka', () {
      expect(trendSentence(WaterParameter.ph, 8.0, null),
          'Data prediksi belum tersedia.');
    });
  });

  group('triggerFrom', () {
    test('prediction selalu prediksi, apa pun kategorinya', () {
      expect(triggerFrom('prediction', 'buruk'), NotificationTrigger.prediksi);
      expect(triggerFrom('prediction', 'baik'), NotificationTrigger.prediksi);
    });

    test('classification + baik berarti pemulihan', () {
      expect(
          triggerFrom('classification', 'baik'), NotificationTrigger.pemulihan);
    });

    test('classification + anomali berarti kondisi aktual', () {
      expect(triggerFrom('classification', 'sedang'),
          NotificationTrigger.aktual);
      expect(
          triggerFrom('classification', 'buruk'), NotificationTrigger.aktual);
    });
  });

  group('axisBoundsFor', () {
    test('memberi ruang di atas dan di bawah data', () {
      final b = axisBoundsFor([7.0, 8.0]);
      expect(b.minY, lessThan(7.0));
      expect(b.maxY, greaterThan(8.0));
    });

    test('nilai seragam tetap menghasilkan rentang yang bisa dibagi', () {
      final b = axisBoundsFor([8.0, 8.0, 8.0]);
      expect(b.maxY - b.minY, greaterThan(0));
    });

    test('nilai ekstrem tidak terjepit keluar sumbu', () {
      // Regresi: batas dari tabel ambang akan menjepit 12.0 ke 9.0 dan
      // membuat pembacaan bahaya terlihat datar di grafik.
      final b = axisBoundsFor([7.0, 12.0]);
      expect(b.maxY, greaterThanOrEqualTo(12.0));
    });
  });
}

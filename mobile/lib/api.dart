// Klien API KrabCare. Porting web/src/lib/api.ts. JSON dikembalikan apa adanya
// (Map/List); nama field mengikuti schema Pydantic di backend/app/schemas/.
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'logic.dart';

/// Ganti saat build: --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1
const apiBase = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.krabcare.com/api/v1');

String? token;

Future<void> loadToken() async => token = (await SharedPreferences.getInstance()).getString('access_token');

Future<void> saveToken(String? t) async {
  token = t;
  final prefs = await SharedPreferences.getInstance();
  t == null ? await prefs.remove('access_token') : await prefs.setString('access_token', t);
}

/// Dipasang main.dart: buang sesi dan kembali ke layar login.
void Function() onSessionExpired = () {};

class ApiError implements Exception {
  ApiError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Field backend → kalimat Indonesia untuk galat validasi 422.
const _pesanField = {
  'email': 'Email tidak valid. Tulis lengkap dengan domainnya, contoh: nama@email.com',
  'password': 'Kata sandi minimal 8 karakter.',
  'new_password': 'Kata sandi baru minimal 8 karakter.',
  'nama': 'Nama tidak boleh kosong.',
  'device_code': 'Kode device tidak boleh kosong.',
};

String _pesanError(dynamic detail, int status) {
  if (detail is String && detail.isNotEmpty) return detail;
  if (detail is List && detail.isNotEmpty && detail.first is Map) {
    final pertama = detail.first as Map;
    final loc = pertama['loc'];
    final field = loc is List && loc.isNotEmpty ? '${loc.last}' : null;
    final msg = pertama['msg'];
    if (msg != null) return _pesanField[field] ?? '$msg';
  }
  return 'Permintaan gagal ($status)';
}

Future<dynamic> _request(String method, String path, {Object? body, Map<String, Object?>? query}) async {
  final q = {
    for (final e in (query ?? {}).entries)
      if (e.value != null) e.key: '${e.value}',
  };
  final uri = Uri.parse('$apiBase$path').replace(queryParameters: q.isEmpty ? null : q);
  final sentToken = token;

  http.Response res;
  try {
    final req = http.Request(method, uri)
      ..headers['Content-Type'] = 'application/json'
      ..headers.addAll({if (sentToken != null) 'Authorization': 'Bearer $sentToken'});
    if (body != null) req.body = jsonEncode(body);
    res = await http.Response.fromStream(await req.send()).timeout(const Duration(seconds: 30));
  } catch (_) {
    throw ApiError(
      'Tidak bisa menghubungi server di $apiBase. Pastikan backend hidup dan '
      'alamat ini terjangkau dari perangkat Anda.',
    );
  }

  // 401 tanpa token = kredensial login salah, bukan sesi habis.
  if (res.statusCode == 401 && sentToken != null) {
    onSessionExpired();
    throw ApiError('Sesi berakhir, silakan login kembali.');
  }

  // bodyBytes, bukan body: FastAPI tidak menyebut charset, dan `body` jatuh ke latin1.
  final text = utf8.decode(res.bodyBytes);
  final data = text.isEmpty ? null : jsonDecode(text);
  if (res.statusCode >= 400) {
    throw ApiError(_pesanError(data is Map ? data['detail'] : null, res.statusCode));
  }
  return data;
}

List<Json> _list(dynamic d) => (d as List).cast<Json>();

const api = _Api();

class _Api {
  const _Api();

  // Auth (routers/auth.py)
  Future<Json> login(String email, String password) async =>
      await _request('POST', '/auth/login', body: {'email': email, 'password': password});
  Future<Json> register(String email, String password, String nama) async =>
      await _request('POST', '/auth/register', body: {'email': email, 'password': password, 'nama': nama});
  Future<Json> getMe() async => await _request('GET', '/auth/me');
  Future<Json> updateProfile(String nama) async => await _request('PUT', '/auth/me', body: {'nama': nama});
  Future<void> changePassword(String oldPw, String newPw) =>
      _request('POST', '/auth/me/change-password', body: {'old_password': oldPw, 'new_password': newPw});
  Future<void> deleteAccount() => _request('DELETE', '/auth/me');
  Future<Json> resendVerification(String email) async =>
      await _request('POST', '/auth/resend-verification', body: {'email': email});
  Future<Json> forgotPassword(String email) async =>
      await _request('POST', '/auth/forgot-password', body: {'email': email});
  Future<void> verifyEmail(String token) => _request('POST', '/auth/verify-email', body: {'token': token});
  Future<void> resetPassword(String token, String newPw) =>
      _request('POST', '/auth/reset-password', body: {'token': token, 'new_password': newPw});

  // Kolam (routers/kolam.py)
  Future<Json> createKolam(String nama, String deviceCode) async =>
      await _request('POST', '/kolam', body: {'nama': nama, 'device_code': deviceCode});
  Future<Json> updateKolam(int id, String nama) async => await _request('PUT', '/kolam/$id', body: {'nama': nama});
  Future<void> deleteKolam(int id) => _request('DELETE', '/kolam/$id');
  Future<void> claimDevice(int kolamId, String code) =>
      _request('POST', '/kolam/$kolamId/devices/${Uri.encodeComponent(code)}');
  Future<List<Json>> listKolam() async => _list(await _request('GET', '/kolam'));
  Future<List<Json>> getKolamDevices(int id) async => _list(await _request('GET', '/kolam/$id/devices'));

  // Devices (routers/devices.py, khusus admin)
  Future<List<Json>> listDevices() async => _list(await _request('GET', '/devices'));
  Future<List<Json>> getTargetKolams() async => _list(await _request('GET', '/devices/target-kolams'));
  Future<void> createDevice(String code, String type) =>
      _request('POST', '/devices', body: {'device_code': code, 'device_type': type, 'rack_label': null});
  Future<void> claimDeviceToKolam(int deviceId, int kolamId) =>
      _request('POST', '/devices/$deviceId/claim', body: {'kolam_id': kolamId});
  Future<void> unclaimDevice(int deviceId) => _request('POST', '/devices/$deviceId/unclaim');
  Future<void> deleteDevice(int deviceId) => _request('DELETE', '/devices/$deviceId');

  // Readings & quality (routers/readings.py, routers/quality.py)
  Future<List<Json>> getReadings({
    int? deviceId,
    String? startTime,
    String? endTime,
    int? limit,
    int? offset,
    String? param,
    String? status,
  }) async => _list(
    await _request(
      'GET',
      '/readings',
      query: {
        'device_id': deviceId,
        'start_time': startTime,
        'end_time': endTime,
        'limit': limit,
        'offset': offset,
        'param': param,
        'status': status,
      },
    ),
  );
  Future<List<Json>> getLatestQuality([int? deviceId]) async =>
      _list(await _request('GET', '/quality/latest', query: {'device_id': deviceId}));
  Future<List<Json>> getPredictions([int? deviceId]) async =>
      _list(await _request('GET', '/quality/predictions', query: {'device_id': deviceId}));
  Future<List<Json>> getAmmoniaRisk([int? deviceId]) async =>
      _list(await _request('GET', '/quality/ammonia-risk', query: {'device_id': deviceId}));
  Future<List<Json>> getAmmoniaHistory({
    String? startTime,
    String? endTime,
    String? riskLevel,
    bool onlyMeasured = false,
    int? limit,
    int? offset,
  }) async => _list(
    await _request(
      'GET',
      '/quality/ammonia-risk/history',
      query: {
        'start_time': startTime,
        'end_time': endTime,
        'risk_level': riskLevel,
        'only_measured': onlyMeasured ? 'true' : null,
        'limit': limit,
        'offset': offset,
      },
    ),
  );

  // Notifications (routers/notifications.py)
  Future<List<Json>> getNotifications({bool unreadOnly = false, int? limit, int? offset, String? source}) async =>
      _list(
        await _request(
          'GET',
          '/notifications',
          query: {'unread_only': unreadOnly ? 'true' : null, 'limit': limit, 'offset': offset, 'source': source},
        ),
      );
  Future<void> markNotificationRead(int id) => _request('POST', '/notifications/$id/read');
  Future<void> deleteNotification(int id) => _request('DELETE', '/notifications/$id');
  Future<void> deleteAllNotifications() => _request('DELETE', '/notifications');
  Future<void> registerPushToken(String fcmToken) =>
      _request('POST', '/notifications/push-tokens', body: {'fcm_token': fcmToken, 'platform': 'android'});
}

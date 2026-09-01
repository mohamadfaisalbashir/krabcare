import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Alamat backend. 10.0.2.2 adalah alias emulator Android untuk loopback host,
/// jadi ia menjangkau backend Docker yang terikat di 127.0.0.1:8000.
/// Perangkat fisik di LAN perlu:
///   flutter run --dart-define=API_BASE_URL=http://192.168.x.x:8000/api/v1
/// dan backend harus dilepas dari binding 127.0.0.1 lebih dulu.
const String kApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8000/api/v1',
);

const _tokenKey = 'access_token';
const _storage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

/// Jembatan ke GoRouter, yang berupa variabel global sehingga tidak bisa
/// membaca `ref`. Hanya ditulis oleh [AuthToken].
/// ponytail: global karena appRouter global. Jadikan keduanya provider hanya
/// kalau router perlu membaca state lain — biayanya GoRouter dibuat ulang tiap
/// rebuild dan state navigasi hilang.
final ValueNotifier<String?> sessionToken = ValueNotifier<String?>(null);

/// Dibaca sekali di main() sebelum runApp, supaya sesi tersimpan langsung
/// masuk dashboard tanpa kedip layar login.
Future<String?> readStoredToken() => _storage.read(key: _tokenKey);

class AuthToken extends Notifier<String?> {
  @override
  String? build() => sessionToken.value;

  Future<void> set(String token) async {
    await _storage.write(key: _tokenKey, value: token);
    state = token;
    sessionToken.value = token;
  }

  Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    state = null;
    sessionToken.value = null;
  }
}

final authTokenProvider =
    NotifierProvider<AuthToken, String?>(AuthToken.new);

/// Token berubah -> provider ini dibangun ulang -> seluruh controller yang
/// mem-watch-nya ikut di-invalidate Riverpod. Itulah yang membuat logout
/// membuang data basi tanpa daftar invalidate manual yang gampang ketinggalan
/// saat layar baru ditambahkan.
final apiProvider = Provider<Api>((ref) {
  final token = ref.watch(authTokenProvider);
  return Api(
    token: token,
    onUnauthorized: () => ref.read(authTokenProvider.notifier).clear(),
  );
});

/// Jalur yang error 401-nya berarti "kredensial salah", bukan "sesi habis".
/// Tanpa pengecualian ini, salah ketik password akan memunculkan
/// "Sesi berakhir" alih-alih pesan asli dari backend.
bool _isAuthPath(String path) =>
    path.startsWith('/auth/login') || path.startsWith('/auth/forgot-password');

class Api {
  Api({required this.token, required this.onUnauthorized});

  final String? token;
  final Future<void> Function() onUnauthorized;

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
  }) async {
    if (token == null && !_isAuthPath(path)) {
      // Setelah logout, controller sempat dibangun ulang sekali sebelum redirect
      // selesai. Tidak ada gunanya menembak request yang pasti ditolak.
      throw Exception('Sesi berakhir, silakan login kembali.');
    }

    final uri = Uri.parse('$kApiBaseUrl$path').replace(
      queryParameters: query?.isEmpty ?? true ? null : query,
    );
    final headers = {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    late final http.Response res;
    try {
      res = switch (method) {
        'POST' => await http.post(uri,
            headers: headers, body: body == null ? null : jsonEncode(body)),
        'PUT' => await http.put(uri,
            headers: headers, body: body == null ? null : jsonEncode(body)),
        _ => await http.get(uri, headers: headers),
      };
    } catch (_) {
      throw Exception('Tidak dapat terhubung ke server. Periksa koneksi.');
    }

    // HTTPBearer(auto_error=True) di backend mengembalikan 403 untuk header
    // Authorization yang hilang, bukan 401 — menangani 401 saja akan meleset.
    if ((res.statusCode == 401 || res.statusCode == 403) &&
        !_isAuthPath(path)) {
      await onUnauthorized();
      throw Exception('Sesi berakhir, silakan login kembali.');
    }

    if (res.statusCode >= 400) {
      String? detail;
      try {
        final decoded = jsonDecode(utf8.decode(res.bodyBytes));
        if (decoded is Map && decoded['detail'] is String) {
          detail = decoded['detail'] as String;
        }
      } catch (_) {
        // Body bukan JSON; pakai pesan generik di bawah.
      }
      throw Exception(detail ?? 'Permintaan gagal (${res.statusCode})');
    }

    if (res.bodyBytes.isEmpty) return null; // 204
    return jsonDecode(utf8.decode(res.bodyBytes));
  }

  // --- Auth ---
  Future<String> login(String email, String password) async {
    final data = await _request('POST', '/auth/login',
        body: {'email': email, 'password': password});
    return (data as Map)['access_token'] as String;
  }

  Future<void> forgotPassword(String email) =>
      _request('POST', '/auth/forgot-password', body: {'email': email});

  Future<Map<String, dynamic>> me() async =>
      (await _request('GET', '/auth/me')) as Map<String, dynamic>;

  Future<void> changePassword(String oldPassword, String newPassword) =>
      _request('POST', '/auth/me/change-password',
          body: {'old_password': oldPassword, 'new_password': newPassword});

  // --- Kolam & device ---
  Future<List<dynamic>> listKolam() async =>
      (await _request('GET', '/kolam')) as List<dynamic>;

  Future<List<dynamic>> kolamDevices(int kolamId) async =>
      (await _request('GET', '/kolam/$kolamId/devices')) as List<dynamic>;

  // --- Data sensor & ML ---
  /// [param] + [status] menyaring di SQL (ambang Tabel 2.1 juga ada di
  /// backend), jadi satu halaman [limit] baris tetap penuh setelah difilter.
  Future<List<dynamic>> readings({
    int? deviceId,
    int limit = 100,
    int offset = 0,
    String? param,
    String? status,
    DateTime? startTime,
    DateTime? endTime,
  }) async =>
      (await _request('GET', '/readings', query: {
        if (deviceId != null) 'device_id': '$deviceId',
        'limit': '$limit',
        if (offset > 0) 'offset': '$offset',
        'param': ?param,
        'status': ?status,
        if (startTime != null) 'start_time': startTime.toUtc().toIso8601String(),
        if (endTime != null) 'end_time': endTime.toUtc().toIso8601String(),
      })) as List<dynamic>;

  Future<List<dynamic>> latestQuality({int? deviceId}) async =>
      (await _request('GET', '/quality/latest', query: {
        if (deviceId != null) 'device_id': '$deviceId',
      })) as List<dynamic>;

  Future<List<dynamic>> predictions({int? deviceId}) async =>
      (await _request('GET', '/quality/predictions', query: {
        if (deviceId != null) 'device_id': '$deviceId',
      })) as List<dynamic>;

  // --- Notifikasi ---
  Future<List<dynamic>> notifications({int limit = 50}) async =>
      (await _request('GET', '/notifications', query: {'limit': '$limit'}))
          as List<dynamic>;

  Future<void> markNotificationRead(int id) =>
      _request('POST', '/notifications/$id/read');
}

/// Satu kolam beserta device yang diklaimnya (backend membatasi satu device
/// per kolam). [deviceId] null berarti belum ada perangkat terpasang.
typedef KolamRow = ({int id, String nama, int? deviceId, String? deviceCode});

/// Sumber bersama untuk Dashboard, Detail, Log, dan Notifikasi. Sengaja BUKAN
/// autoDispose supaya di-cache seumur sesi — halaman Log cuma butuh nama kolam
/// dan tidak perlu memicu fetch apa pun untuk mendapatkannya.
///
/// ponytail: N+1 di /kolam/{id}/devices. Backend belum punya endpoint batch dan
/// N = jumlah kolam per pengguna (1-3). Minta /kolam?include=devices kalau itu
/// tidak lagi cukup.
final kolamListProvider = FutureProvider<List<KolamRow>>((ref) async {
  final api = ref.watch(apiProvider);
  final kolams = await api.listKolam();

  return Future.wait(kolams.map((k) async {
    final kolam = k as Map<String, dynamic>;
    final id = kolam['id'] as int;
    List<dynamic> devices;
    try {
      devices = await api.kolamDevices(id);
    } catch (_) {
      // Satu kolam bermasalah tidak boleh mengosongkan seluruh dashboard.
      devices = const [];
    }
    final device = devices.isEmpty ? null : devices.first as Map<String, dynamic>;
    return (
      id: id,
      nama: kolam['nama'] as String,
      deviceId: device?['id'] as int?,
      deviceCode: device?['device_code'] as String?,
    );
  }));
});

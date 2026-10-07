import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'logic.dart';
import 'screens/auth.dart';
import 'screens/dashboard.dart';
import 'screens/log.dart';
import 'screens/notifikasi.dart';
import 'screens/perangkat.dart';
import 'screens/profil.dart';
import 'ui.dart';

final navigatorKey = GlobalKey<NavigatorState>();
final messengerKey = GlobalKey<ScaffoldMessengerState>();

/// Padanan user-store.ts & notif-store.ts.
final currentUser = ValueNotifier<Json?>(null);
final unreadCount = ValueNotifier<int>(0);

/// false selama google-services.json belum dipasang: app tetap jalan tanpa push.
bool pushReady = false;

/// Tautan yang membuka app dari keadaan mati (mis. "/reset-password?token=…").
/// Dibuka AuthGate sesudah layar Login/Shell terpasang, lalu dikosongkan.
String? tautanAwal;

/// Tautan email verifikasi / reset sandi (AndroidManifest.xml) → layar yang sesuai.
/// Host diabaikan: yang menentukan hanya path dan `?token=`.
bool bukaTautan(Uri uri) {
  final token = uri.queryParameters['token'];
  final Widget? layar = switch (uri.path) {
    '/verifikasi-email' => VerifikasiEmailScreen(token: token),
    '/reset-password' => ResetPasswordScreen(token: token),
    _ => null,
  };
  if (layar == null) return false;
  navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => layar));
  return true;
}

/// Tautan yang datang saat app sedang berjalan. Didaftarkan sebelum runApp supaya
/// ditangani di sini, bukan diteruskan WidgetsApp ke Navigator sebagai route bernama.
class _Tautan with WidgetsBindingObserver {
  @override
  Future<bool> didPushRouteInformation(RouteInformation routeInformation) async => bukaTautan(routeInformation.uri);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final awal = WidgetsBinding.instance.platformDispatcher.defaultRouteName;
  if (awal != '/') tautanAwal = awal;
  WidgetsBinding.instance.addObserver(_Tautan());
  await loadToken();
  onSessionExpired = logout;
  try {
    await Firebase.initializeApp();
    pushReady = true;
    FirebaseMessaging.onMessage.listen((m) {
      // Push di latar depan tidak ditampilkan sistem: cukup kabari & segarkan badge.
      refreshUnread();
      messengerKey.currentState?.showSnackBar(
        SnackBar(content: Text([m.notification?.title, m.notification?.body].whereType<String>().join('\n'))),
      );
    });
    FirebaseMessaging.instance.onTokenRefresh.listen((t) {
      if (token != null) api.registerPushToken(t).ignore();
    });
  } catch (e) {
    debugPrint('Firebase belum dikonfigurasi, push nonaktif: $e');
  }
  runApp(
    MaterialApp(
      title: 'KrabCare',
      theme: theme,
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: messengerKey,
      debugShowCheckedModeBanner: false,
      home: const AuthGate(),
    ),
  );
}

Future<void> refreshUnread() async {
  try {
    unreadCount.value = (await api.getNotifications(unreadOnly: true, limit: 200)).length;
  } catch (_) {
    // Badge bukan hal kritis; percobaan berikutnya 60 detik lagi.
  }
}

Future<void> registerPush() async {
  if (!pushReady) return;
  try {
    await FirebaseMessaging.instance.requestPermission();
    final t = await FirebaseMessaging.instance.getToken();
    if (t != null) await api.registerPushToken(t);
  } catch (e) {
    debugPrint('Registrasi push gagal: $e');
  }
}

/// Sesudah token tersimpan: ambil profil, daftarkan push, masuk ke Shell.
Future<void> enterApp() async {
  currentUser.value = await api.getMe();
  unawaited(registerPush());
  navigatorKey.currentState!.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const Shell()), (_) => false);
}

/// Buang sesi. Backend tidak punya endpoint hapus push token, jadi token FCM
/// perangkat ini dihapus di sisi Firebase: push berikutnya ke token lama gagal.
Future<void> logout() async {
  if (token == null) return; // 401 dari beberapa request paralel cukup ditangani sekali.
  await saveToken(null);
  currentUser.value = null;
  unreadCount.value = 0;
  navigatorKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  if (pushReady) {
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }
}

Future<void> confirmLogout(BuildContext context) async {
  if (await confirm(context, 'Keluar dari akun ini? Anda perlu masuk lagi untuk membuka dashboard.', ok: 'Keluar')) {
    await logout();
  }
}

/// Layar pembuka: token tersimpan → cek ke /auth/me, tanpa token → login.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  String? error;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    setState(() => error = null);
    if (token == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        navigatorKey.currentState!.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );
        _bukaTautanAwal();
      });
      return;
    }
    try {
      await enterApp();
      _bukaTautanAwal();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  void _bukaTautanAwal() {
    final t = tautanAwal;
    tautanAwal = null;
    if (t != null) bukaTautan(Uri.parse(t));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: error == null
          ? const CircularProgressIndicator()
          : Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ErrorText(error),
                  FilledButton(onPressed: _check, child: const Text('Coba lagi')),
                  TextButton(onPressed: logout, child: const Text('Keluar')),
                ],
              ),
            ),
    ),
  );
}

/// Navigasi bawah sesuai role, seperti Sidebar.tsx/MobileNav.tsx: admin hanya
/// Perangkat & Profil, operator Dashboard, Log, Notifikasi, Profil.
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int index = 0;
  Timer? poll;
  final isAdmin = currentUser.value?['role'] == 'admin';

  @override
  void initState() {
    super.initState();
    if (!isAdmin) {
      refreshUnread();
      poll = Timer.periodic(const Duration(seconds: 60), (_) => refreshUnread());
    }
  }

  @override
  void dispose() {
    poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = isAdmin
        ? [const PerangkatScreen(), const ProfilScreen()]
        : [const DashboardScreen(), const LogScreen(), const NotifikasiScreen(), const ProfilScreen()];
    final notifIcon = ValueListenableBuilder(
      valueListenable: unreadCount,
      builder: (_, n, _) => Badge(
        isLabelVisible: n > 0,
        label: Text(n >= 200 ? '200+' : '$n'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
    return Scaffold(
      // Dashboard tanpa AppBar: tanpa ini ikon status bar putih dari layar login ikut terbawa.
      body: AnnotatedRegion(
        value: SystemUiOverlayStyle.dark,
        child: SafeArea(bottom: false, child: pages[index]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: isAdmin
            ? const [
                NavigationDestination(icon: Icon(Icons.memory), label: 'Perangkat'),
                NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profil'),
              ]
            : [
                const NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
                const NavigationDestination(icon: Icon(Icons.history), label: 'Log'),
                NavigationDestination(icon: notifIcon, label: 'Notifikasi'),
                const NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profil'),
              ],
      ),
    );
  }
}

import 'package:go_router/go_router.dart';

import '../api/api_client.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';
import '../../features/ponds/domain/water_parameter.dart';
import '../../features/ponds/presentation/pages/log_historis_page.dart';
import '../../features/ponds/presentation/pages/pond_detail_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';

class AppRoutes {
  AppRoutes._();

  static const login = '/login';
  static const forgotPassword = '/forgot-password';
  static const dashboard = '/dashboard';
  static const pondDetail = '/dashboard/pond/:pondId';
  static const pondLog = '/dashboard/pond/:pondId/log/:parameter';
  static const notifications = '/notifications';
  static const profile = '/profile';

  static String pondDetailPath(String pondId) => '/dashboard/pond/$pondId';

  static String pondLogPath(String pondId, String parameter) =>
      '/dashboard/pond/$pondId/log/$parameter';
}

final appRouter = GoRouter(
  initialLocation: AppRoutes.login,
  // sessionToken berubah saat login, logout, atau saat backend menolak token
  // (401/403) — redirect di bawah ikut dievaluasi ulang setiap kali.
  refreshListenable: sessionToken,
  redirect: (context, state) {
    final loggedIn = sessionToken.value != null;
    final atAuthPage = state.matchedLocation == AppRoutes.login ||
        state.matchedLocation == AppRoutes.forgotPassword;

    if (!loggedIn && !atAuthPage) return AppRoutes.login;
    if (loggedIn && atAuthPage) return AppRoutes.dashboard;
    return null;
  },
  routes: [
    GoRoute(
      path: AppRoutes.login,
      builder: (context, state) => const LoginPage(),
    ),
    GoRoute(
      path: AppRoutes.forgotPassword,
      builder: (context, state) => const ForgotPasswordPage(),
    ),
    GoRoute(
      path: AppRoutes.dashboard,
      builder: (context, state) => const DashboardPage(),
    ),
    GoRoute(
      path: AppRoutes.pondDetail,
      builder: (context, state) => PondDetailPage(
        pondId: state.pathParameters['pondId']!,
      ),
    ),
    GoRoute(
      path: AppRoutes.pondLog,
      builder: (context, state) => LogHistorisPage(
        pondId: state.pathParameters['pondId']!,
        parameter: WaterParameterX.fromSlug(
          state.pathParameters['parameter']!,
        ),
      ),
    ),
    GoRoute(
      path: AppRoutes.notifications,
      builder: (context, state) => const NotificationsPage(),
    ),
    GoRoute(
      path: AppRoutes.profile,
      builder: (context, state) => const ProfilePage(),
    ),
  ],
);

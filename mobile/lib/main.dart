import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/api/api_client.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Dibaca sebelum runApp supaya sesi tersimpan langsung membuka dashboard,
  // tanpa layar login yang berkedip sepersekian detik.
  sessionToken.value = await readStoredToken();
  runApp(const ProviderScope(child: TambakApp()));
}

class TambakApp extends StatelessWidget {
  const TambakApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Monitoring Kualitas Air Kepiting',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: appRouter,
    );
  }
}

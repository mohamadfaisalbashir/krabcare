import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';

/// State login: AsyncData(null) saat idle, AsyncLoading saat proses,
/// AsyncError(...) kalau gagal.
class LoginController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() {
    // idle, tidak melakukan apa-apa saat provider pertama kali dibaca
    return null;
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    state = const AsyncLoading();

    state = await AsyncValue.guard(() async {
      if (email.isEmpty || password.isEmpty) {
        throw Exception('Email dan kata sandi wajib diisi');
      }
      final token = await ref.read(apiProvider).login(email.trim(), password);
      // Menyimpan token memicu sessionToken -> redirect router ke dashboard.
      await ref.read(authTokenProvider.notifier).set(token);
    });

    return !state.hasError;
  }
}

final loginControllerProvider =
    AsyncNotifierProvider<LoginController, void>(LoginController.new);

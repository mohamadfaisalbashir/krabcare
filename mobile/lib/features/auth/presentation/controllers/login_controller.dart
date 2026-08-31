import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// State login: AsyncData(null) saat idle, AsyncLoading saat proses,
/// AsyncError(...) kalau gagal.
///
/// TODO: ganti isi login() dengan panggilan ke AuthRepository (JWT, NFR-04)
/// begitu kontrak endpoint backend (login) sudah di-share oleh tim backend.
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
      // --- Simulasi sementara, ganti dengan API call asli ---
      await Future.delayed(const Duration(milliseconds: 800));
      if (email.isEmpty || password.isEmpty) {
        throw Exception('Email dan kata sandi wajib diisi');
      }
      // TODO: simpan JWT token ke secure storage di sini
    });

    return !state.hasError;
  }
}

final loginControllerProvider =
    AsyncNotifierProvider<LoginController, void>(LoginController.new);

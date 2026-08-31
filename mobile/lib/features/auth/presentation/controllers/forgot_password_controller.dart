import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// TODO: ganti isi sendResetLink() dengan panggilan ke AuthRepository
/// (endpoint forgot-password) begitu kontrak backend sudah di-share.
class ForgotPasswordController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() {
    return null;
  }

  Future<bool> sendResetLink({required String email}) async {
    state = const AsyncLoading();

    state = await AsyncValue.guard(() async {
      // --- Simulasi sementara, ganti dengan API call asli ---
      await Future.delayed(const Duration(milliseconds: 800));
      if (email.isEmpty) {
        throw Exception('Alamat email wajib diisi');
      }
      // TODO: panggil endpoint POST /auth/forgot-password
    });

    return !state.hasError;
  }
}

final forgotPasswordControllerProvider =
    AsyncNotifierProvider<ForgotPasswordController, void>(
  ForgotPasswordController.new,
);

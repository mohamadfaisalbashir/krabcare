import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';

class ForgotPasswordController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() {
    return null;
  }

  Future<bool> sendResetLink({required String email}) async {
    state = const AsyncLoading();

    state = await AsyncValue.guard(() async {
      if (email.isEmpty) {
        throw Exception('Alamat email wajib diisi');
      }
      // Backend selalu membalas pesan yang sama, terdaftar atau tidak
      // (anti-enumerasi), jadi tidak ada cabang sukses/gagal di sini.
      await ref.read(apiProvider).forgotPassword(email.trim());
    });

    return !state.hasError;
  }
}

final forgotPasswordControllerProvider =
    AsyncNotifierProvider<ForgotPasswordController, void>(
  ForgotPasswordController.new,
);

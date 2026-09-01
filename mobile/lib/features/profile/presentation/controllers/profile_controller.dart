import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api/api_client.dart';
import '../../domain/user_profile.dart';

class ProfileController extends AsyncNotifier<UserProfile> {
  @override
  Future<UserProfile> build() {
    return _fetchProfile();
  }

  Future<UserProfile> _fetchProfile() async {
    // JWT tidak membawa klaim nama/email, jadi profil memang harus diambil
    // lewat endpoint terpisah.
    return UserProfile.fromJson(await ref.watch(apiProvider).me());
  }
}

final profileControllerProvider =
    AsyncNotifierProvider<ProfileController, UserProfile>(
  ProfileController.new,
);

class ChangePasswordController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() => null;

  Future<bool> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      // Validasi lokal lebih dulu supaya kesalahan yang jelas tidak perlu
      // menempuh jaringan; backend tetap memvalidasi ulang.
      if (oldPassword.isEmpty || newPassword.isEmpty) {
        throw Exception('Kata sandi lama dan baru wajib diisi');
      }
      if (newPassword.length < 8) {
        throw Exception('Kata sandi baru minimal 8 karakter');
      }
      await ref.read(apiProvider).changePassword(oldPassword, newPassword);
    });
    return !state.hasError;
  }
}

final changePasswordControllerProvider =
    AsyncNotifierProvider<ChangePasswordController, void>(
  ChangePasswordController.new,
);

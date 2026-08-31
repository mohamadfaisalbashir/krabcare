import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/user_profile.dart';

/// TODO: ganti _fetchProfile() dengan panggilan ke AuthRepository/UserRepository
/// (GET /me, pakai JWT dari secure storage, NFR-04) begitu endpoint sudah tersedia.
class ProfileController extends AsyncNotifier<UserProfile> {
  @override
  Future<UserProfile> build() {
    return _fetchProfile();
  }

  Future<UserProfile> _fetchProfile() async {
    // --- Data dummy sementara, ganti dengan API call asli ---
    await Future.delayed(const Duration(milliseconds: 500));
    return const UserProfile(
      fullName: 'Admin',
      email: 'admin@gmail.com',
      role: 'Administrator',
    );
  }
}

final profileControllerProvider =
    AsyncNotifierProvider<ProfileController, UserProfile>(
  ProfileController.new,
);

/// TODO: ganti isi changePassword() dengan panggilan ke AuthRepository
/// (mis. PUT /me/password) begitu endpoint sudah tersedia.
class ChangePasswordController extends AsyncNotifier<void> {
  @override
  FutureOr<void> build() => null;

  Future<bool> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      await Future.delayed(const Duration(milliseconds: 800));
      if (oldPassword.isEmpty || newPassword.isEmpty) {
        throw Exception('Kata sandi lama dan baru wajib diisi');
      }
      if (newPassword.length < 8) {
        throw Exception('Kata sandi baru minimal 8 karakter');
      }
    });
    return !state.hasError;
  }
}

final changePasswordControllerProvider =
    AsyncNotifierProvider<ChangePasswordController, void>(
  ChangePasswordController.new,
);

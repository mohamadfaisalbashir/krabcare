/// Data akun pengguna (FR-07: autentikasi multi-pengguna).
class UserProfile {
  const UserProfile({
    required this.fullName,
    required this.email,
    required this.role,
  });

  final String fullName;
  final String email;
  final String role;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      fullName: json['full_name'] as String,
      email: json['email'] as String,
      role: json['role'] as String,
    );
  }
}

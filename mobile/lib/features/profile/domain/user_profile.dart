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

  /// Sumber: UserOut backend. Nama fieldnya `nama`, bukan `full_name`.
  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      fullName: json['nama'] as String,
      email: json['email'] as String,
      // Backend mengirim nilai enum huruf kecil; dipetakan di sini supaya
      // halaman profil tidak perlu tahu soal itu.
      role: switch (json['role'] as String) {
        'admin' => 'Administrator',
        'operator' => 'Operator',
        final other => other,
      },
    );
  }
}

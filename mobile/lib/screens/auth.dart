// Login, Daftar, Lupa sandi. Verifikasi email & reset sandi selesai di halaman
// web: tautan di email mengarah ke sana (FRONTEND_*_URL di backend).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../main.dart';
import '../ui.dart';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[A-Za-z]{2,}$');

String? _cekEmail(String? v) => _emailRe.hasMatch(v?.trim() ?? '')
    ? null
    : 'Email tidak valid. Tulis lengkap dengan domainnya, contoh: nama@email.com';

String? _cekSandi(String? v) => (v?.length ?? 0) < 8 ? 'Kata sandi minimal 8 karakter.' : null;

/// Kerangka layar auth: foto kepiting di atas, formulir di bawah.
class _AuthScaffold extends StatelessWidget {
  const _AuthScaffold({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => AnnotatedRegion(
    // Ikon status bar putih di atas foto gelap.
    value: SystemUiOverlayStyle.light,
    child: Scaffold(
      backgroundColor: Colors.white,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Stack(
            children: [
              Image.asset(
                'assets/kepiting.png',
                height: 200,
                width: double.infinity,
                fit: BoxFit.cover,
                alignment: Alignment.centerLeft,
              ),
              Container(
                height: 200,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [cHero.withValues(alpha: .9), cHero.withValues(alpha: .3)],
                  ),
                ),
              ),
              Positioned(
                left: 20,
                bottom: 20,
                right: 20,
                child: SafeArea(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (Navigator.canPop(context)) const BackButton(color: Colors.white),
                      const Logo(light: true),
                      const SizedBox(height: 6),
                      const Text(
                        'Monitoring kualitas air budidaya kepiting',
                        style: TextStyle(color: Color(0xFFC4E3D9)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: cInk),
                ),
                const SizedBox(height: 16),
                ...children,
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false, hide = true, belumVerifikasi = false;
  String? error, info;

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
      info = null;
      belumVerifikasi = false;
    });
    try {
      final res = await api.login(email.text.trim(), password.text);
      await saveToken(res['access_token']);
      await enterApp();
    } catch (e) {
      await saveToken(null);
      // 403 dari login = email belum diverifikasi (routers/auth.py:51).
      setState(() {
        error = '$e';
        belumVerifikasi = '$e'.toLowerCase().contains('verifikasi');
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> kirimUlang() async {
    try {
      final r = await api.resendVerification(email.text.trim());
      setState(() {
        info = '${r['detail']}';
        error = null;
      });
    } catch (e) {
      setState(() => error = '$e');
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
    title: 'Masuk',
    children: [
      Form(
        key: form,
        child: Column(
          children: [
            TextFormField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'Email'),
              validator: _cekEmail,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: password,
              obscureText: hide,
              decoration: InputDecoration(
                labelText: 'Kata sandi',
                suffixIcon: IconButton(
                  icon: Icon(hide ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => hide = !hide),
                ),
              ),
              validator: (v) => (v ?? '').isEmpty ? 'Kata sandi wajib diisi.' : null,
              onFieldSubmitted: (_) => submit(),
            ),
          ],
        ),
      ),
      Align(
        alignment: Alignment.centerRight,
        child: TextButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LupaSandiScreen())),
          child: const Text('Lupa sandi?'),
        ),
      ),
      ErrorText(error),
      if (info != null) Text(info!, style: TextStyle(color: statusColor('Aman'))),
      if (belumVerifikasi) TextButton(onPressed: kirimUlang, child: const Text('Kirim ulang email verifikasi')),
      const SizedBox(height: 8),
      FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Memproses…' : 'Masuk')),
      const SizedBox(height: 12),
      TextButton(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DaftarScreen())),
        child: const Text('Belum punya akun? Daftar di sini'),
      ),
    ],
  );
}

class DaftarScreen extends StatefulWidget {
  const DaftarScreen({super.key});
  @override
  State<DaftarScreen> createState() => _DaftarScreenState();
}

class _DaftarScreenState extends State<DaftarScreen> {
  final form = GlobalKey<FormState>();
  final nama = TextEditingController(), email = TextEditingController(), password = TextEditingController();
  bool busy = false, cekEmail = false;
  String? error, info;

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.register(email.text.trim(), password.text, nama.text.trim());
      // Tanpa SMTP backend langsung memverifikasi akun, jadi login bisa langsung.
      // Dengan SMTP login ditolak 403 sampai tautan di email dibuka.
      try {
        final res = await api.login(email.text.trim(), password.text);
        await saveToken(res['access_token']);
        await enterApp();
      } catch (_) {
        await saveToken(null);
        setState(() => cekEmail = true);
      }
    } catch (e) {
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (cekEmail) {
      return _AuthScaffold(
        title: 'Cek email Anda',
        children: [
          Text(
            'Kami mengirim tautan verifikasi ke ${email.text.trim()}. Buka tautan itu '
            '(tautannya berlaku 5 menit), lalu kembali ke sini untuk masuk.',
          ),
          const SizedBox(height: 12),
          if (info != null) Text(info!, style: TextStyle(color: statusColor('Aman'))),
          ErrorText(error),
          OutlinedButton(
            onPressed: () async {
              try {
                final r = await api.resendVerification(email.text.trim());
                setState(() {
                  info = '${r['detail']}';
                  error = null;
                });
              } catch (e) {
                setState(() => error = '$e');
              }
            },
            child: const Text('Kirim ulang email verifikasi'),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Ke halaman masuk')),
        ],
      );
    }
    return _AuthScaffold(
      title: 'Daftar akun',
      children: [
        Form(
          key: form,
          child: Column(
            children: [
              TextFormField(
                controller: nama,
                decoration: const InputDecoration(labelText: 'Nama'),
                validator: (v) => (v ?? '').trim().isEmpty ? 'Nama tidak boleh kosong.' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
                validator: _cekEmail,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Kata sandi (min. 8 karakter)'),
                validator: _cekSandi,
              ),
            ],
          ),
        ),
        ErrorText(error),
        const SizedBox(height: 12),
        FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Memproses…' : 'Daftar')),
      ],
    );
  }
}

class LupaSandiScreen extends StatefulWidget {
  const LupaSandiScreen({super.key});
  @override
  State<LupaSandiScreen> createState() => _LupaSandiScreenState();
}

class _LupaSandiScreenState extends State<LupaSandiScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController();
  bool busy = false, terkirim = false;
  String? error;

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.forgotPassword(email.text.trim());
      setState(() => terkirim = true);
    } catch (e) {
      setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
    title: 'Lupa kata sandi',
    children: terkirim
        ? [
            const Text(
              'Instruksi telah dikirim. Jika email itu terdaftar, buka tautan di email untuk '
              'membuat kata sandi baru, lalu masuk kembali di aplikasi ini.',
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Ke halaman masuk')),
          ]
        : [
            const Text('Masukkan email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.'),
            const SizedBox(height: 12),
            Form(
              key: form,
              child: TextFormField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
                validator: _cekEmail,
              ),
            ),
            ErrorText(error),
            const SizedBox(height: 12),
            FilledButton(onPressed: busy ? null : submit, child: Text(busy ? 'Mengirim…' : 'Kirim instruksi')),
          ],
  );
}

/// Sesudah verifikasi/reset berhasil: ke Login kalau belum masuk, kalau sudah
/// masuk cukup kembali ke layar sebelumnya.
void _selesai(BuildContext context) {
  if (token == null) {
    navigatorKey.currentState!.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
  } else {
    Navigator.of(context).maybePop();
  }
}

/// Dibuka dari tautan email `…/verifikasi-email?token=…` (bukaTautan di main.dart).
/// Porting web/src/app/verifikasi-email/page.tsx. Token sekali pakai: dipanggil sekali di initState.
class VerifikasiEmailScreen extends StatefulWidget {
  const VerifikasiEmailScreen({super.key, required this.token});
  final String? token;
  @override
  State<VerifikasiEmailScreen> createState() => _VerifikasiEmailScreenState();
}

class _VerifikasiEmailScreenState extends State<VerifikasiEmailScreen> {
  final email = TextEditingController();
  bool? berhasil; // null = sedang memverifikasi
  bool mengirim = false;
  String? error, info;

  @override
  void initState() {
    super.initState();
    final t = widget.token;
    if (t == null || t.isEmpty) {
      berhasil = false;
      error = 'Token aktivasi tidak ditemukan pada tautan.';
    } else {
      _verifikasi(t);
    }
  }

  Future<void> _verifikasi(String t) async {
    try {
      await api.verifyEmail(t);
      if (!mounted) return;
      setState(() => berhasil = true);
      await Future.delayed(const Duration(seconds: 2));
      if (mounted) _selesai(context);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        berhasil = false;
        error = '$e';
      });
    }
  }

  Future<void> kirimUlang() async {
    setState(() {
      mengirim = true;
      info = null;
    });
    try {
      final r = await api.resendVerification(email.text.trim());
      setState(() => info = '${r['detail']}');
    } catch (e) {
      setState(() => info = null);
      if (mounted) toast(context, '$e');
    } finally {
      if (mounted) setState(() => mengirim = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthScaffold(
    title: 'Verifikasi email',
    children: switch (berhasil) {
      null => [
        const Center(child: CircularProgressIndicator()),
        const SizedBox(height: 12),
        const Text('Memverifikasi email Anda…', textAlign: TextAlign.center),
      ],
      true => [
        Text(
          'Akun aktif',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: statusColor('Aman')),
        ),
        const SizedBox(height: 6),
        const Text('Email Anda sudah terverifikasi. Mengalihkan ke halaman masuk…'),
      ],
      false => [
        ErrorText(error),
        const SizedBox(height: 8),
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'Kirim ulang link aktivasi ke', hintText: 'nama@email.com'),
        ),
        if (info != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(info!, style: TextStyle(color: statusColor('Aman'))),
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: mengirim ? null : kirimUlang,
          child: Text(mengirim ? 'Mengirim…' : 'Kirim ulang link aktivasi'),
        ),
        TextButton(onPressed: () => _selesai(context), child: const Text('Ke halaman masuk')),
      ],
    },
  );
}

/// Dibuka dari tautan email `…/reset-password?token=…` (bukaTautan di main.dart).
/// Porting web/src/app/reset-password/page.tsx.
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key, required this.token});
  final String? token;
  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final form = GlobalKey<FormState>();
  final baru = TextEditingController(), konfirmasi = TextEditingController();
  bool busy = false, selesai = false;
  String? error;

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    if (baru.text != konfirmasi.text) return setState(() => error = 'Konfirmasi kata sandi tidak cocok.');
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await api.resetPassword(widget.token!, baru.text);
      if (!mounted) return;
      setState(() => selesai = true);
      await Future.delayed(const Duration(milliseconds: 1500));
      if (mounted) _selesai(context);
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.token;
    return _AuthScaffold(
      title: 'Atur ulang kata sandi',
      children: t == null || t.isEmpty
          ? [
              const Text('Token reset tidak ditemukan pada tautan. Minta ulang lewat halaman Lupa sandi.'),
              TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LupaSandiScreen())),
                child: const Text('Lupa sandi'),
              ),
            ]
          : selesai
          ? [
              Text(
                'Kata sandi diperbarui',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: statusColor('Aman')),
              ),
              const SizedBox(height: 6),
              const Text('Mengalihkan ke halaman masuk…'),
            ]
          : [
              Form(
                key: form,
                child: Column(
                  children: [
                    TextFormField(
                      controller: baru,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Kata sandi baru'),
                      validator: _cekSandi,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: konfirmasi,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Konfirmasi kata sandi baru'),
                      validator: _cekSandi,
                    ),
                  ],
                ),
              ),
              ErrorText(error),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? 'Menyimpan…' : 'Simpan kata sandi baru'),
              ),
            ],
    );
  }
}

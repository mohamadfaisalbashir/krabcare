// Porting profil/page.tsx.
import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';
import '../ui.dart';

typedef Msg = ({bool ok, String text});

Widget _msg(Msg? m) => m == null
    ? const SizedBox.shrink()
    : Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(m.text, style: TextStyle(color: statusColor(m.ok ? 'Aman' : 'Bahaya'))),
      );

class ProfilScreen extends StatefulWidget {
  const ProfilScreen({super.key});
  @override
  State<ProfilScreen> createState() => _ProfilScreenState();
}

class _ProfilScreenState extends State<ProfilScreen> {
  final user = currentUser.value!;
  late final nama = TextEditingController(text: user['nama']);
  final lama = TextEditingController(), baru = TextEditingController(), konfirmasi = TextEditingController();
  final ketikEmail = TextEditingController();
  bool busy = false;
  Msg? namaMsg, sandiMsg, hapusMsg;

  Future<void> simpanNama() async {
    setState(() {
      busy = true;
      namaMsg = null;
    });
    try {
      currentUser.value = await api.updateProfile(nama.text.trim());
      setState(() => namaMsg = (ok: true, text: 'Nama berhasil diperbarui.'));
    } catch (e) {
      setState(() => namaMsg = (ok: false, text: '$e'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> simpanSandi() async {
    if (baru.text != konfirmasi.text) {
      return setState(() => sandiMsg = (ok: false, text: 'Konfirmasi kata sandi baru tidak cocok.'));
    }
    setState(() {
      busy = true;
      sandiMsg = null;
    });
    try {
      await api.changePassword(lama.text, baru.text);
      for (final c in [lama, baru, konfirmasi]) {
        c.clear();
      }
      setState(() => sandiMsg = (ok: true, text: 'Kata sandi berhasil diperbarui.'));
    } catch (e) {
      setState(() => sandiMsg = (ok: false, text: '$e'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> hapusAkun() async {
    final ok = await confirm(
      context,
      'Hapus akun ini secara permanen?\n\nSeluruh kolam dan notifikasi Anda ikut terhapus. Device yang '
      'terhubung tidak terhapus, hanya kembali jadi belum diklaim beserta riwayat sensornya.\n\n'
      'Tindakan ini tidak bisa dibatalkan.',
      ok: 'Hapus akun',
    );
    if (!ok) return;
    setState(() {
      busy = true;
      hapusMsg = null;
    });
    try {
      await api.deleteAccount();
      await logout();
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          hapusMsg = (ok: false, text: '$e');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = user['role'] == 'admin';
    final sama = nama.text.trim() == currentUser.value?['nama'];
    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(14),
              leading: CircleAvatar(
                radius: 24,
                backgroundColor: cBrand,
                child: Text(
                  (currentUser.value?['nama'] as String? ?? '?').characters.first.toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
                ),
              ),
              title: Text('${currentUser.value?['nama']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${user['email']}\n${isAdmin ? 'Admin' : 'Operator'}'),
              isThreeLine: true,
            ),
          ),
          const SizedBox(height: 12),
          Section(
            title: 'Ubah nama',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: nama,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(labelText: 'Nama lengkap'),
                ),
                _msg(namaMsg),
                const SizedBox(height: 8),
                FilledButton(onPressed: busy || sama ? null : simpanNama, child: const Text('Simpan nama')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Section(
            title: 'Ubah kata sandi',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: lama,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Kata sandi lama'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: baru,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Kata sandi baru'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: konfirmasi,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Konfirmasi kata sandi baru'),
                ),
                _msg(sandiMsg),
                const SizedBox(height: 8),
                FilledButton(onPressed: busy ? null : simpanSandi, child: const Text('Simpan perubahan')),
              ],
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => confirmLogout(context),
            icon: const Icon(Icons.logout),
            label: const Text('Keluar akun'),
          ),
          // Backend menolak hapus akun admin (403), jadi tidak ditampilkan.
          if (!isAdmin) ...[
            const SizedBox(height: 12),
            Card(
              child: ExpansionTile(
                shape: const Border(),
                expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                leading: Icon(Icons.report_outlined, color: statusColor('Bahaya')),
                title: Text(
                  'Hapus akun',
                  style: TextStyle(color: statusColor('Bahaya'), fontWeight: FontWeight.w700),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                children: [
                  const Text(
                    'Akun, kolam, dan notifikasi Anda terhapus permanen. Riwayat sensor tetap ada pada device.',
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: ketikEmail,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(labelText: 'Ketik "${user['email']}" untuk konfirmasi'),
                  ),
                  _msg(hapusMsg),
                  const SizedBox(height: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: statusColor('Bahaya')),
                    onPressed: busy || ketikEmail.text.trim() != user['email'] ? null : hapusAkun,
                    child: const Text('Hapus akun saya'),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

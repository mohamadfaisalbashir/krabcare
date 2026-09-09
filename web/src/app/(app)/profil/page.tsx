"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, Pencil, Trash2 } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api, confirmLogout, logout } from "@/lib/api";
import { setUser, useUser } from "@/lib/user-store";
import FormMessage, { type Message } from "@/components/ui/FormMessage";


export default function ProfilPage() {
  // Dibaca dari store bersama, bukan state lokal: header di atas halaman ini
  // memakai sumber yang sama, jadi menyimpan nama baru langsung terlihat di
  // keduanya tanpa perlu memuat ulang halaman.
  const user = useUser();
  const [nama, setNama] = useState("");
  const [savingNama, setSavingNama] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bukaHapus, setBukaHapus] = useState(false);
  const [ketikanHapus, setKetikanHapus] = useState("");
  const [menghapusAkun, setMenghapusAkun] = useState(false);
  const [hapusMessage, setHapusMessage] = useState<Message>(null);
  // Dua state terpisah: kedua form sekarang berada di kolom yang berbeda, jadi
  // satu state bersama akan memunculkan pesan di seberang form yang disubmit.
  const [namaMessage, setNamaMessage] = useState<Message>(null);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);

  // Store yang mengambil datanya. Di sini cuma menyalin nama ke kolom form
  // begitu user-nya sampai (dan tidak menimpanya lagi setelah itu, supaya
  // ketikan yang sedang berjalan tidak terhapus oleh render berikutnya).
  const [namaTerisi, setNamaTerisi] = useState(false);
  useEffect(() => {
    if (user && !namaTerisi) {
      setNama(user.nama);
      setNamaTerisi(true);
    }
  }, [user, namaTerisi]);

  async function handleSaveNama(e: React.FormEvent) {
    e.preventDefault();
    setNamaMessage(null);
    setSavingNama(true);
    try {
      setUser(await api.updateProfile(nama));
      setNamaMessage({ type: "ok", text: "Nama berhasil diperbarui." });
    } catch (err) {
      setNamaMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal memperbarui nama.",
      });
    } finally {
      setSavingNama(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({
        type: "err",
        text: "Konfirmasi kata sandi baru tidak cocok.",
      });
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setPasswordMessage({ type: "ok", text: "Kata sandi berhasil diperbarui." });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal memperbarui kata sandi.",
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Hapus akun sendiri (DELETE /auth/me).
   *
   * Dua lapis penjaga, seperti hapus kolam: mengetik ulang email menjaga dari
   * salah AKUN, dialognya menjaga dari salah TEKAN. Tidak ada undo di backend,
   * kolam & notifikasi ikut terhapus lewat FK CASCADE.
   */
  async function handleHapusAkun() {
    if (
      !window.confirm(
        "Hapus akun ini secara permanen?\n\n" +
          "Seluruh kolam dan notifikasi Anda ikut terhapus. Device yang " +
          "terpasang tidak terhapus, hanya kembali jadi belum diklaim." + 
          "\n\n" +
          "Tindakan ini tidak bisa dibatalkan."
      )
    ) {
      return;
    }

    setHapusMessage(null);
    setMenghapusAkun(true);
    try {
      await api.deleteAccount();
      // logout() membuang token DAN melempar ke /login. Tidak perlu pesan
      // sukses: akunnya sudah tidak ada, halamannya keburu berpindah.
      logout();
    } catch (err) {
      setHapusMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal menghapus akun.",
      });
      setMenghapusAkun(false);
    }
  }

  return (
    <>
      <Topbar title="Profil" subtitle="Kelola informasi akun Anda" />

      <div className="flex-1 p-5 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Kolom kiri: identitas, ubah nama, keluar akun */}
          <div className="space-y-6">
            <Card>
              {user ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-xl font-semibold text-white">
                    {user.nama.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink">
                      {user.nama}
                    </h3>
                    <p className="text-sm text-muted">{user.email}</p>
                    <p className="mt-1 text-xs font-medium capitalize text-muted">
                      {user.role}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
                  <div>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="mt-2 h-4 w-52" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                </div>
              )}
            </Card>

            {/* Ubah nama profil (PUT /auth/me) */}
            <Card>
              <div className="mb-4 flex items-center gap-2.5">
                <Pencil className="h-5 w-5 text-brand-500" />
                <h3 className="font-display text-base font-semibold text-ink">
                  Ubah nama
                </h3>
              </div>
              <form onSubmit={handleSaveNama} className="space-y-4">
                <Input
                  label="Nama lengkap"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  required
                />
                <FormMessage message={namaMessage} />
                <Button type="submit" disabled={savingNama || nama === user?.nama}>
                  {savingNama ? "Menyimpan..." : "Simpan nama"}
                </Button>
              </form>
            </Card>

            <button
              onClick={confirmLogout}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-status-bahaya/30 bg-status-bahayaBg px-4 py-3 text-sm font-semibold text-status-bahaya transition hover:bg-status-bahaya/10"
            >
              <LogOut className="h-4 w-4" /> Keluar akun
            </button>
          </div>

          {/* Kolom kanan: ganti kata sandi */}
          <div className="space-y-6">
            <Card>
              <div className="mb-4 flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-brand-500" />
                <h3 className="font-display text-base font-semibold text-ink">
                  Ubah kata sandi
                </h3>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <Input
                  label="Kata sandi lama"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                />
                <Input
                  label="Kata sandi baru"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Konfirmasi kata sandi baru"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />

                <FormMessage message={passwordMessage} />

                <Button type="submit" disabled={loading}>
                  {loading ? "Menyimpan..." : "Simpan perubahan"}
                </Button>
              </form>
            </Card>

            {/* Kartu NETRAL, tidak lagi bertint merah. Merahnya sekarang hanya
                pada tombolnya, persis sebobot tombol "Keluar akun" di atas yang
                memakai kelas warna yang sama (border-status-bahaya/30 +
                bg-status-bahayaBg + text-status-bahaya). Sebelumnya seluruh
                kartu ikut merah, sehingga tindakan paling jarang dipakai di
                halaman ini justru jadi yang paling menyita perhatian.

                TIDAK dirender untuk admin. Backend sudah menolaknya dengan 403
                (routers/auth.py: akun admin adalah satu-satunya pintu ke panel
                /perangkat, menghapusnya mengunci pendaftaran device untuk semua
                orang), jadi menampilkan tombol yang pasti gagal cuma menjebak. */}
            {user && user.role !== "admin" && (
              <Card>
                <div className="mb-2 flex items-center gap-2.5">
                  <Trash2 className="h-5 w-5 text-muted" />
                  <h3 className="font-display text-base font-semibold text-ink">
                    Hapus akun
                  </h3>
                </div>

                {/* Terlipat sampai diminta. Isinya ancaman permanen, dan
                    membentangkannya terus-menerus di bawah "Ubah nama" membuat
                    tindakan paling berbahaya di halaman ini jadi yang paling
                    kelihatan. Satu ketukan sudah cukup jadi pemisah niat. */}
                {!bukaHapus ? (
                  <button
                    type="button"
                    onClick={() => setBukaHapus(true)}
                    className="btn-danger"
                  >
                    Hapus akun
                  </button>
                ) : (
                  <>
                    <p className="mb-4 text-sm leading-relaxed text-muted">
                      Menghapus akun ini beserta seluruh kolam dan notifikasinya,
                      permanen. Device yang terpasang tidak ikut terhapus. Ia kembali
                      jadi belum diklaim beserta riwayat sensornya, dan bisa dipasang
                      admin ke akun lain.
                    </p>
                    <div className="space-y-4 sm:max-w-md">
                      <Input
                        label={`Ketik "${user.email}" untuk mengonfirmasi`}
                        value={ketikanHapus}
                        onChange={(e) => setKetikanHapus(e.target.value)}
                        placeholder={user.email}
                        autoComplete="off"
                      />
                      <FormMessage message={hapusMessage} />
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleHapusAkun}
                          disabled={menghapusAkun || ketikanHapus.trim() !== user.email}
                          className="btn-danger"
                        >
                          {menghapusAkun ? "Menghapus..." : "Hapus akun saya"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBukaHapus(false);
                            setKetikanHapus("");
                            setHapusMessage(null);
                          }}
                          className="btn-ghost"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

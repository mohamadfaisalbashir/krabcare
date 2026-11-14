"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  LogOut,
  Pencil,
  ShieldCheck,
  SunMoon,
  Trash2,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api, confirmLogout, logout } from "@/lib/api";
import { setUser, useUser } from "@/lib/user-store";
import FormMessage, { type Message } from "@/components/ui/FormMessage";


export default function ProfilPage() {
  // Dari store bersama, bukan state lokal: header memakai sumber yang sama,
  // jadi nama baru langsung terlihat di keduanya.
  const user = useUser();
  const [nama, setNama] = useState("");
  const [savingNama, setSavingNama] = useState(false);
  // Ubah nama dan kata sandi jarang dipakai, jadi terlipat sampai dibuka.
  const [bukaNama, setBukaNama] = useState(false);
  const [bukaSandi, setBukaSandi] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bukaHapus, setBukaHapus] = useState(false);
  const [ketikanHapus, setKetikanHapus] = useState("");
  const [menghapusAkun, setMenghapusAkun] = useState(false);
  const [hapusMessage, setHapusMessage] = useState<Message>(null);
  // Satu state pesan per form, supaya pesan muncul di form yang disubmit.
  const [namaMessage, setNamaMessage] = useState<Message>(null);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);

  // Store yang mengambil datanya. Di sini cuma menyalin nama ke kolom form
  // sekali, supaya ketikan yang sedang berjalan tidak tertimpa render berikutnya.
  const [namaTerisi, setNamaTerisi] = useState(false);
  useEffect(() => {
    if (user && !namaTerisi) {
      setNama(user.nama);
      setNamaTerisi(true);
    }
  }, [user, namaTerisi]);

  // Dibaca dari <html> sesudah mount: skrip di app/layout.tsx sudah memasang
  // kelasnya sebelum React hidup, dan server tidak tahu pilihan pengguna.
  const [temaGelap, setTemaGelap] = useState(false);
  useEffect(() => {
    setTemaGelap(document.documentElement.classList.contains("dark"));
  }, []);

  function pilihTema(gelap: boolean) {
    document.documentElement.classList.toggle("dark", gelap);
    window.localStorage.setItem("tema", gelap ? "gelap" : "terang");
    setTemaGelap(gelap);
  }

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
   * Dua lapis penjaga seperti hapus kolam: mengetik ulang email menjaga dari
   * salah akun, dialognya dari salah tekan. Tidak ada undo; kolam dan
   * notifikasi ikut terhapus lewat FK CASCADE.
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
      // logout() membuang token dan melempar ke /login, jadi tidak perlu pesan
      // sukses.
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

      {/* Satu kolom di semua lebar layar: kartu menumpuk ke bawah. */}
      <div className="flex-1 space-y-6 p-5 sm:p-8">
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
          {/* Terlipat secara default, pola sama dengan "Ubah kata sandi". */}
          <button
            type="button"
            onClick={() => setBukaNama((v) => !v)}
            aria-expanded={bukaNama}
            className={clsx("flex w-full items-center justify-between text-left", bukaNama && "mb-4")}
          >
            <span className="flex items-center gap-2.5">
              <Pencil className="h-5 w-5 text-brand-500" />
              <span className="font-display text-base font-semibold text-ink">Ubah nama</span>
            </span>
            <span className="-my-1.5 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg">
              {bukaNama ? (
                <ChevronUp className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
              )}
            </span>
          </button>
          {bukaNama && (
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
          )}
        </Card>

        {/* Mode terang/gelap. Kelas `dark` di <html> yang mengganti warnanya
            (globals.css); pilihannya diingat per browser. */}
        <Card>
          <div className="mb-4 flex items-center gap-2.5">
            <SunMoon className="h-5 w-5 text-brand-500" />
            <h3 className="font-display text-base font-semibold text-ink">Tampilan</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            {[
              { gelap: false, label: "Terang" },
              { gelap: true, label: "Gelap" },
            ].map((opsi) => (
              <button
                key={opsi.label}
                type="button"
                onClick={() => pilihTema(opsi.gelap)}
                aria-pressed={temaGelap === opsi.gelap}
                className={temaGelap === opsi.gelap ? "btn-primary" : "btn-ghost"}
              >
                {opsi.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Terlipat secara default, pola sama dengan "Unduh data mentah". */}
        <Card>
          {/* Seluruh baris judul jadi tombol, bukan hanya panahnya. */}
          <button
            type="button"
            onClick={() => setBukaSandi((v) => !v)}
            aria-expanded={bukaSandi}
            className={clsx("flex w-full items-center justify-between text-left", bukaSandi && "mb-4")}
          >
            <span className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-brand-500" />
              <span className="font-display text-base font-semibold text-ink">
                Ubah kata sandi
              </span>
            </span>
            <span className="-my-1.5 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg">
              {bukaSandi ? (
                <ChevronUp className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
              )}
            </span>
          </button>

          {bukaSandi && (
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

              {/* Pudar sampai ketiga kolom terisi, sama seperti "Simpan nama"
                  yang pudar selama namanya belum berubah. */}
              <Button
                type="submit"
                disabled={loading || !oldPassword || !newPassword || !confirmPassword}
              >
                {loading ? "Menyimpan..." : "Simpan perubahan"}
              </Button>
            </form>
          )}
        </Card>

        {/* Pola sama dengan hapus kolam di detail kolam: tombol merah membuka
            kotak Zona berbahaya. Gaya kotaknya disalin dari DangerZone.tsx,
            bukan memakai komponennya, karena komponen itu terikat ke
            api.deleteKolam.

            Tidak dirender untuk admin: backend menolaknya dengan 403
            (routers/auth.py), jadi tombolnya pasti gagal. */}
        {user && user.role !== "admin" && (
          <Card>
            <div className="mb-4 flex items-center gap-2.5">
              <Trash2 className="h-5 w-5 text-brand-500" />
              <h3 className="font-display text-base font-semibold text-ink">
                Hapus akun
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setBukaHapus((v) => !v);
                setKetikanHapus("");
                setHapusMessage(null);
              }}
              aria-expanded={bukaHapus}
              className="btn-danger"
            >
              Hapus akun
            </button>

            {bukaHapus && (
              <div className="mt-4 rounded-lg border border-status-bahaya/30 bg-status-bahayaBg/60 p-5 sm:max-w-2xl">
                <div className="mb-3 flex items-center gap-2.5">
                  <AlertOctagon className="h-5 w-5 text-status-bahaya" />
                  <h3 className="font-display text-base font-semibold text-status-bahaya">
                    Zona berbahaya
                  </h3>
                </div>
                <p className="text-sm font-semibold text-ink">
                  Menghapus akun ini bersifat permanen dan tidak dapat dibatalkan.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Seluruh kolam dan notifikasi Anda ikut terhapus. Device yang
                  terhubung tidak ikut terhapus, hanya kembali menjadi belum
                  terklaim beserta riwayat sensornya, sehingga admin bisa
                  memasangnya ke akun lain.
                </p>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="sm:w-96">
                    <Input
                      label={`Ketik "${user.email}" untuk mengonfirmasi`}
                      value={ketikanHapus}
                      onChange={(e) => setKetikanHapus(e.target.value)}
                      placeholder={user.email}
                      autoComplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleHapusAkun}
                    disabled={menghapusAkun || ketikanHapus.trim() !== user.email}
                    className="btn-danger"
                  >
                    {menghapusAkun ? "Menghapus..." : "Hapus akun saya"}
                  </button>
                </div>
                {hapusMessage && (
                  <div className="mt-3">
                    <FormMessage message={hapusMessage} />
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        <button
          onClick={confirmLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-status-bahaya/30 bg-status-bahayaBg px-4 py-3 text-sm font-semibold text-status-bahaya transition hover:bg-status-bahaya/10"
        >
          <LogOut className="h-4 w-4" /> Keluar akun
        </button>
      </div>
    </>
  );
}

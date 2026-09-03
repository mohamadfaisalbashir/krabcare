"use client";

import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, Pencil } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api, confirmLogout } from "@/lib/api";
import { User } from "@/lib/types";

type Message = { type: "ok" | "err"; text: string } | null;

/** Pesan hasil submit, dirender tepat di bawah form yang memicunya. */
function FormMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      className={`rounded-lg px-3.5 py-2.5 text-sm ${
        message.type === "ok"
          ? "bg-status-amanBg text-status-aman"
          : "bg-status-bahayaBg text-status-bahaya"
      }`}
    >
      {message.text}
    </p>
  );
}

export default function ProfilPage() {
  const [user, setUser] = useState<User | null>(null);
  const [nama, setNama] = useState("");
  const [savingNama, setSavingNama] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Dua state terpisah: kedua form sekarang berada di kolom yang berbeda, jadi
  // satu state bersama akan memunculkan pesan di seberang form yang disubmit.
  const [namaMessage, setNamaMessage] = useState<Message>(null);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((u) => {
        setUser(u);
        setNama(u.nama);
      })
      .catch(console.error);
  }, []);

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
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-xl font-semibold text-white">
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
          </div>
        </div>
      </div>
    </>
  );
}

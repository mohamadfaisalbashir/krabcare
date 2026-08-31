"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { User } from "@/lib/types";

export default function ProfilPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getMe().then(setUser).catch(console.error);
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "err", text: "Konfirmasi kata sandi baru tidak cocok." });
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(oldPassword, newPassword);
      setMessage({ type: "ok", text: "Kata sandi berhasil diperbarui." });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal memperbarui kata sandi.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("access_token");
    router.push("/login");
  }

  return (
    <>
      <Topbar title="Profil" subtitle="Kelola informasi akun Anda" />

      <div className="flex-1 space-y-6 p-5 sm:max-w-xl sm:p-8">
        {/* Identitas */}
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-500 font-display text-xl font-semibold text-white">
              {user?.nama?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">
                {user?.nama ?? "Memuat..."}
              </h3>
              <p className="text-sm text-muted">{user?.email ?? "—"}</p>
              <p className="text-xs font-medium text-muted mt-1 uppercase tracking-wider">
                {user?.role ?? "—"}
              </p>
            </div>
          </div>
        </Card>

        {/* Ganti kata sandi */}
        <Card>
          <div className="mb-4 flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-brand-500" />
            <h3 className="font-display text-base font-semibold text-ink">
              Ubah Kata Sandi
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

            {message && (
              <p
                className={`rounded-lg px-3.5 py-2.5 text-sm ${
                  message.type === "ok"
                    ? "bg-status-amanBg text-status-aman"
                    : "bg-status-bahayaBg text-status-bahaya"
                }`}
              >
                {message.text}
              </p>
            )}

            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan perubahan"}
            </Button>
          </form>
        </Card>

        {/* Keluar akun */}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-status-bahaya/30 bg-status-bahayaBg px-4 py-3 text-sm font-semibold text-status-bahaya transition hover:bg-status-bahaya/10"
        >
          <LogOut className="h-4 w-4" /> Keluar Akun
        </button>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/layout/Logo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function DaftarPage() {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Backend register hanya mengembalikan UserOut (tanpa token),
      // jadi langsung login sesudahnya supaya user tidak perlu isi form dua kali.
      await api.register(email, password, nama);
      const { access_token } = await api.login(email, password);
      window.localStorage.setItem("access_token", access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Pendaftaran gagal. Coba lagi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo />
        </div>

        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali ke halaman masuk
        </Link>

        <h1 className="font-display text-2xl font-semibold text-ink">
          Buat akun baru
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Akun baru otomatis berperan sebagai operator.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <Input
            label="Nama lengkap"
            placeholder="Nama Anda"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Kata sandi"
            type="password"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />

          {error && (
            <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Mendaftarkan..." : "Daftar"}
          </Button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
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
  const [perluVerifikasi, setPerluVerifikasi] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Backend register hanya mengembalikan UserOut (tanpa token).
      await api.register(email, password, nama);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pendaftaran gagal. Coba lagi.");
      setLoading(false);
      return;
    }

    // Akunnya sudah jadi di titik ini. Login langsung dicoba, dan hasilnya yang
    // menentukan, tanpa halaman ini perlu tahu konfigurasi SMTP server:
    //   berhasil -> backend melewati verifikasi (SMTP belum diatur), masuk saja
    //   ditolak  -> akun menunggu link aktivasi, tampilkan "cek email"
    // Galat di sini jangan dilaporkan sebagai "pendaftaran gagal": mengulang
    // formulir cuma akan kena "Email sudah terdaftar".
    try {
      const { access_token } = await api.login(email, password);
      window.localStorage.setItem("access_token", access_token);
      router.push("/dashboard");
    } catch {
      setPerluVerifikasi(true);
      setLoading(false);
    }
  }

  if (perluVerifikasi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Logo />
          </div>
          <div className="card p-6 text-center">
            <MailCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Cek email Anda
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Akun untuk <span className="font-semibold text-ink">{email}</span> sudah
              dibuat. Kami mengirim link aktivasi ke alamat itu. Buka linknya dulu,
              baru akunnya bisa dipakai masuk.
            </p>
            <Link
              href="/verifikasi-email"
              className="mt-4 inline-block py-1 text-sm font-semibold text-brand-600 hover:underline"
            >
              Tidak menerima emailnya?
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Logo />
        </div>

        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 py-1 text-sm font-medium text-muted hover:text-ink"
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
          {/* pattern wajib di samping type="email": type="email" saja meloloskan
              "a@b" tanpa titik dan TLD, yang lalu ditolak pola backend di
              schemas/user.py setelah request bolak-balik. Ini versi ringkas
              dari pola backend, yang tetap jadi penjaga terakhir. */}
          <Input
            label="Email"
            type="email"
            pattern="[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[A-Za-z]{2,}"
            title="Masukkan email lengkap dengan domain, contoh: nama@email.com"
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

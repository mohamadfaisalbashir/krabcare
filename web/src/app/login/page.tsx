"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Waves } from "lucide-react";
import Logo from "@/components/layout/Logo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Backend mengembalikan TokenOut { access_token, token_type }
      // TANPA user object — data user diambil terpisah lewat GET /auth/me.
      const { access_token } = await api.login(email, password);
      window.localStorage.setItem("access_token", access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Email atau kata sandi salah. Silakan coba lagi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[2fr_1fr]">
      {/* Panel kiri -- identitas, foto tambak sebagai latar */}
      <section className="relative hidden overflow-hidden bg-hero-deep lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Fotonya panorama 1024x247 (rasio 4.15) sementara panel ini jauh lebih
            tinggi daripada lebar, jadi bg-cover memangkas sekitar 70% lebarnya.
            bg-left, BUKAN bg-center: kepiting dan akar bakaunya ada di ujung
            kiri foto dan akan terpotong habis kalau dijangkarkan ke tengah.
            Blur tipis menyamarkan pembesaran vertikal ~4x; scale-105 menutup
            tepi menerawang akibat blur itu. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-105 bg-[url('/kepiting.png')] bg-cover bg-left blur-[2px]"
        />
        {/* Peredam gelap: syarat keterbacaan, bukan gaya. Teks putih di atas
            foto siang hari tanpa ini tidak lolos WCAG AA. Gradien, supaya sisi
            kiri tempat teks berada paling pekat dan fotonya tetap terlihat di
            sisi kanan. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-hero-deep/90 via-hero-deep/75 to-hero-deep/55"
        />
        <Logo className="relative [&_span]:text-white [&_span_span]:text-brass-300" />
        <div className="relative max-w-md">
          <Waves className="mb-5 h-9 w-9 text-brass-300" strokeWidth={1.6} />
          <h2 className="font-display text-3xl font-semibold leading-snug text-white">
            Pantau kualitas air setiap kolam, tanpa harus turun ke tambak.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-hero-soft">
            Suhu, pH, dan salinitas seluruh kolam terekam otomatis sepanjang
            hari, dengan peringatan dini sebelum kondisi memburuk.
          </p>
        </div>
      </section>

      {/* Panel kanan -- form login */}
      <section className="flex items-center justify-center bg-bg p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink">
            Masuk ke akun Anda
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Masukkan email dan kata sandi yang telah terdaftar.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div>
              <div className="relative">
                <Input
                  label="Kata Sandi"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-[38px] text-muted hover:text-ink"
                  aria-label={
                    showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4.5 w-4.5" />
                  ) : (
                    <Eye className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
              <div className="mt-2 text-right">
                <Link
                  href="/lupa-sandi"
                  className="inline-block py-1 text-sm font-medium text-brand-600 hover:underline"
                >
                  Lupa sandi?
                </Link>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
                {error}
              </p>
            )}

            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Memproses..." : "Masuk"}
            </Button>

            <p className="text-center text-sm text-muted">
              Belum punya akun?{" "}
              <Link
                href="/daftar"
                className="font-medium text-brand-600 hover:underline"
              >
                Daftar di sini
              </Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}

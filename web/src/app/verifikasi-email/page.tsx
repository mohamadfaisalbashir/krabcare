"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Logo from "@/components/layout/Logo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import FormMessage, { type Message } from "@/components/ui/FormMessage";

// Link aktivasi dari email berbentuk {FRONTEND_VERIFY_EMAIL_URL}?token=<raw>
// (backend: auth_service.register_user -> _kirim_email_verifikasi).
//
// Beda dengan reset-password: di sini tidak ada yang perlu diisi, jadi
// tokennya diverifikasi sendiri saat halaman terbuka dan formulir cuma muncul
// kalau tokennya bermasalah.
function VerifikasiEmail() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [status, setStatus] = useState<"memproses" | "berhasil" | "gagal">(
    token ? "memproses" : "gagal"
  );
  const [error, setError] = useState<string | null>(
    token ? null : "Token aktivasi tidak ditemukan pada tautan."
  );

  // Kirim ulang link, untuk token kedaluwarsa/terlanjur dipakai.
  const [email, setEmail] = useState("");
  const [mengirim, setMengirim] = useState(false);
  // Message, bukan string: backend membedakan berhasil dan gagal (sudah aktif
  // / belum terdaftar / SMTP mati), jadi gayanya tidak boleh sama.
  const [terkirim, setTerkirim] = useState<Message>(null);

  // React 18 StrictMode memanggil efek dua kali di dev, sementara token ini
  // sekali pakai: panggilan kedua gagal dan menimpa hasil sukses yang pertama.
  // Penjaga ref-nya wajib.
  const sudahJalan = useRef(false);

  useEffect(() => {
    if (!token || sudahJalan.current) return;
    sudahJalan.current = true;

    api
      .verifyEmail(token)
      .then(() => {
        setStatus("berhasil");
        setTimeout(() => router.push("/login"), 2000);
      })
      .catch((err: unknown) => {
        setStatus("gagal");
        setError(err instanceof Error ? err.message : "Link aktivasi tidak valid.");
      });
  }, [token, router]);

  async function handleKirimUlang(e: React.FormEvent) {
    e.preventDefault();
    setMengirim(true);
    setTerkirim(null);
    try {
      const res = await api.resendVerification(email);
      setTerkirim({ type: "ok", text: res.detail });
    } catch (err) {
      setTerkirim({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal mengirim ulang.",
      });
    } finally {
      setMengirim(false);
    }
  }

  if (status === "memproses") {
    return <p className="mt-7 text-sm text-muted">Mengaktifkan akun Anda...</p>;
  }

  if (status === "berhasil") {
    return (
      <div className="card mt-7 p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
        <h2 className="font-display text-lg font-semibold text-ink">Akun aktif</h2>
        <p className="mt-1.5 text-sm text-muted">
          Email Anda sudah terverifikasi. Mengalihkan ke halaman masuk...
        </p>
      </div>
    );
  }

  return (
    <div className="mt-7 space-y-4">
      <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
        {error}
      </p>

      <form onSubmit={handleKirimUlang} className="space-y-4">
        <Input
          label="Kirim ulang link aktivasi ke"
          type="email"
          placeholder="nama@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Button type="submit" fullWidth disabled={mengirim}>
          {mengirim ? "Mengirim..." : "Kirim ulang link aktivasi"}
        </Button>
      </form>

      <FormMessage message={terkirim} />
    </div>
  );
}

export default function VerifikasiEmailPage() {
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
          Verifikasi email
        </h1>

        {/* useSearchParams wajib berada di dalam Suspense (Next 14 App Router). */}
        <Suspense fallback={<p className="mt-7 text-sm text-muted">Memuat...</p>}>
          <VerifikasiEmail />
        </Suspense>
      </div>
    </main>
  );
}

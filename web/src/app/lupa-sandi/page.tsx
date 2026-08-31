"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import Logo from "@/components/layout/Logo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

export default function LupaSandiPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Email tidak ditemukan. Periksa kembali penulisan email Anda."
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

        {!sent ? (
          <>
            <h1 className="font-display text-2xl font-semibold text-ink">
              Lupa kata sandi
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Masukkan email yang terdaftar. Kami akan mengirimkan instruksi
              untuk mengatur ulang kata sandi Anda.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <Input
                label="Email terdaftar"
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && (
                <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
                  {error}
                </p>
              )}

              <Button type="submit" fullWidth disabled={loading}>
                {loading ? "Mengirim..." : "Kirim instruksi pemulihan"}
              </Button>
            </form>
          </>
        ) : (
          <div className="card p-6 text-center">
            <MailCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Instruksi telah dikirim
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Periksa kotak masuk <span className="font-medium text-ink">{email}</span>{" "}
              untuk melanjutkan pemulihan kata sandi.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

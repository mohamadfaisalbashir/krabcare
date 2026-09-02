"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Logo from "@/components/layout/Logo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

// Link reset dari email berbentuk {FRONTEND_RESET_PASSWORD_URL}?token=<raw>
// (backend: auth_service.request_password_reset).
function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Token reset tidak valid."
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
        Token reset tidak ditemukan pada tautan. Minta ulang lewat halaman{" "}
        <Link href="/lupa-sandi" className="font-semibold underline">
          Lupa sandi
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-brand-500" />
        <h2 className="font-display text-lg font-semibold text-ink">
          Kata sandi diperbarui
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          Mengalihkan ke halaman masuk...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
      <Input
        label="Kata sandi baru"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        autoComplete="new-password"
      />
      <Input
        label="Konfirmasi kata sandi baru"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
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
        {loading ? "Menyimpan..." : "Simpan kata sandi baru"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          Atur ulang kata sandi
        </h1>

        {/* useSearchParams wajib berada di dalam Suspense (Next 14 App Router). */}
        <Suspense fallback={<p className="mt-7 text-sm text-muted">Memuat...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

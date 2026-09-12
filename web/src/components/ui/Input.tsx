"use client";

import { InputHTMLAttributes, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/**
 * Kolom isian + labelnya. Untuk `type="password"`, tombol intip dirender di
 * sini, bukan ditempel per halaman: posisinya dihitung relatif terhadap input
 * sendiri, jadi tetap pas di semua breakpoint dan semua form sandi kebagian.
 *
 * Mata bawaan Edge/Chromium (::-ms-reveal) dimatikan di globals.css, kalau
 * tidak ada dua ikon berdampingan dan yang bawaan menutupi tombol ini.
 */
export default function Input({ label, id, type, className, ...rest }: Props) {
  const fallbackId = useId();
  const inputId = id ?? `${label.toLowerCase().replace(/\s+/g, "-")}-${fallbackId}`;
  const [terlihat, setTerlihat] = useState(false);

  const isPassword = type === "password";
  const tipeEfektif = isPassword && terlihat ? "text" : type;

  return (
    <div>
      <label htmlFor={inputId} className="label-field">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={tipeEfektif}
          // pr-11 hanya saat ada tombolnya, supaya teks sandi panjang tidak
          // merayap ke bawah ikon.
          className={`input-field ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setTerlihat((v) => !v)}
            // tabIndex -1: urutan Tab yang wajar adalah sandi -> tombol submit.
            // Masih bisa diklik.
            tabIndex={-1}
            aria-label={terlihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={terlihat}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-ink"
          >
            {terlihat ? (
              <EyeOff className="h-4 w-4" strokeWidth={2.2} />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={2.2} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { InputHTMLAttributes, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/**
 * Kolom isian + labelnya. Kalau `type="password"`, tombol intip ikut dirender
 * DI SINI, bukan ditempel dari luar oleh masing-masing halaman.
 *
 * Dulu halaman login menempelnya sendiri dengan `absolute right-3 top-[38px]`.
 * Dua masalahnya nyata: 38px itu tinggi label + setengah input pada breakpoint
 * `sm`, sedangkan `.input-field` sengaja lebih tinggi di mobile (text-base
 * supaya Safari iOS tidak memperbesar viewport), jadi ikonnya meleset di salah
 * satu ukuran layar. Dan halaman daftar tidak punya tombol itu sama sekali.
 * Diletakkan di sini, posisinya dihitung relatif terhadap INPUT-nya sendiri dan
 * semua form sandi ikut kebagian tanpa disalin.
 *
 * Mata bawaan Edge/Chromium (::-ms-reveal) dimatikan di globals.css, kalau
 * tidak, ada dua ikon berdampingan dan yang bawaan menutupi yang ini sehingga
 * tekanan pengguna tidak sampai ke React.
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
          // pr-11 hanya saat ada tombolnya, supaya teks sandi yang panjang tidak
          // merayap ke bawah ikon.
          className={`input-field ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setTerlihat((v) => !v)}
            // tabIndex -1: urutan Tab yang wajar adalah sandi -> tombol submit,
            // bukan mampir ke tombol hias di tengah jalan. Masih bisa diklik.
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

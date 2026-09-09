"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Pemilih jam bulat, menggantikan <select> dengan 24 <option>.
 *
 * Alasannya cuma satu: tinggi popup <select> bawaan diatur browser dan TIDAK
 * bisa dibatasi CSS, jadi 24 pilihan membuka daftar setinggi hampir seluruh
 * layar. Di sini daftarnya elemen biasa, sehingga `max-h-48` benar-benar
 * berlaku (kira-kira 8 baris, sisanya digulir).
 *
 * Karena ini menggantikan kontrol form bawaan, semua yang biasanya gratis harus
 * ditulis sendiri dan tidak boleh dipangkas: peran listbox untuk pembaca layar,
 * navigasi panah, Enter/Esc, Home/End, tutup saat klik di luar, dan fokus yang
 * kembali ke tombol setelah memilih. Itulah harga menolak <select>, dan itu
 * sebabnya komponen ini tidak dipakai untuk daftar yang pendek.
 */
export default function HourSelect({
  value,
  onChange,
  options,
  label,
  format,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  /** Dibacakan pembaca layar; tidak tampil karena labelnya sudah ada di kiri baris. */
  label: string;
  /** "00" -> "00.00". Formatternya milik pemanggil supaya komponen ini tidak
   *  ikut memutuskan notasi jam. */
  format: (h: string) => string;
}) {
  const [buka, setBuka] = useState(false);
  // Baris yang sedang disorot keyboard. Terpisah dari `value`: menyorot dengan
  // panah tidak boleh langsung mengubah pilihan, kalau tidak Esc jadi tidak
  // punya arti karena nilainya sudah terlanjur berubah.
  const [sorot, setSorot] = useState(() => Math.max(0, options.indexOf(value)));

  const wrapRef = useRef<HTMLDivElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);
  const daftarRef = useRef<HTMLUListElement>(null);
  const id = useId();

  // Tutup saat klik di luar. mousedown, bukan click: klik yang dimulai di dalam
  // daftar lalu dilepas di luar (seret saat menggulir) tidak boleh ikut menutup.
  useEffect(() => {
    if (!buka) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setBuka(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [buka]);

  // Jaga baris tersorot tetap terlihat di dalam area yang digulir.
  useEffect(() => {
    if (!buka) return;
    daftarRef.current
      ?.querySelector<HTMLLIElement>(`[data-idx="${sorot}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [buka, sorot]);

  function pilih(i: number) {
    onChange(options[i]);
    setBuka(false);
    tombolRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!buka) {
      // Panah/Enter/Space membuka daftar, sama seperti <select> bawaan.
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setSorot(Math.max(0, options.indexOf(value)));
        setBuka(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSorot((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSorot((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setSorot(0);
        break;
      case "End":
        e.preventDefault();
        setSorot(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pilih(sorot);
        break;
      case "Escape":
        e.preventDefault();
        setBuka(false);
        tombolRef.current?.focus();
        break;
      case "Tab":
        // Tab keluar dari kontrol: tutup, tapi JANGAN tahan fokusnya.
        setBuka(false);
        break;
    }
  }

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={tombolRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={buka ? `${id}-list` : undefined}
        onClick={() => {
          setSorot(Math.max(0, options.indexOf(value)));
          setBuka((v) => !v);
        }}
        className="input-field flex w-auto items-center gap-1.5 py-1.5"
      >
        {format(value)}
        <ChevronDown
          className={clsx("h-3.5 w-3.5 shrink-0 text-muted transition-transform", buka && "rotate-180")}
          strokeWidth={2.2}
        />
      </button>

      {buka && (
        <ul
          ref={daftarRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-opt-${sorot}`}
          tabIndex={-1}
          // max-h-48 inilah seluruh alasan komponen ini ada: kira-kira setengah
          // tinggi daftar 24 baris, sisanya digulir.
          className="absolute z-30 mt-1 max-h-48 min-w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {options.map((h, i) => {
            const terpilih = h === value;
            return (
              <li
                key={h}
                id={`${id}-opt-${i}`}
                data-idx={i}
                role="option"
                aria-selected={terpilih}
                // onMouseDown, bukan onClick: mousedown mendahului blur, jadi
                // pilihannya sempat terbaca sebelum apa pun menutup daftarnya.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pilih(i);
                }}
                onMouseEnter={() => setSorot(i)}
                className={clsx(
                  "cursor-pointer px-3 py-1.5 text-sm",
                  i === sorot && "bg-brand-50",
                  terpilih ? "font-semibold text-brand-700" : "text-ink"
                )}
              >
                {format(h)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

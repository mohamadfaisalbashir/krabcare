"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { NAMA_BULAN, NAMA_HARI, isoKeTampil, selBulan, tanggalWib } from "@/lib/tanggal";

/**
 * Pemilih tanggal berbahasa Indonesia, pengganti <input type="date">.
 *
 * Kalender bawaan browser mengikuti bahasa browser (Su Mo Tu, Clear, Today)
 * dan tidak bisa diganti lewat atribut `lang`, jadi popupnya dibuat sendiri.
 * Nilai tetap "yyyy-mm-dd" seperti input date, jadi pemanggil tidak berubah.
 *
 * Pola tutup klik-luar / Esc / fokus balik sama dengan HourSelect.
 * ponytail: tanpa navigasi panah di dalam grid; tiap tanggal adalah <button>
 * jadi tetap bisa dicapai dengan Tab. Tambahkan roving focus kalau dibutuhkan.
 */
export default function TanggalInput({
  value,
  onChange,
  min,
  max,
  label,
  wajib = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  /** Dibacakan pembaca layar. */
  label: string;
  /** true = tanggal tidak boleh kosong, tombol "Hapus" disembunyikan. */
  wajib?: boolean;
  className?: string;
}) {
  const [buka, setBuka] = useState(false);
  // Bulan yang sedang ditampilkan, terpisah dari `value` supaya bisa
  // menggeser bulan tanpa mengubah pilihan.
  const [lihat, setLihat] = useState({ tahun: 0, bulan: 0 });
  // Arah popup, dihitung saat dibuka dari ruang yang tersisa di layar:
  // kolom tanggal bisa di kiri, kanan, atau turun ke baris sendiri di HP.
  const [posisi, setPosisi] = useState({ kanan: false, atas: false });
  const wrapRef = useRef<HTMLDivElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!buka) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setBuka(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [buka]);

  function bukaPopup() {
    const acuan = value || tanggalWib();
    setLihat({ tahun: Number(acuan.slice(0, 4)), bulan: Number(acuan.slice(5, 7)) - 1 });
    const r = tombolRef.current?.getBoundingClientRect();
    if (r) {
      // 288 = w-72, 340 = perkiraan tinggi popup.
      setPosisi({
        kanan: r.left + 288 > window.innerWidth && r.right >= 288,
        atas: r.bottom + 340 > window.innerHeight && r.top > 340,
      });
    }
    setBuka(true);
  }

  function tutup() {
    setBuka(false);
    tombolRef.current?.focus();
  }

  function pilih(v: string) {
    onChange(v);
    tutup();
  }

  function geser(n: number) {
    setLihat(({ tahun, bulan }) => {
      const b = bulan + n;
      return { tahun: tahun + Math.floor(b / 12), bulan: ((b % 12) + 12) % 12 };
    });
  }

  const hariIni = tanggalWib();
  const diLuar = (d: string) => (!!min && d < min) || (!!max && d > max);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onKeyDown={(e) => {
        if (buka && e.key === "Escape") {
          e.preventDefault();
          tutup();
        }
      }}
    >
      <button
        ref={tombolRef}
        type="button"
        aria-label={value ? `${label}, ${isoKeTampil(value)}` : label}
        aria-haspopup="dialog"
        aria-expanded={buka}
        onClick={() => (buka ? setBuka(false) : bukaPopup())}
        className={clsx("input-field flex items-center justify-between gap-2", className)}
      >
        <span className={clsx("tabular-nums", !value && "text-muted")}>
          {value ? isoKeTampil(value) : "Pilih tanggal"}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
      </button>

      {buka && (
        <div
          role="dialog"
          aria-label={label}
          className={clsx(
            "absolute z-30 w-72 rounded-lg border border-border bg-surface p-3 shadow-lg",
            posisi.kanan ? "right-0" : "left-0",
            posisi.atas ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => geser(-1)}
              aria-label="Bulan sebelumnya"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            </button>
            <p className="text-sm font-semibold text-ink" aria-live="polite">
              {NAMA_BULAN[lihat.bulan]} {lihat.tahun}
            </p>
            <button
              type="button"
              onClick={() => geser(1)}
              aria-label="Bulan berikutnya"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {NAMA_HARI.map((h) => (
              <span key={h} className="py-1 text-[11px] font-semibold text-muted">
                {h}
              </span>
            ))}
            {selBulan(lihat.tahun, lihat.bulan).map((d, i) =>
              d === null ? (
                <span key={`k${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => pilih(d)}
                  disabled={diLuar(d)}
                  aria-pressed={d === value}
                  aria-label={`${Number(d.slice(8))} ${NAMA_BULAN[lihat.bulan]} ${lihat.tahun}`}
                  className={clsx(
                    "h-8 rounded-lg text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30",
                    d === value
                      ? "bg-brand-600 font-semibold text-white"
                      : "text-ink hover:bg-brand-50 disabled:hover:bg-transparent",
                    d === hariIni && d !== value && "font-semibold text-aksen-kuat ring-1 ring-brand-500"
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              )
            )}
          </div>

          <div className="mt-2 flex justify-between border-t border-border pt-2">
            {wajib ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={() => pilih("")}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-bg"
              >
                Hapus
              </button>
            )}
            <button
              type="button"
              onClick={() => pilih(hariIni)}
              disabled={diLuar(hariIni)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-aksen-kuat hover:bg-bg disabled:opacity-30"
            >
              Hari ini
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

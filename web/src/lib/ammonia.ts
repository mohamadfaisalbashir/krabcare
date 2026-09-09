// Penyajian indeks risiko toksisitas amonia.
//
// SENGAJA terpisah dari parameter.ts, dan `"amonia"` SENGAJA bukan ParamKey
// keempat: PARAM_KEYS menggerakkan RANGE, statusOf, HistoryChart, CombinedChart,
// submenu Sidebar, pil pemilih di log historis, ParamSwitch, dan kolom ekspor
// CSV sekaligus. Amonia bukan parameter TERUKUR, ia angka turunan dari ketiga
// parameter itu, jadi menyelipkannya ke daftar yang sama akan membuatnya muncul
// sebagai "garis keempat" di grafik sensor, yang keliru secara ilmiah.
import type { StatusLabel } from "./types";
import type { ParamKey } from "./parameter";

/** Nilai `?param=` di halaman Log historis: tiga parameter terukur + amonia.
 *  Dipisah dari ParamKey supaya amonia TIDAK ikut masuk grafik & ekspor sensor. */
export const LOG_PARAM_AMONIA = "amonia" as const;
export type LogParam = ParamKey | typeof LOG_PARAM_AMONIA;

/** Nilai risk_level dari backend (app/services/ammonia_speciation.py). */
export type RiskLevel = "normal" | "perhatian" | "berbahaya";

const RISK_TO_STATUS: Record<RiskLevel, StatusLabel> = {
  normal: "Aman",
  perhatian: "Waspada",
  berbahaya: "Bahaya",
};

/** Pemetaan ke label status yang sudah dipakai StatusBadge & warna status-*. */
export function riskToStatus(level: string | null | undefined): StatusLabel | null {
  if (!level) return null;
  return RISK_TO_STATUS[level as RiskLevel] ?? null;
}

/** Kebalikannya, dipakai filter status di halaman log historis. */
export const STATUS_TO_RISK: Record<StatusLabel, RiskLevel> = {
  Aman: "normal",
  Waspada: "perhatian",
  Bahaya: "berbahaya",
};

/**
 * Ambang fraksi NH3 (%), SALINAN dari classify_risk() di
 * backend/app/services/ammonia_speciation.py. Dua salinan karena Python dan
 * TypeScript tidak bisa berbagi konstanta, masalah yang sama persis dengan
 * water_thresholds.py vs parameter.ts (lihat README bagian "Ambang Parameter").
 * Ubah salah satu tanpa yang lain dan warna kartu bisa berselisih dengan
 * risk_level yang tersimpan di database.
 */
export const AMBANG = { perhatian: 6.0, berbahaya: 15.0 } as const;

/** Batas atas track visual. Di atas ~20% praktis semua kondisi sudah "Bahaya". */
export const SKALA_MAKS = 20;

/** Posisi sebuah fraksi di track 0-SKALA_MAKS, dijepit seperti rangePercent(). */
export function skalaPersen(fractionPct: number): number {
  return Math.max(0, Math.min(100, (fractionPct / SKALA_MAKS) * 100));
}

/** Satu desimal, koma ala Indonesia: 5.9985 -> "6,0". */
export function formatFraksi(fractionPct: number): string {
  return fractionPct.toFixed(1).replace(".", ",");
}

/**
 * Kalimat tren dari deret fraksi ramalan.
 *
 * Bentuknya sengaja meniru trendSentence() di parameter.ts supaya kolom amonia
 * terbaca sebagai satu keluarga dengan ketiga kolom di sebelahnya.
 */
export function trenAmonia(values: number[]): string {
  const first = values[0];
  const last = values[values.length - 1];
  // ponytail: 0,3 poin persen, kira-kira selebar riak semalam pada data uji.
  // Naikkan kalau pada data hardware asli kalimatnya terlalu sering berbunyi
  // "naik/turun" untuk perubahan yang tidak berarti.
  if (Math.abs(last - first) < 0.3) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const angka =
      min === max
        ? formatFraksi(max)
        : `${formatFraksi(min)} sampai ${formatFraksi(max)}`;
    return `Fraksi NH₃ berkisar ${angka}% dari TAN.`;
  }
  return `Fraksi NH₃ diprediksi ${
    last > first ? "naik" : "turun"
  } mendekati ${formatFraksi(last)}% dari TAN.`;
}

/** Judul kolom & bagian. Satu tempat supaya istilahnya tidak berbeda antar layar. */
export const AMONIA_UI = {
  label: "Risiko amonia (NH₃)",
  short: "Amonia",
  unit: "% dari TAN",
} as const;

/**
 * Kalimat batasan ilmiah. WAJIB tampil di dekat angkanya (amonia.md:7-8):
 * ini fraksi hasil model kesetimbangan, bukan konsentrasi terukur, karena
 * sensor amonia memang tidak terpasang di sistem ini.
 */
export const DISCLAIMER =
  "Amonia hanya perkiraan karena sensornya tidak terpasang. Angkanya dihitung dari pH, suhu, dan salinitas.";

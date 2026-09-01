// Ambang & penyajian tiga parameter kualitas air. Dipakai kartu parameter,
// panel prediksi, dan halaman log historis — dikumpulkan di sini supaya
// angkanya tidak menyebar dan ikut berbeda antar halaman.
import type { StatusLabel } from "./types";

export type ParamKey = "ph" | "temperature_c" | "salinity_ppt";

export const PARAM_KEYS: ParamKey[] = ["ph", "temperature_c", "salinity_ppt"];

// Batas toleransi & optimal mengacu pada Tabel 2.1 (Bab 2.2.1) dokumen CD GAB.
export const RANGE: Record<
  ParamKey,
  { min: number; max: number; optimal: [number, number] }
> = {
  ph: { min: 6.5, max: 9.0, optimal: [7.5, 8.5] },
  temperature_c: { min: 20, max: 35, optimal: [28, 30] },
  salinity_ppt: { min: 5, max: 40, optimal: [10, 30] },
};

export const PARAM_UI: Record<
  ParamKey,
  { label: string; short: string; unit: string }
> = {
  ph: { label: "Konsentrasi pH Air", short: "pH", unit: "pH" },
  temperature_c: { label: "Suhu Kolam", short: "Suhu", unit: "°C" },
  salinity_ppt: { label: "Tingkat Salinitas", short: "Salinitas", unit: "ppt" },
};

/** Di luar toleransi → Bahaya; di luar optimal (tapi masih toleransi) → Waspada. */
export function statusOf(param: ParamKey, value: number): StatusLabel {
  const { min, max, optimal } = RANGE[param];
  if (value < min || value > max) return "Bahaya";
  if (value < optimal[0] || value > optimal[1]) return "Waspada";
  return "Aman";
}

/**
 * Tampilkan maksimal 2 desimal tanpa nol di belakang: 8.75 → "8.75",
 * 7.70 → "7.7", 25.00 → "25". Nilai dari backend bertipe Numeric, jadi
 * nol trailing-nya ikut terbawa kalau tidak dirapikan.
 */
export function formatValue(value: number): string {
  return String(Number(value.toFixed(2)));
}

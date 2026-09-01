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

/**
 * `color` dipakai kedua grafik (HistoryChart & CombinedChart) sebagai stroke SVG,
 * jadi harus hex — kelas Tailwind tidak bisa dipakai di sana. Disimpan di sini,
 * bukan di masing-masing komponen, supaya satu parameter selalu berwarna sama.
 *
 * Diverifikasi dengan validator palet: separasi buta warna terburuk ΔE 15.3
 * (protan) / 23.0 (tritan), jauh di atas ambang 8 — jadi tidak perlu pembeda
 * garis putus-putus. Biru salinitas sengaja lebih pekat dari #2B7A9E yang lama,
 * yang gagal chroma floor dan cenderung terbaca abu-abu.
 *
 * pH SENGAJA tetap hijau meski warna merek aplikasi sudah jadi cyan #19A8B2.
 * Ini palet kategorikal, bukan warna merek: tugasnya membedakan tiga garis di
 * satu grafik. Menyamakan pH dengan #19A8B2 membuatnya bertabrakan dengan biru
 * salinitas — terukur ΔE 12.1 pada penglihatan normal, di bawah ambang 15,
 * artinya kedua garis sulit dibedakan bahkan tanpa buta warna.
 */
export const PARAM_UI: Record<
  ParamKey,
  { label: string; short: string; unit: string; color: string }
> = {
  ph: { label: "Konsentrasi pH Air", short: "pH", unit: "pH", color: "#0E6E5C" },
  temperature_c: { label: "Suhu Kolam", short: "Suhu", unit: "°C", color: "#C1873A" },
  salinity_ppt: { label: "Tingkat Salinitas", short: "Salinitas", unit: "ppt", color: "#1B7FAE" },
};

/** Sumbu X kedua grafik: rentang 100 pembacaan ≈ 25 jam, jadi jam saja berulang. */
export function chartTickLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Di luar toleransi → Bahaya; di luar optimal (tapi masih toleransi) → Waspada. */
export function statusOf(param: ParamKey, value: number): StatusLabel {
  const { min, max, optimal } = RANGE[param];
  if (value < min || value > max) return "Bahaya";
  if (value < optimal[0] || value > optimal[1]) return "Waspada";
  return "Aman";
}

/**
 * Tampilkan maksimal 1 desimal tanpa nol di belakang: 7.63 → "7.6",
 * 7.70 → "7.7", 25.00 → "25". Nilai dari backend bertipe Numeric (pH dan
 * salinitas 2 desimal, suhu 1), jadi tanpa perapian ini satu layar bisa
 * mencampur "7.63" dan "22.4" dan terbaca tidak konsisten.
 *
 * Hanya untuk TAMPILAN. Ekspor CSV sengaja memakai nilai mentah supaya
 * presisi penuhnya tidak hilang — lihat toCsv() di lib/export.ts.
 */
export function formatValue(value: number): string {
  return String(Number(value.toFixed(1)));
}

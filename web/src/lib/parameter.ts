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
  ph: { label: "Konsentrasi pH air", short: "pH", unit: "pH", color: "#0E6E5C" },
  temperature_c: { label: "Suhu kolam", short: "Suhu", unit: "°C", color: "#C1873A" },
  salinity_ppt: { label: "Tingkat salinitas", short: "Salinitas", unit: "ppt", color: "#1B7FAE" },
};

/**
 * Sumbu Y kedua grafik.
 *
 * Sengaja BUKAN formatValue. Tick sumbu bukan pembacaan sensor, ia hasil bagi
 * domain dan bisa jatuh di 7.05; dibulatkan ke 1 desimal angka itu tercetak "7"
 * padahal garisnya ada di 7.05. Dua desimal jujur dan tetap ≤5 karakter, jadi
 * masih muat di sumbu selebar 44px.
 *
 * toFixed lalu Number itulah yang memangkas ekor float recharts
 * (2.1999999999999997 → "2.2") — penyebab sumbu salinitas terlihat terpotong.
 */
export function chartValueLabel(value: number): string {
  return String(Number(value.toFixed(2)));
}

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

/**
 * Posisi sebuah nilai di dalam rentang toleransi, dinyatakan 0-100 persen.
 *
 * Dipakai kartu parameter untuk menggambar penanda di atas track rentang.
 * DIJEPIT di kedua ujung: nilai di luar toleransi (yang memang mungkin —
 * itulah status "Bahaya") kalau tidak dijepit akan menaruh penandanya di luar
 * batang dan terlihat seperti bug, bukan seperti peringatan.
 */
export function rangePercent(param: ParamKey, value: number): number {
  const { min, max } = RANGE[param];
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Pita optimal di atas track yang sama, sebagai [mulai%, lebar%].
 *
 * Satu sumber dengan rangePercent supaya penanda nilai dan pita hijau tidak
 * bisa memakai skala yang berbeda — kalau itu terjadi, kartunya akan
 * menunjukkan penanda di luar pita untuk nilai yang statusnya "Aman".
 */
export function optimalBand(param: ParamKey): [number, number] {
  const [lo, hi] = RANGE[param].optimal;
  const start = rangePercent(param, lo);
  return [start, rangePercent(param, hi) - start];
}

// ponytail: ambang "berkisar" per parameter — angka kasar dari rentang gerak
// data, bukan turunan dari proposal. Naikkan kalau pada data hardware asli
// kalimatnya terlalu sering berbunyi "naik/turun" untuk riak yang tidak berarti.
const STABLE_THRESHOLD: Record<ParamKey, number> = {
  ph: 0.1,
  temperature_c: 0.3,
  salinity_ppt: 0.5,
};

/**
 * Kalimat tren dari deret ramalan satu parameter, beserta statusnya.
 *
 * Tinggal di sini, bukan di PredictionPanel: isinya cuma PARAM_UI, formatValue,
 * dan statusOf yang ketiganya sudah ada di berkas ini, tidak menyentuh React,
 * dan dengan begitu ikut terjaring `npm test` (parameter.test.ts).
 *
 * Status dikembalikan TERPISAH, tidak disisipkan ke kalimat. Panel menaruhnya
 * di pojok kanan atas kolom; menulisnya lagi di ujung kalimat cuma mengulang
 * hal yang sama dua kali di satu kolom selebar ~12rem.
 */
export function trendSentence(
  param: ParamKey,
  values: number[]
): { text: string; status: StatusLabel } {
  const { short, unit } = PARAM_UI[param];
  const first = values[0];
  const last = values[values.length - 1];
  const status = statusOf(param, last);
  // Satuan pH KEBETULAN sama dengan nama pendeknya, dan "pH berkisar di angka
  // 7.8 pH" menyebut hal yang sama dua kali dalam satu kalimat.
  const satuan = unit === short ? "" : ` ${unit}`;

  if (Math.abs(last - first) < STABLE_THRESHOLD[param]) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const angka =
      min === max ? formatValue(max) : `${formatValue(min)} – ${formatValue(max)}`;
    return { text: `${short} berkisar di angka ${angka}${satuan}.`, status };
  }

  return {
    text: `${short} diprediksi ${
      last > first ? "naik" : "turun"
    } mendekati ${formatValue(last)}${satuan}.`,
    status,
  };
}

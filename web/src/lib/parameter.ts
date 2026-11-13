// Ambang & penyajian tiga parameter kualitas air. Satu tempat supaya angkanya
// tidak berbeda antara kartu parameter, panel prediksi, dan log historis.
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
 * `color` dipakai kedua grafik sebagai stroke SVG, jadi harus hex (kelas
 * Tailwind tidak bisa dipakai di sana).
 *
 * Palet kategorikal, bukan warna merek. Separasi buta warna terburuk ΔE 15.3
 * (protan) / 23.0 (tritan), di atas ambang 8, jadi tidak perlu garis putus.
 * pH tetap hijau: disamakan dengan cyan merek #19A8B2 jaraknya ke biru
 * salinitas cuma ΔE 12.1, di bawah ambang 15.
 */
export const PARAM_UI: Record<
  ParamKey,
  { label: string; short: string; unit: string; color: string }
> = {
  ph: { label: "Konsentrasi pH air", short: "pH", unit: "pH", color: "rgb(var(--c-param-ph))" },
  temperature_c: { label: "Suhu kolam", short: "Suhu", unit: "°C", color: "rgb(var(--c-param-suhu))" },
  salinity_ppt: { label: "Tingkat salinitas", short: "Salinitas", unit: "ppt", color: "rgb(var(--c-param-salinitas))" },
};

/**
 * Sumbu Y kedua grafik. Bukan formatValue: tick adalah hasil bagi domain dan
 * bisa jatuh di 7.05, yang dibulatkan 1 desimal jadi tercetak "7". Dua desimal
 * tetap ≤5 karakter, muat di sumbu selebar 44px.
 *
 * toFixed lalu Number memangkas ekor float recharts (2.1999999999999997 → 2.2).
 */
export function chartValueLabel(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** Tick sumbu Y grafik, rumus Recharts 2 (getTickValuesFixedDomain, 5 tick):
 *  kelipatan langkah "bulat" dari batas bawah, lalu batas atas, tanpa tick yang
 *  jaraknya ke batas atas kurang dari satu langkah.
 *
 *  Recharts 3 menyisipkan tick itu (pH jadi 9.2, 8.55, 7.8, ...), sehingga dua
 *  label teratas berdempetan. Dihitung sendiri supaya sumbunya tidak berubah
 *  tiap ganti versi pustaka. */
export function yTicks(lo: number, hi: number): number[] {
  const kasar = (hi - lo) / 4;
  const pangkat = 10 ** (Math.floor(Math.log10(kasar)) + 1);
  const skala = pangkat === 10 ? 0.1 : 0.05;
  // toFixed: 0.75 / 0.05 = 15.000000000000002 dan ceil-nya jadi 16.
  const langkah = Math.ceil(+(kasar / pangkat / skala).toFixed(9)) * skala * pangkat;
  const ticks: number[] = [];
  for (let i = 0; lo + i * langkah < hi - 0.99 * langkah; i++) ticks.push(lo + i * langkah);
  return [...ticks, hi];
}

/** Sumbu X kedua grafik: rentang 100 pembacaan ≈ 25 jam, jadi jam saja berulang. */
export function chartTickLabel(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Di luar toleransi → Bahaya. Di luar optimal (tapi masih toleransi) → Waspada. */
export function statusOf(param: ParamKey, value: number): StatusLabel {
  const { min, max, optimal } = RANGE[param];
  if (value < min || value > max) return "Bahaya";
  if (value < optimal[0] || value > optimal[1]) return "Waspada";
  return "Aman";
}

/**
 * Maksimal 2 desimal tanpa nol di belakang: 7.634 → "7.63", 25.00 → "25".
 * Dua desimal, bukan satu: di dekat batas status, 8.54 yang ditulis "8.5"
 * tampil berdampingan dengan label Waspada dan terbaca seperti salah hitung.
 * Hanya untuk tampilan; ekspor CSV memakai nilai mentah (toCsv() di export.ts).
 */
export function formatValue(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * Posisi nilai di dalam rentang toleransi, 0-100 persen, untuk penanda di
 * track kartu parameter. Dijepit di kedua ujung supaya nilai berstatus
 * "Bahaya" tidak menaruh penandanya di luar batang.
 */
export function rangePercent(param: ParamKey, value: number): number {
  const { min, max } = RANGE[param];
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Pita optimal di track yang sama, sebagai [mulai%, lebar%]. Lewat rangePercent
 * supaya penanda nilai dan pita hijau tidak memakai skala berbeda.
 */
export function optimalBand(param: ParamKey): [number, number] {
  const [lo, hi] = RANGE[param].optimal;
  const start = rangePercent(param, lo);
  return [start, rangePercent(param, hi) - start];
}

// ponytail: ambang "berkisar" per parameter, angka kasar dari rentang gerak
// data, bukan turunan dari proposal. Naikkan kalau pada data hardware asli
// kalimatnya terlalu sering berbunyi "naik/turun" untuk riak yang tidak berarti.
const STABLE_THRESHOLD: Record<ParamKey, number> = {
  ph: 0.1,
  temperature_c: 0.3,
  salinity_ppt: 0.5,
};

/**
 * Kalimat tren dari deret ramalan satu parameter, beserta statusnya.
 * Status dikembalikan terpisah, tidak disisipkan ke kalimat: panel sudah
 * menampilkannya sebagai badge di pojok kolom.
 */
export function trendSentence(
  param: ParamKey,
  values: number[]
): { text: string; status: StatusLabel } {
  const { short, unit } = PARAM_UI[param];
  const first = values[0];
  const last = values[values.length - 1];
  const status = statusOf(param, last);
  // Satuan pH sama dengan nama pendeknya, hindari "7.8 pH pH".
  const satuan = unit === short ? "" : ` ${unit}`;

  if (Math.abs(last - first) < STABLE_THRESHOLD[param]) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const angka =
      min === max ? formatValue(max) : `${formatValue(min)} sampai ${formatValue(max)}`;
    return { text: `${short} berkisar di angka ${angka}${satuan}.`, status };
  }

  return {
    text: `${short} diprediksi ${
      last > first ? "naik" : "turun"
    } mendekati ${formatValue(last)}${satuan}.`,
    status,
  };
}

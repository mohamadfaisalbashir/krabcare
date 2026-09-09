// Ekspor data mentah sensor ke CSV & XLSX. Seluruhnya di klien: backend tidak
// punya endpoint ekspor, dan /readings dibatasi 1000 baris per permintaan.
//
// Modul ini sengaja TANPA import runtime di ATAS (hanya `import type`, yang
// terhapus saat kompilasi) supaya `node --test` bisa memuatnya tanpa me-resolve
// apa pun. write-excel-file karenanya di-import DINAMIS di dalam downloadXlsx,
// bukan di kepala berkas: ia satu-satunya bagian yang butuh DOM + bundler, dan
// import statis di sini akan mematikan seluruh berkas tesnya. Efek sampingnya
// kebetulan menguntungkan — pustakanya baru diunduh browser saat pengguna
// benar-benar memilih XLSX.
import type { SensorReading } from "./types";
import type { ParamKey } from "./parameter";
import { formatWaktuDetik } from "./tanggal.ts";

/** RFC 4180 + default pandas. Ganti ";" kalau Excel-ID jadi konsumen utama. */
export const CSV_SEP = ",";
/** Excel butuh BOM untuk membaca UTF-8; pandas pakai encoding="utf-8-sig". */
export const CSV_BOM = "﻿";

/** Batas keras backend — backend/app/routers/readings.py:22 (le=1000). */
const CHUNK = 1000;
/** 20 x 1000 = 20.000 baris per sensor, kira-kira 200 hari pada interval 15 menit. */
export const MAX_PAGES = 20;

/**
 * `<input type="date">` memberi "2026-09-01". `new Date("2026-09-01")` itu
 * tengah malam UTC, sedangkan `new Date("2026-09-01T00:00:00")` tengah malam
 * LOKAL — di WIB selisihnya 7 jam, di kedua ujung rentang. Bentuk kedua yang
 * benar: pengguna memilih tanggal menurut jamnya sendiri.
 */
export function dayRangeToIso(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00`).toISOString(),
    end: new Date(`${to}T23:59:59.999`).toISOString(),
  };
}

export type GetPage = (p: {
  device_id: number;
  start_time: string;
  end_time: string;
  limit: number;
}) => Promise<SensorReading[]>;

/**
 * Ambil SEMUA reading satu device dalam rentang waktu, menembus batas 1000.
 *
 * /readings tidak punya offset maupun cursor, tapi punya filter `end_time`.
 * Jadi paging dilakukan mundur: tiap putaran meminta 1000 baris terbaru yang
 * <= cursor, lalu cursor digeser ke baris tertua yang baru didapat.
 *
 * WAJIB per device. PK sensor_readings adalah (device_id, time), jadi `time`
 * unik hanya DI DALAM satu device — jaminan itulah yang membuat duplikat di
 * batas halaman selalu tepat satu baris dan selalu di posisi pertama. Query
 * lintas device tidak punya jaminan itu dan akan menggandakan atau menghilangkan
 * baris di tiap batas.
 *
 * Hasilnya DIBALIK sebelum dikembalikan: paging jalan mundur (terbaru dulu),
 * sedangkan berkas ekspor harus mulai dari data TERLAMA. Dibalik di sini, satu
 * tempat, bukan di pemanggil — supaya urutannya tidak bisa beda antar pemakai.
 */
export async function fetchAllReadings(
  getPage: GetPage,
  device_id: number,
  start_time: string,
  endIso: string
): Promise<{ rows: SensorReading[]; truncated: boolean }> {
  const rows: SensorReading[] = [];
  let cursor = endIso;

  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await getPage({ device_id, start_time, end_time: cursor, limit: CHUNK });

    // end_time bersifat inklusif (<=), jadi baris pertama halaman ini sama
    // dengan baris terakhir halaman sebelumnya. Buang tepat satu.
    rows.push(...(rows.length && page[0]?.time === cursor ? page.slice(1) : page));

    // Halaman tidak penuh berarti jendela waktunya sudah habis. Syarat ini juga
    // sudah mencakup halaman kosong dan halaman yang isinya cuma duplikat.
    if (page.length < CHUNK) return { rows: rows.reverse(), truncated: false };

    // Verbatim, jangan lewat Date: `time` punya presisi mikrodetik dan
    // toISOString() memotongnya ke milidetik — cursor jadi bergeser lebih awal
    // dan baris di celah itu hilang diam-diam.
    cursor = page[page.length - 1].time;
  }

  return { rows: rows.reverse(), truncated: true };
}

/** Bungkus sel yang mengandung pemisah, kutip, atau newline (nama kolam itu teks bebas). */
function cell(s: string): string {
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Selisih jam device (`time`) dan jam backend (`received_at`), dalam detik.
 *
 * Inilah latensi gateway->backend yang jadi tujuan kolom ini. Bisa NEGATIF
 * kalau jam Raspberry Pi berjalan lebih cepat dari jam server — dan itu justru
 * yang perlu terlihat, jadi JANGAN dijepit ke 0: angka negatif adalah bukti
 * jamnya perlu disinkronkan, bukan noise yang harus disembunyikan.
 */
export function latensiDetik(r: SensorReading): number {
  return (new Date(r.received_at).getTime() - new Date(r.time).getTime()) / 1000;
}

/** Nama kolom, satu definisi untuk CSV maupun XLSX. */
export function headerFor(params: ParamKey[]): string[] {
  return [
    "waktu_lokal",
    "waktu_diterima",
    "latensi_detik",
    "device_code",
    "kolam",
    ...params,
  ];
}

/**
 * Kolom parameter dinamai persis seperti field backend (ph, temperature_c,
 * salinity_ppt) supaya berkasnya langsung cocok dipakai pandas.
 */
export function toCsv(
  rows: SensorReading[],
  params: ParamKey[],
  kolamByDevice: Record<number, string>
): string {
  const lines = [headerFor(params).join(CSV_SEP)];

  for (const r of rows) {
    const values = params.map((p) => {
      const v = r[p];
      // Nilai mentah, bukan formatValue: itu untuk tampilan. CSV membawa
      // presisi penuh. null jadi sel kosong (dibaca pandas sebagai NaN).
      return v == null ? "" : String(v);
    });
    lines.push(
      [
        formatWaktuDetik(r.time),
        formatWaktuDetik(r.received_at),
        String(latensiDetik(r)),
        cell(r.device_code),
        cell(kolamByDevice[r.device_id] ?? ""),
        ...values,
      ].join(CSV_SEP)
    );
  }

  return lines.join("\n");
}

/** "csv" | "xlsx" — dipilih pengguna di ExportPanel. */
export type ExportFormat = "csv" | "xlsx";

export function namaBerkas(
  deviceLabel: string,
  params: ParamKey[],
  from: string,
  to: string,
  format: ExportFormat
): string {
  // Segmen parameter dihilangkan kalau ketiganya ikut — namanya sudah panjang.
  const paramPart = params.length === 3 ? "" : `_${params.join("-")}`;
  return `log-sensor_${deviceLabel}${paramPart}_${from}_${to}.${format}`;
}

function unduh(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  // Revoke langsung pernah membatalkan unduhan di Safari; tunda satu tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(csv: string, filename: string): void {
  unduh(new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * XLSX lewat write-excel-file v4 (import dinamis — lihat catatan di kepala berkas).
 *
 * Subpath `/browser` WAJIB: paketnya tidak punya export root ".", cuma
 * "./browser", "./node", "./universal". `import("write-excel-file")` polos
 * gagal resolve.
 *
 * Kedua kolom waktu ditulis sebagai `Date` asli dengan format tampilan
 * dd-mm-yyyy, BUKAN teks. Itu bedanya dengan CSV: di Excel kolomnya tampil
 * dd-mm-yyyy persis seperti yang diminta, tapi tetap terurut & terfilter
 * sebagai tanggal. Teks "09-09-2026" akan terurut sebagai teks, dan Januari
 * 2027 mendarat di antara dua tanggal September 2026.
 */
export async function downloadXlsx(
  rows: SensorReading[],
  params: ParamKey[],
  kolamByDevice: Record<number, string>,
  filename: string
): Promise<void> {
  const writeXlsxFile = (await import("write-excel-file/browser")).default;

  const FORMAT_TANGGAL = "dd-mm-yyyy hh:mm:ss";
  const header = (value: string) => ({ value, fontWeight: "bold" as const });

  const columns = [
    {
      header: header("waktu_lokal"),
      cell: (r: SensorReading) => ({
        value: new Date(r.time),
        type: Date,
        format: FORMAT_TANGGAL,
      }),
      width: 20,
    },
    {
      header: header("waktu_diterima"),
      cell: (r: SensorReading) => ({
        value: new Date(r.received_at),
        type: Date,
        format: FORMAT_TANGGAL,
      }),
      width: 20,
    },
    {
      header: header("latensi_detik"),
      cell: (r: SensorReading) => ({ value: latensiDetik(r), type: Number }),
    },
    {
      header: header("device_code"),
      cell: (r: SensorReading) => ({ value: r.device_code, type: String }),
    },
    {
      header: header("kolam"),
      cell: (r: SensorReading) => ({
        value: kolamByDevice[r.device_id] ?? "",
        type: String,
      }),
      width: 18,
    },
    ...params.map((p) => ({
      header: header(p),
      // undefined, BUKAN null: sel kosong harus benar-benar kosong supaya
      // Excel tidak membacanya sebagai 0 — pembacaan sensor yang hilang
      // bukan pembacaan bernilai nol.
      cell: (r: SensorReading) => ({ value: r[p] ?? undefined, type: Number }),
    })),
  ];

  await writeXlsxFile(rows, { columns }).toFile(filename);
}

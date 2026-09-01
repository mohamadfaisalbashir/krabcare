// Ekspor data mentah sensor ke CSV. Seluruhnya di klien: backend tidak punya
// endpoint ekspor, dan /readings dibatasi 1000 baris per permintaan.
//
// Modul ini sengaja TANPA import runtime (hanya `import type`, yang terhapus
// saat kompilasi) supaya `node --test` bisa memuatnya tanpa me-resolve apa pun.
import type { SensorReading } from "./types";
import type { ParamKey } from "./parameter";

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
    if (page.length < CHUNK) return { rows, truncated: false };

    // Verbatim, jangan lewat Date: `time` punya presisi mikrodetik dan
    // toISOString() memotongnya ke milidetik — cursor jadi bergeser lebih awal
    // dan baris di celah itu hilang diam-diam.
    cursor = page[page.length - 1].time;
  }

  return { rows, truncated: true };
}

/** Bungkus sel yang mengandung pemisah, kutip, atau newline (nama kolam itu teks bebas). */
function cell(s: string): string {
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Waktu lokal siap baca: "2026-08-31 16:12:57". Locale sv-SE kebetulan
 * menghasilkan format ISO-like yang zero-padded dan bisa diurutkan sebagai
 * teks — tidak perlu pustaka tanggal.
 */
function localStamp(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE");
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
  const header = ["waktu_lokal", "device_code", "kolam", ...params];
  const lines = [header.join(CSV_SEP)];

  for (const r of rows) {
    const values = params.map((p) => {
      const v = r[p];
      // Nilai mentah, bukan formatValue: itu untuk tampilan. CSV membawa
      // presisi penuh. null jadi sel kosong (dibaca pandas sebagai NaN).
      return v == null ? "" : String(v);
    });
    lines.push(
      [
        localStamp(r.time),
        cell(r.device_code),
        cell(kolamByDevice[r.device_id] ?? ""),
        ...values,
      ].join(CSV_SEP)
    );
  }

  return lines.join("\n");
}

export function csvFilename(
  deviceLabel: string,
  params: ParamKey[],
  from: string,
  to: string
): string {
  // Segmen parameter dihilangkan kalau ketiganya ikut — namanya sudah panjang.
  const paramPart = params.length === 3 ? "" : `_${params.join("-")}`;
  return `log-sensor_${deviceLabel}${paramPart}_${from}_${to}.csv`;
}

export function downloadCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" })
  );
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  // Revoke langsung pernah membatalkan unduhan di Safari; tunda satu tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

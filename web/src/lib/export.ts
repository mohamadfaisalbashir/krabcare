// Ekspor data mentah sensor ke CSV & XLSX. Seluruhnya di klien: backend tidak
// punya endpoint ekspor, dan /readings dibatasi 1000 baris per permintaan.
//
// Modul ini sengaja TANPA import runtime di ATAS (hanya `import type`, yang
// terhapus saat kompilasi) supaya `node --test` bisa memuatnya tanpa me-resolve
// apa pun. write-excel-file karenanya di-import DINAMIS di dalam downloadXlsx,
// bukan di kepala berkas: ia satu-satunya bagian yang butuh DOM + bundler, dan
// import statis di sini akan mematikan seluruh berkas tesnya. Efek sampingnya
// kebetulan menguntungkan, pustakanya baru diunduh browser saat pengguna
// benar-benar memilih XLSX.
import type { SensorReading } from "./types";
import type { ParamKey } from "./parameter";
import { formatWaktuDetik } from "./tanggal.ts";

/** RFC 4180 + default pandas. Ganti ";" kalau Excel-ID jadi konsumen utama. */
export const CSV_SEP = ",";
/**
 * BOM UTF-8 di depan berkas CSV. Tanpa ini Excel membaca berkasnya sebagai
 * ANSI dan huruf beraksen jadi mojibake. Padanannya di pandas:
 * encoding="utf-8-sig".
 *
 * Ditulis sebagai escape \uFEFF, BUKAN karakternya langsung. Nilainya
 * persis sama saat dijalankan, tapi di dalam berkas sumber karakter itu
 * tidak terlihat sama sekali: pembaca kode mengira string kosong, dan
 * pemindai karakter tersembunyi melaporkannya sebagai penanda mencurigakan.
 * Escape-nya menyebutkan diri sendiri.
 */
export const CSV_BOM = "\uFEFF";

/** Batas keras backend, backend/app/routers/readings.py:22 (le=1000). */
const CHUNK = 1000;
/** 20 x 1000 = 20.000 baris per sensor, kira-kira 200 hari pada interval 15 menit. */
export const MAX_PAGES = 20;

/**
 * `<input type="date">` memberi "2026-09-01". `new Date("2026-09-01")` itu
 * tengah malam UTC, sedangkan `new Date("2026-09-01T00:00:00")` tengah malam
 * LOKAL, di WIB selisihnya 7 jam, di kedua ujung rentang. Bentuk kedua yang
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
 * unik hanya DI DALAM satu device, jaminan itulah yang membuat duplikat di
 * batas halaman selalu tepat satu baris dan selalu di posisi pertama. Query
 * lintas device tidak punya jaminan itu dan akan menggandakan atau menghilangkan
 * baris di tiap batas.
 *
 * Hasilnya DIBALIK sebelum dikembalikan: paging jalan mundur (terbaru dulu),
 * sedangkan berkas ekspor harus mulai dari data TERLAMA. Dibalik di sini, satu
 * tempat, bukan di pemanggil, supaya urutannya tidak bisa beda antar pemakai.
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
    // toISOString() memotongnya ke milidetik, cursor jadi bergeser lebih awal
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
 * kalau jam Raspberry Pi berjalan lebih cepat dari jam server, dan itu justru
 * yang perlu terlihat, jadi JANGAN dijepit ke 0: angka negatif adalah bukti
 * jamnya perlu disinkronkan, bukan noise yang harus disembunyikan.
 */
export function latensiDetik(r: SensorReading): number {
  return (new Date(r.received_at).getTime() - new Date(r.time).getTime()) / 1000;
}

/**
 * Toleransi pencocokan reading sensor <-> baris amonia, dalam milidetik.
 *
 * Amonia hidup di tabel lain (`ammonia_risks`) dan diambil lewat endpoint
 * lain, tapi SEHARUSNYA dihitung dari pembacaan sensor yang sama persis
 * (lihat raspi/edge_pipeline.py: satu variabel `waktu` dipakai untuk
 * keduanya). Kenyataan di lapangan: gateway mengirimkannya lewat DUA request
 * HTTP terpisah (POST /ingest/readings lalu POST /ingest/quality), dan jeda
 * beberapa detik di antara keduanya membuat `time` yang tersimpan di
 * ammonia_risks tidak selalu identik BIT-PER-BIT dengan `time` di
 * sensor_readings. Pencocokan kunci string persis sebelumnya membuat kolom
 * amonia di ekspor kosong 100% walau datanya ADA di database.
 *
 * Diganti jadi "amonia terdekat pada device yang sama, dalam jendela ini".
 * 30 detik dipilih karena interval antar-reading pada sistem ini biasanya
 * 60 detik ke atas, jadi jendela ini tidak akan salah pasang ke reading
 * tetangga, tapi cukup longgar untuk menyerap jeda dua-request di atas.
 */
export const TOLERANSI_AMONIA_MS = 30_000;

type BarisAmonia = { t: number; fraction_nh3_pct: number | null; risk_level: string | null };

/** Amonia dikelompokkan per device, diurutkan waktu naik (syarat binary search di cariAmonia). */
export type PetaAmonia = Map<number, BarisAmonia[]>;

/** Susun peta amonia dari hasil /quality/ammonia-risk/history. */
export function petaAmoniaDari(
  rows: { device_id: number; time: string; fraction_nh3_pct: number | null; risk_level: string | null }[]
): PetaAmonia {
  const peta: PetaAmonia = new Map();
  for (const a of rows) {
    const arr = peta.get(a.device_id) ?? [];
    arr.push({
      t: new Date(a.time).getTime(),
      fraction_nh3_pct: a.fraction_nh3_pct,
      risk_level: a.risk_level,
    });
    peta.set(a.device_id, arr);
  }
  for (const arr of peta.values()) arr.sort((x, y) => x.t - y.t);
  return peta;
}

/**
 * Amonia device tertentu yang waktunya PALING DEKAT dengan `time`, kalau ada
 * yang jatuh dalam TOLERANSI_AMONIA_MS. Binary search: array per-device sudah
 * terurut naik (dijamin petaAmoniaDari), jadi tetangga terdekat cuma bisa ada
 * tepat di titik potong itu atau satu langkah sebelumnya.
 */
export function cariAmonia(
  peta: PetaAmonia,
  device_id: number,
  time: string
): { fraction_nh3_pct: number | null; risk_level: string | null } | undefined {
  const arr = peta.get(device_id);
  if (!arr || arr.length === 0) return undefined;

  const target = new Date(time).getTime();
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < target) lo = mid + 1;
    else hi = mid;
  }

  let terbaik = arr[lo];
  let jarak = Math.abs(terbaik.t - target);
  if (lo > 0) {
    const sebelum = arr[lo - 1];
    const jarakSebelum = Math.abs(sebelum.t - target);
    if (jarakSebelum < jarak) {
      terbaik = sebelum;
      jarak = jarakSebelum;
    }
  }

  return jarak <= TOLERANSI_AMONIA_MS ? terbaik : undefined;
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
    "amonia_nh3_persen",
    "amonia_risiko",
  ];
}

/**
 * Kolom parameter dinamai persis seperti field backend (ph, temperature_c,
 * salinity_ppt) supaya berkasnya langsung cocok dipakai pandas.
 */
export function toCsv(
  rows: SensorReading[],
  params: ParamKey[],
  kolamByDevice: Record<number, string>,
  // Wajib, bukan opsional berdefault Map kosong. Kalau boleh dilewat, pemanggil
  // yang lupa akan menghasilkan berkas dengan dua kolom amonia yang kosong
  // semua, dan itu terbaca seperti "tidak ada data amonia", bukan seperti bug.
  amonia: PetaAmonia
): string {
  const lines = [headerFor(params).join(CSV_SEP)];

  for (const r of rows) {
    const values = params.map((p) => {
      const v = r[p];
      // Nilai mentah, bukan formatValue: itu untuk tampilan. CSV membawa
      // presisi penuh. null jadi sel kosong (dibaca pandas sebagai NaN).
      return v == null ? "" : String(v);
    });
    const a = cariAmonia(amonia, r.device_id, r.time);
    lines.push(
      [
        formatWaktuDetik(r.time),
        formatWaktuDetik(r.received_at),
        String(latensiDetik(r)),
        cell(r.device_code),
        cell(kolamByDevice[r.device_id] ?? ""),
        ...values,
        a?.fraction_nh3_pct == null ? "" : String(a.fraction_nh3_pct),
        a?.risk_level ? cell(a.risk_level) : "",
      ].join(CSV_SEP)
    );
  }

  return lines.join("\n");
}

/** "csv" | "xlsx", dipilih pengguna di ExportPanel. */
export type ExportFormat = "csv" | "xlsx";

export function namaBerkas(
  deviceLabel: string,
  params: ParamKey[],
  from: string,
  to: string,
  format: ExportFormat
): string {
  // Segmen parameter dihilangkan kalau ketiganya ikut, namanya sudah panjang.
  // Daftar KOSONG berarti pengguna memilih "Amonia saja": kolom amonia selalu
  // ikut tanpa bergantung pilihan ini, jadi tidak ada parameter sensor yang
  // perlu disebut, dan tanpa cabang ini namanya berakhir dengan garis bawah ganda.
  const paramPart =
    params.length === 0 ? "_amonia" : params.length === 3 ? "" : `_${params.join("-")}`;
  return `log-sensor_${deviceLabel}${paramPart}_${from}_${to}.${format}`;
}

function unduh(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  // Revoke langsung pernah membatalkan unduhan di Safari. Tunda satu tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(csv: string, filename: string): void {
  unduh(new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * XLSX lewat write-excel-file v4 (import dinamis, lihat catatan di kepala berkas).
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
  amonia: PetaAmonia,
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
      // Excel tidak membacanya sebagai 0, pembacaan sensor yang hilang
      // bukan pembacaan bernilai nol.
      cell: (r: SensorReading) => ({ value: r[p] ?? undefined, type: Number }),
    })),
    {
      header: header("amonia_nh3_persen"),
      cell: (r: SensorReading) => ({
        value: cariAmonia(amonia, r.device_id, r.time)?.fraction_nh3_pct ?? undefined,
        type: Number,
      }),
      width: 18,
    },
    {
      header: header("amonia_risiko"),
      cell: (r: SensorReading) => ({
        value: cariAmonia(amonia, r.device_id, r.time)?.risk_level ?? undefined,
        type: String,
      }),
      width: 14,
    },
  ];

  await writeXlsxFile(rows, { columns }).toFile(filename);
}

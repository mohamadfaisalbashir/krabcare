// Ekspor data mentah sensor ke CSV & XLSX. Seluruhnya di klien: backend tidak
// punya endpoint ekspor, dan /readings dibatasi 1000 baris per permintaan.
//
// Tidak ada import runtime di kepala berkas (hanya `import type`) supaya
// `node --test` bisa memuatnya tanpa me-resolve apa pun. write-excel-file
// karena itu di-import dinamis di dalam downloadXlsx.
import type { SensorReading } from "./types";
import type { ParamKey } from "./parameter";
import { formatWaktuDetik } from "./tanggal.ts";

/** RFC 4180 + default pandas. Ganti ";" kalau Excel-ID jadi konsumen utama. */
export const CSV_SEP = ",";
/**
 * BOM UTF-8 di depan berkas CSV. Tanpa ini Excel membacanya sebagai ANSI dan
 * huruf beraksen jadi mojibake. Padanan pandas: encoding="utf-8-sig".
 * Ditulis sebagai escape \uFEFF supaya terlihat di kode sumber.
 */
export const CSV_BOM = "\uFEFF";

/** Batas keras backend, backend/app/routers/readings.py:22 (le=1000). */
const CHUNK = 1000;
/** 20 x 1000 = 20.000 baris per sensor, kira-kira 200 hari pada interval 15 menit. */
export const MAX_PAGES = 20;

/**
 * `<input type="date">` memberi "2026-09-01". Tanpa akhiran T00:00:00 itu
 * dibaca sebagai tengah malam UTC, selisih 7 jam dari WIB di kedua ujung
 * rentang. Pengguna memilih tanggal menurut jamnya sendiri.
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
 * Ambil semua reading satu device dalam rentang waktu, menembus batas 1000.
 *
 * /readings tidak punya offset atau cursor, cuma filter `end_time`, jadi paging
 * jalan mundur: tiap putaran minta 1000 baris terbaru yang <= cursor, lalu
 * cursor digeser ke baris tertua yang didapat.
 *
 * Harus per device: PK sensor_readings (device_id, time) bikin `time` unik
 * hanya di dalam satu device, dan itu yang menjamin duplikat di batas halaman
 * selalu tepat satu baris di posisi pertama.
 *
 * Hasilnya dibalik di sini supaya berkas ekspor selalu mulai dari data terlama.
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

    // end_time inklusif (<=), jadi baris pertama halaman ini sama dengan baris
    // terakhir halaman sebelumnya. Buang tepat satu.
    rows.push(...(rows.length && page[0]?.time === cursor ? page.slice(1) : page));

    // Halaman tidak penuh berarti jendela waktunya habis. Sudah mencakup halaman
    // kosong dan halaman yang isinya cuma duplikat.
    if (page.length < CHUNK) return { rows: rows.reverse(), truncated: false };

    // Verbatim, jangan lewat Date: `time` presisi mikrodetik, toISOString()
    // memotongnya ke milidetik dan baris di celah itu hilang.
    cursor = page[page.length - 1].time;
  }

  return { rows: rows.reverse(), truncated: true };
}

/** Bungkus sel yang mengandung pemisah, kutip, atau newline (nama kolam itu teks bebas). */
function cell(s: string): string {
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Latensi gateway->backend: selisih `time` (jam device) dan `received_at`
 * (jam backend) dalam detik. Jangan dijepit ke 0; nilai negatif berarti jam
 * Raspberry Pi lebih cepat dari jam server dan itu perlu terlihat.
 */
export function latensiDetik(r: SensorReading): number {
  return (new Date(r.received_at).getTime() - new Date(r.time).getTime()) / 1000;
}

/**
 * Toleransi pencocokan reading sensor <-> baris amonia, dalam milidetik.
 *
 * Keduanya dihitung dari pembacaan yang sama (raspi/edge_pipeline.py), tapi
 * dikirim lewat dua request terpisah, jadi `time` di ammonia_risks tidak
 * selalu identik dengan `time` di sensor_readings. Cocokkan yang terdekat,
 * bukan yang sama persis.
 *
 * 30 detik: interval antar-reading biasanya 60 detik ke atas, jadi tidak akan
 * salah pasang ke reading tetangga.
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
 * Amonia device tertentu yang waktunya paling dekat dengan `time`, kalau ada
 * yang jatuh dalam TOLERANSI_AMONIA_MS. Binary search; array per-device sudah
 * terurut naik, jadi kandidatnya cuma titik potong atau satu langkah sebelumnya.
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

/** Kolom parameter dinamai seperti field backend supaya langsung cocok di pandas. */
export function toCsv(
  rows: SensorReading[],
  params: ParamKey[],
  kolamByDevice: Record<number, string>,
  // Wajib, bukan opsional. Pemanggil yang lupa menghasilkan dua kolom amonia
  // kosong, yang terbaca seperti "tidak ada data" alih-alih bug.
  amonia: PetaAmonia
): string {
  const lines = [headerFor(params).join(CSV_SEP)];

  for (const r of rows) {
    const values = params.map((p) => {
      const v = r[p];
      // Nilai mentah, bukan formatValue: CSV membawa presisi penuh.
      // null jadi sel kosong (dibaca pandas sebagai NaN).
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
  // Segmen parameter dilewat kalau ketiganya ikut, namanya sudah panjang.
  // Daftar kosong berarti "Amonia saja"; tanpa cabang itu namanya berakhir
  // dengan garis bawah ganda.
  const paramPart =
    params.length === 0 ? "_amonia" : params.length === 3 ? "" : `_${params.join("-")}`;
  return `log-sensor_${deviceLabel}${paramPart}_${from}_${to}.${format}`;
}

function unduh(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  // Revoke langsung membatalkan unduhan di Safari. Tunda satu tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(csv: string, filename: string): void {
  unduh(new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * XLSX lewat write-excel-file v4 (import dinamis, lihat kepala berkas).
 *
 * Subpath `/browser` wajib: paketnya tidak punya export root ".", cuma
 * "./browser", "./node", "./universal".
 *
 * Kedua kolom waktu ditulis sebagai `Date`, bukan teks, supaya di Excel tetap
 * terurut dan terfilter sebagai tanggal.
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
      // undefined, bukan null: sel harus benar-benar kosong supaya Excel tidak
      // membacanya sebagai 0.
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

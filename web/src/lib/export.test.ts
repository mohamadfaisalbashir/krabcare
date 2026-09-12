// Uji lib/export.ts + lib/tanggal.ts lewat `node --test`. Keduanya bebas
// import runtime, jadi tidak butuh bundler, DOM, atau backend hidup.
// downloadCsv/downloadXlsx tidak diuji: keduanya butuh DOM.
import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchAllReadings,
  toCsv,
  headerFor,
  latensiDetik,
  namaBerkas,
  petaAmoniaDari,
  TOLERANSI_AMONIA_MS,
} from "./export.ts";
import { formatTanggal, formatWaktu, formatWaktuDetik } from "./tanggal.ts";
import type { SensorReading } from "./types.ts";

const CHUNK = 1000;

/** Baris palsu. `time` naik seiring index, received_at default +2 detik. */
function baris(i: number, latensiDtk = 2): SensorReading {
  const t = new Date(Date.UTC(2026, 8, 9, 0, 0, 0) + i * 60_000);
  return {
    device_id: 1,
    device_code: "AAA",
    time: t.toISOString(),
    received_at: new Date(t.getTime() + latensiDtk * 1000).toISOString(),
    ph: 7.5,
    temperature_c: 29,
    salinity_ppt: 20,
  };
}

/** Peta amonia berisi satu entri, untuk baris index `i`. */
function amoniaUntuk(i: number, pct: number | null, risk: string | null) {
  return petaAmoniaDari([
    { device_id: 1, time: baris(i).time, fraction_nh3_pct: pct, risk_level: risk },
  ]);
}

const TANPA_AMONIA = petaAmoniaDari([]);

test("fetchAllReadings mengembalikan baris TERLAMA dulu", async () => {
  // Server membalas terbaru dulu. Halaman 1 = index 1999..1000, halaman 2 =
  // index 1000..1, jadi index 1000 muncul dua kali di batas halaman.
  const halaman: SensorReading[][] = [
    Array.from({ length: CHUNK }, (_, k) => baris(1999 - k)),
    Array.from({ length: CHUNK }, (_, k) => baris(1000 - k)),
  ];
  let panggilan = 0;
  const getPage = async () => halaman[panggilan++] ?? [];

  const { rows, truncated } = await fetchAllReadings(getPage, 1, "", "");

  assert.equal(truncated, false, "dua halaman, halaman kedua tidak penuh setelah dedup");
  // 1000 + 1000 - 1 duplikat batas halaman.
  assert.equal(rows.length, 1999);
  // Inti pengujian: urutan kronologis naik, bukan turun.
  assert.equal(rows[0].time, baris(1).time);
  assert.equal(rows[rows.length - 1].time, baris(1999).time);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].time < rows[i].time, `baris ${i} tidak urut naik`);
  }
});

test("fetchAllReadings membuang tepat satu duplikat di batas halaman", async () => {
  const halaman: SensorReading[][] = [
    Array.from({ length: CHUNK }, (_, k) => baris(1999 - k)), // ..1000
    [baris(1000), baris(999)], // baris(1000) duplikat, halaman tidak penuh
  ];
  let panggilan = 0;
  const getPage = async () => halaman[panggilan++] ?? [];

  const { rows } = await fetchAllReadings(getPage, 1, "", "");
  assert.equal(rows.length, CHUNK + 1);
  const waktu = rows.map((r) => r.time);
  assert.equal(new Set(waktu).size, waktu.length, "tidak boleh ada waktu ganda");
});

test("toCsv: header dan latensi_detik", () => {
  const params = ["ph", "temperature_c", "salinity_ppt"] as const;
  const csv = toCsv([baris(0, 3)], [...params], { 1: "Kolam A" }, TANPA_AMONIA);
  const [header, baris1] = csv.split("\n");

  assert.equal(
    header,
    "waktu_lokal,waktu_diterima,latensi_detik,device_code,kolam," +
      "ph,temperature_c,salinity_ppt,amonia_nh3_persen,amonia_risiko"
  );
  assert.deepEqual(headerFor([...params]), header.split(","));

  const sel = baris1.split(",");
  assert.equal(sel[2], "3", "latensi 3 detik");
  assert.equal(sel[3], "AAA");
  assert.equal(sel[4], "Kolam A");
  // Nilai mentah, bukan hasil formatValue.
  assert.deepEqual(sel.slice(5, 8), ["7.5", "29", "20"]);
});

test("toCsv: nilai null jadi sel kosong, bukan '0' atau 'null'", () => {
  const r = { ...baris(0), ph: null };
  const csv = toCsv([r], ["ph"], {}, TANPA_AMONIA);
  assert.equal(csv.split("\n")[1].split(",")[5], "");
});

test("toCsv: nama kolam bertanda koma dibungkus kutip", () => {
  const csv = toCsv([baris(0)], ["ph"], { 1: 'Kolam A, Rak "1"' }, TANPA_AMONIA);
  assert.ok(csv.includes('"Kolam A, Rak ""1"""'));
});

test("toCsv: amonia terpasang ke baris sensor berwaktu sama", () => {
  const csv = toCsv([baris(0)], ["ph"], {}, amoniaUntuk(0, 3.7, "perhatian"));
  const sel = csv.split("\n")[1].split(",");
  // ...ph, amonia_nh3_persen, amonia_risiko
  assert.equal(sel[5], "7.5");
  assert.equal(sel[6], "3.7");
  assert.equal(sel[7], "perhatian");
});

test("toCsv: amonia yang mesetnya beberapa detik dari reading (dua request ingest terpisah) tetap terpasang", () => {
  // POST /ingest/readings dan POST /ingest/quality dua request terpisah, jadi
  // `time` di ammonia_risks tidak identik dengan yang di sensor_readings.
  const geser = (i: number, ms: number) => new Date(new Date(baris(i).time).getTime() + ms).toISOString();
  const peta = petaAmoniaDari([
    { device_id: 1, time: geser(0, 4000), fraction_nh3_pct: 2.4, risk_level: "normal" },
  ]);
  const sel = toCsv([baris(0)], ["ph"], {}, peta).split("\n")[1].split(",");
  assert.equal(sel[6], "2.4");
  assert.equal(sel[7], "normal");
});

test("toCsv: amonia yang meleset lebih jauh dari TOLERANSI_AMONIA_MS tidak dipasangkan", () => {
  const geser = (i: number, ms: number) => new Date(new Date(baris(i).time).getTime() + ms).toISOString();
  const peta = petaAmoniaDari([
    {
      device_id: 1,
      time: geser(0, TOLERANSI_AMONIA_MS + 1000),
      fraction_nh3_pct: 2.4,
      risk_level: "normal",
    },
  ]);
  const sel = toCsv([baris(0)], ["ph"], {}, peta).split("\n")[1].split(",");
  assert.equal(sel[6], "");
  assert.equal(sel[7], "");
});

test("toCsv: di antara beberapa kandidat, yang dipasangkan adalah yang PALING DEKAT waktunya", () => {
  const geser = (i: number, ms: number) => new Date(new Date(baris(i).time).getTime() + ms).toISOString();
  const peta = petaAmoniaDari([
    { device_id: 1, time: geser(0, -20_000), fraction_nh3_pct: 1.1, risk_level: "jauh-sebelum" },
    { device_id: 1, time: geser(0, 3_000), fraction_nh3_pct: 2.2, risk_level: "paling-dekat" },
    { device_id: 1, time: geser(0, 25_000), fraction_nh3_pct: 3.3, risk_level: "jauh-sesudah" },
  ]);
  const sel = toCsv([baris(0)], ["ph"], {}, peta).split("\n")[1].split(",");
  assert.equal(sel[6], "2.2");
  assert.equal(sel[7], "paling-dekat");
});

test("toCsv: baris tanpa pasangan amonia jadi sel KOSONG, bukan 0", () => {
  // Peta berisi amonia untuk baris(5), yang diekspor baris(0). Sel kosong
  // dibaca pandas sebagai NaN; "0" akan terbaca sebagai nol persen.
  const csv = toCsv([baris(0)], ["ph"], {}, amoniaUntuk(5, 3.7, "perhatian"));
  const sel = csv.split("\n")[1].split(",");
  assert.equal(sel[6], "");
  assert.equal(sel[7], "");
});

test("petaAmoniaDari: kunci memisahkan device, bukan cuma waktu", () => {
  // Dua device bisa punya pembacaan pada detik yang sama. Kalau kuncinya cuma
  // `time`, salah satunya menimpa yang lain.
  const peta = petaAmoniaDari([
    { device_id: 1, time: baris(0).time, fraction_nh3_pct: 1.1, risk_level: "normal" },
    { device_id: 2, time: baris(0).time, fraction_nh3_pct: 9.9, risk_level: "berbahaya" },
  ]);
  assert.equal(peta.size, 2);
  const r2 = { ...baris(0), device_id: 2, device_code: "BBB" };
  assert.equal(toCsv([r2], ["ph"], {}, peta).split("\n")[1].split(",")[6], "9.9");
});

test("latensiDetik boleh negatif kalau jam device lebih cepat dari server", () => {
  // Bukan dijepit ke 0: nilai negatif berarti jam Raspi perlu disinkronkan.
  assert.equal(latensiDetik(baris(0, -5)), -5);
});

test("namaBerkas memakai ekstensi sesuai format", () => {
  const p = ["ph"] as const;
  assert.ok(
    namaBerkas("semua", [...p], "2026-09-01", "2026-09-09", "csv").endsWith(
      "_ph_2026-09-01_2026-09-09.csv"
    )
  );
  assert.ok(namaBerkas("semua", [...p], "2026-09-01", "2026-09-09", "xlsx").endsWith(".xlsx"));
  // Ketiga parameter ikut, segmen parameter dibuang.
  const semua = namaBerkas("semua", ["ph", "temperature_c", "salinity_ppt"], "a", "b", "csv");
  assert.equal(semua, "log-sensor_semua_a_b.csv");
  // Daftar kosong = "Amonia saja". Tanpa cabang khusus namanya jadi
  // "log-sensor_semua__a_b.csv" dengan garis bawah ganda.
  assert.equal(namaBerkas("semua", [], "a", "b", "csv"), "log-sensor_semua_amonia_a_b.csv");
});

test("toCsv tanpa parameter sensor tetap membawa kolom amonia", () => {
  // Bentuk berkas saat pengguna memilih "Amonia saja".
  const csv = toCsv([baris(0)], [], {}, amoniaUntuk(0, 4.2, "perhatian"));
  const [header, isi] = csv.split("\n");
  assert.equal(
    header,
    "waktu_lokal,waktu_diterima,latensi_detik,device_code,kolam,amonia_nh3_persen,amonia_risiko"
  );
  const sel = isi.split(",");
  assert.equal(sel[5], "4.2");
  assert.equal(sel[6], "perhatian");
});

test("format tanggal dd-mm-yyyy, tanggal & bulan satu digit tetap dipad", () => {
  // Dibangun sebagai waktu lokal supaya uji ini tidak bergantung zona waktu
  // mesin yang menjalankannya.
  const lokal = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) =>
    new Date(y, m - 1, d, h, mi, s).toISOString();

  assert.equal(formatTanggal(lokal(2026, 9, 9)), "09-09-2026");
  assert.equal(formatTanggal(lokal(2026, 1, 5)), "05-01-2026");
  assert.equal(formatTanggal(lokal(2026, 12, 31)), "31-12-2026");
  assert.equal(formatWaktu(lokal(2026, 9, 9, 14, 32)), "09-09-2026 14:32");
  assert.equal(formatWaktu(lokal(2026, 3, 2, 4, 5)), "02-03-2026 04:05");
  assert.equal(formatWaktuDetik(lokal(2026, 9, 9, 14, 32, 7)), "09-09-2026 14:32:07");
});

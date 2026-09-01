// Jalankan: npm test
// Yang diuji: paging mundur menembus batas 1000, batas tanggal lokal vs UTC,
// dan escaping CSV — tiga tempat yang bisa salah tanpa terlihat di layar.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SensorReading } from "./types";
import {
  dayRangeToIso,
  fetchAllReadings,
  toCsv,
  csvFilename,
  MAX_PAGES,
} from "./export.ts";

/** Baris palsu berstempel waktu menurun 15 menit, presisi mikrodetik seperti backend. */
function makeRows(n: number): SensorReading[] {
  const base = Date.parse("2026-08-31T16:00:00Z");
  return Array.from({ length: n }, (_, i) => ({
    device_id: 1,
    device_code: "SLV1",
    time: new Date(base - i * 15 * 60_000).toISOString().replace("Z", "123+00:00"),
    ph: 7.5,
    temperature_c: 22,
    salinity_ppt: 25,
  }));
}

/** Meniru /readings: filter <= end_time, urut menurun, dipotong `limit`. */
function fakeApi(all: SensorReading[]) {
  let calls = 0;
  const getPage = async (p: { end_time: string; limit: number }) => {
    calls++;
    return all.filter((r) => r.time <= p.end_time).slice(0, p.limit);
  };
  return { getPage, calls: () => calls };
}

test("dayRangeToIso memakai tengah malam LOKAL, bukan UTC", () => {
  const { start, end } = dayRangeToIso("2026-09-01", "2026-09-01");
  // Kalau salah pakai new Date("2026-09-01"), start akan jadi tepat tengah
  // malam UTC. Di mesin ber-offset, jamnya lokal harus 0.
  assert.equal(new Date(start).getHours(), 0);
  assert.equal(new Date(start).getMinutes(), 0);
  assert.equal(new Date(end).getHours(), 23);
  assert.equal(new Date(end).getMinutes(), 59);
});

test("fetchAllReadings menembus batas 1000 tanpa duplikat maupun baris hilang", async () => {
  const all = makeRows(2001);
  const { getPage, calls } = fakeApi(all);

  const { rows, truncated } = await fetchAllReadings(getPage, 1, "1970-01-01T00:00:00Z", all[0].time);

  assert.equal(rows.length, 2001, "semua baris terambil");
  // Inilah assertion yang gagal kalau pembuangan duplikat di batas halaman rusak.
  assert.equal(new Set(rows.map((r) => r.time)).size, 2001, "tidak ada duplikat");
  assert.equal(truncated, false);
  assert.equal(calls(), 3, "1000 + 1000 + sisa");
});

test("fetchAllReadings berhenti di MAX_PAGES dan menandai terpotong", async () => {
  const all = makeRows(MAX_PAGES * 1000 + 500);
  const { getPage, calls } = fakeApi(all);

  const { truncated } = await fetchAllReadings(getPage, 1, "1970-01-01T00:00:00Z", all[0].time);

  assert.equal(truncated, true);
  assert.equal(calls(), MAX_PAGES);
});

test("fetchAllReadings menangani rentang kosong", async () => {
  const { getPage, calls } = fakeApi([]);
  const { rows, truncated } = await fetchAllReadings(getPage, 1, "a", "b");
  assert.deepEqual(rows, []);
  assert.equal(truncated, false);
  assert.equal(calls(), 1);
});

test("toCsv: nama kolam bermuatan koma dan kutip ter-escape", () => {
  const rows = makeRows(1);
  const csv = toCsv(rows, ["ph"], { 1: 'Kolam A, Blok "2"' });
  const [header, line] = csv.split("\n");

  assert.equal(header, "waktu_lokal,device_code,kolam,ph");
  // Koma di dalam sel tidak boleh menggeser kolom -> harus dibungkus kutip,
  // dan kutip di dalamnya digandakan (RFC 4180).
  assert.ok(line.includes('"Kolam A, Blok ""2"""'), line);
  assert.equal(line.split(",").length > 4, true);
});

test("toCsv: null jadi sel kosong, urutan kolom mengikuti params", () => {
  const rows = makeRows(1);
  rows[0].ph = null;
  const csv = toCsv(rows, ["salinity_ppt", "ph"], { 1: "rak 1" });
  const line = csv.split("\n")[1];
  const cells = line.split(",");

  assert.match(cells[0], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/); // waktu_lokal
  assert.equal(cells[1], "SLV1");
  assert.equal(cells[2], "rak 1");
  assert.equal(cells[3], "25"); // salinity_ppt duluan, sesuai params
  assert.equal(cells[4], ""); // ph null
});

test("csvFilename menghilangkan segmen parameter kalau ketiganya ikut", () => {
  assert.equal(
    csvFilename("SLV1", ["ph"], "2026-08-26", "2026-09-01"),
    "log-sensor_SLV1_ph_2026-08-26_2026-09-01.csv"
  );
  assert.equal(
    csvFilename("semua", ["ph", "temperature_c", "salinity_ppt"], "2026-08-26", "2026-09-01"),
    "log-sensor_semua_2026-08-26_2026-09-01.csv"
  );
});

// Uji statusKolam (parameter.ts) dan statusKoneksi (tanggal.ts) lewat `node --test`.
import test from "node:test";
import assert from "node:assert/strict";

import { amoniaError, lantai5Menit, nilaiError, statusKolam } from "./parameter.ts";
import { statusKoneksi } from "./tanggal.ts";

test("statusKolam memakai status terburuk", () => {
  const aman = { ph: 8, temperature_c: 29, salinity_ppt: 20 };
  assert.equal(statusKolam(aman, "Aman"), "Aman");
  // Kasus di layar HP: semua parameter Aman tapi amonia Waspada.
  assert.equal(statusKolam(aman, "Waspada"), "Waspada");
  assert.equal(statusKolam({ ...aman, ph: 13.97 }, "Waspada"), "Bahaya");
  assert.equal(statusKolam({ ph: null, temperature_c: 25, salinity_ppt: null }, null), "Waspada");
  assert.equal(statusKolam(null, null), null);
});

test("statusKoneksi: restarting sampai bacaan berikutnya masuk", () => {
  const now = Date.parse("2026-11-18T10:05:00Z");
  const restart = "2026-11-18T10:04:00Z";
  assert.equal(statusKoneksi("2026-11-18T10:03:30Z", restart, now), "restarting");
  assert.equal(statusKoneksi("2026-11-18T10:04:30Z", restart, now), "online");
  assert.equal(statusKoneksi(null, restart, now), "restarting");
  // Restart sudah lewat batas tanpa bacaan baru: kembali ke offline biasa.
  assert.equal(statusKoneksi("2026-11-18T09:00:00Z", "2026-11-18T09:58:00Z", now), "offline");
  assert.equal(statusKoneksi("2026-11-18T10:04:30Z", null, now), "online");
});

test("sensor error: parameter dilewati, amonia ikut error", () => {
  const bacaan = { ph: 13.97, temperature_c: 29, salinity_ppt: 20 };
  // pH 13.97 dari sensor yang ditandai error tidak membuat kolam Bahaya.
  assert.equal(statusKolam(bacaan, "Aman", { ph: "kosong" }), "Aman");
  // Key pH hilang dari JSON ESP: pH error, amonia (nilai lama) diabaikan.
  const tanpaPh = { ph: null, temperature_c: 29, salinity_ppt: 20 };
  assert.equal(nilaiError(tanpaPh, {}, "ph"), true);
  assert.equal(amoniaError(tanpaPh, {}), true);
  assert.equal(statusKolam(tanpaPh, "Bahaya", {}), "Aman");
  // Belum ada bacaan sama sekali bukan error.
  assert.equal(nilaiError(null, {}, "ph"), false);
});

test("lantai5Menit membulatkan ke bawah", () => {
  assert.equal(lantai5Menit("2026-11-18T09:07:42Z"), "2026-11-18T09:05:00.000Z");
  assert.equal(lantai5Menit("2026-11-18T09:10:00Z"), "2026-11-18T09:10:00.000Z");
});

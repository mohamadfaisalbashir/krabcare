// Jalankan: npm test
// Yang diuji cuma batas-batasnya — di situ logikanya bisa salah tanpa ketahuan.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusOf,
  formatValue,
  rangePercent,
  optimalBand,
  RANGE,
  PARAM_KEYS,
} from "./parameter.ts";

test("statusOf pH: di luar toleransi = Bahaya", () => {
  assert.equal(statusOf("ph", 6.4), "Bahaya");
  assert.equal(statusOf("ph", 9.1), "Bahaya");
});

test("statusOf pH: dalam toleransi tapi di luar optimal = Waspada", () => {
  assert.equal(statusOf("ph", 6.5), "Waspada"); // tepat di batas min
  assert.equal(statusOf("ph", 9.0), "Waspada"); // tepat di batas max
  assert.equal(statusOf("ph", 7.4), "Waspada");
});

test("statusOf pH: di dalam optimal = Aman, termasuk tepat di batasnya", () => {
  assert.equal(statusOf("ph", 7.5), "Aman");
  assert.equal(statusOf("ph", 8.5), "Aman");
  assert.equal(statusOf("ph", 8.0), "Aman");
});

test("statusOf suhu memakai ambangnya sendiri, bukan ambang pH", () => {
  assert.equal(statusOf("temperature_c", 29), "Aman");
  assert.equal(statusOf("temperature_c", 25), "Waspada");
  assert.equal(statusOf("temperature_c", 36), "Bahaya");
});

test("setiap parameter punya optimal di dalam toleransi", () => {
  for (const [param, r] of Object.entries(RANGE)) {
    assert.ok(r.min <= r.optimal[0], `${param}: optimal[0] di bawah min`);
    assert.ok(r.optimal[1] <= r.max, `${param}: optimal[1] di atas max`);
  }
});

test("formatValue memangkas nol di belakang, maksimal 1 desimal", () => {
  assert.equal(formatValue(8.75), "8.8"); // dibulatkan, bukan dipotong
  assert.equal(formatValue(7.63), "7.6");
  assert.equal(formatValue(7.7), "7.7");
  assert.equal(formatValue(25.0), "25"); // nol di belakang tetap dibuang
  assert.equal(formatValue(7.006), "7");
});

test("rangePercent memetakan toleransi ke 0-100 dan menjepit di luar itu", () => {
  assert.equal(rangePercent("ph", 6.5), 0); // tepat di min
  assert.equal(rangePercent("ph", 9.0), 100); // tepat di max
  assert.equal(rangePercent("ph", 7.75), 50); // tepat di tengah
  assert.equal(rangePercent("ph", 5), 0); // di bawah toleransi -> dijepit
  assert.equal(rangePercent("ph", 14), 100); // di atas toleransi -> dijepit
});

test("optimalBand sejajar dengan rangePercent, bukan skala sendiri", () => {
  for (const param of PARAM_KEYS) {
    const [start, width] = optimalBand(param);
    const [lo, hi] = RANGE[param].optimal;
    assert.equal(start, rangePercent(param, lo));
    assert.equal(start + width, rangePercent(param, hi));
    assert.ok(width > 0, `${param}: pita optimal tidak boleh selebar nol`);
    assert.ok(start + width <= 100, `${param}: pita optimal keluar dari track`);
  }
});

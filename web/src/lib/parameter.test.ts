// Jalankan: npm test
// Yang diuji cuma batas-batasnya — di situ logikanya bisa salah tanpa ketahuan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusOf, formatValue, RANGE } from "./parameter.ts";

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

test("formatValue memangkas nol di belakang, maksimal 2 desimal", () => {
  assert.equal(formatValue(8.75), "8.75");
  assert.equal(formatValue(7.7), "7.7");
  assert.equal(formatValue(25.0), "25");
  assert.equal(formatValue(7.006), "7.01");
});

// Data contoh untuk pengembangan tampilan sebelum backend tersambung penuh.
// Hapus/ganti dengan pemanggilan `api` (src/lib/api.ts) saat integrasi.
import type {
  Kolam,
  Device,
  SensorReading,
  LatestQuality,
  Notification,
  KolamDashboard,
  User,
} from "./types";

// ── User ────────────────────────────────────────────────────────────

export const mockUser: User = {
  id: 1,
  email: "erik@supermarketkepiting.id",
  nama: "Erik Charles",
  role: "operator",
  created_at: new Date().toISOString(),
};

// ── Kolam ───────────────────────────────────────────────────────────

export const mockKolam: Kolam[] = [
  { id: 1, nama: "Kolam A - Rak 1", lokasi: "Surabaya", is_active: true, created_at: new Date().toISOString() },
  { id: 2, nama: "Kolam B - Rak 2", lokasi: "Surabaya", is_active: true, created_at: new Date().toISOString() },
  { id: 3, nama: "Kolam C - Rak 3", lokasi: "Surabaya", is_active: true, created_at: new Date().toISOString() },
  { id: 4, nama: "Kolam D - Rak 4", lokasi: "Surabaya", is_active: true, created_at: new Date().toISOString() },
];

// ── Device (satu slave per kolam untuk mock sederhana) ───────────────

const mockDeviceMap: Record<number, Device[]> = {
  1: [{ id: 1, device_code: "SLV1", device_type: "slave_node", level_number: 1, rack_label: "A1", parent_device_id: null, is_active: true, last_seen_at: new Date().toISOString() }],
  2: [{ id: 2, device_code: "SLV2", device_type: "slave_node", level_number: 2, rack_label: "B1", parent_device_id: null, is_active: true, last_seen_at: new Date().toISOString() }],
  3: [{ id: 3, device_code: "SLV3", device_type: "slave_node", level_number: 3, rack_label: "C1", parent_device_id: null, is_active: true, last_seen_at: new Date().toISOString() }],
  4: [{ id: 4, device_code: "SLV1", device_type: "slave_node", level_number: 1, rack_label: "D1", parent_device_id: null, is_active: true, last_seen_at: new Date().toISOString() }],
};

// ── Latest Quality per device ────────────────────────────────────────

const mockQuality: LatestQuality[] = [
  {
    device_id: 1, device_code: "SLV1",
    classification: { time: new Date().toISOString(), quality_score: 82, quality_category: "baik", membership_degrees: null, model_version: "v1" },
    prediction: { time: new Date().toISOString(), target_time: new Date(Date.now() + 3600000).toISOString(), horizon_minutes: 60, predicted_quality_score: 78, predicted_category: "baik", model_version: "v1" },
  },
  {
    device_id: 2, device_code: "SLV2",
    classification: { time: new Date().toISOString(), quality_score: 55, quality_category: "sedang", membership_degrees: null, model_version: "v1" },
    prediction: { time: new Date().toISOString(), target_time: new Date(Date.now() + 3600000).toISOString(), horizon_minutes: 60, predicted_quality_score: 48, predicted_category: "sedang", model_version: "v1" },
  },
  {
    device_id: 3, device_code: "SLV3",
    classification: { time: new Date().toISOString(), quality_score: 22, quality_category: "buruk", membership_degrees: null, model_version: "v1" },
    prediction: { time: new Date().toISOString(), target_time: new Date(Date.now() + 3600000).toISOString(), horizon_minutes: 60, predicted_quality_score: 18, predicted_category: "buruk", model_version: "v1" },
  },
  {
    device_id: 4, device_code: "SLV1",
    classification: { time: new Date().toISOString(), quality_score: 85, quality_category: "baik", membership_degrees: null, model_version: "v1" },
    prediction: null,
  },
];

// ── Latest Reading per device ────────────────────────────────────────

const mockLatestReadings: SensorReading[] = [
  { device_id: 1, device_code: "SLV1", time: new Date().toISOString(), ph: 7.9, temperature_c: 28.6, salinity_ppt: 24.1 },
  { device_id: 2, device_code: "SLV2", time: new Date().toISOString(), ph: 7.1, temperature_c: 29.4, salinity_ppt: 19.8 },
  { device_id: 3, device_code: "SLV3", time: new Date().toISOString(), ph: 6.6, temperature_c: 32.8, salinity_ppt: 33.5 },
  { device_id: 4, device_code: "SLV1", time: new Date().toISOString(), ph: 8.1, temperature_c: 29.0, salinity_ppt: 25.4 },
];

// ── Komposit dashboard ──────────────────────────────────────────────

export const mockDashboard: KolamDashboard[] = mockKolam.map((kolam, i) => ({
  kolam,
  devices: mockDeviceMap[kolam.id] ?? [],
  quality: mockQuality[i] ?? null,
  latestReading: mockLatestReadings[i] ?? null,
}));

// ── Histori reading (generator) ─────────────────────────────────────

export function mockHistoryReadings(deviceId: number): SensorReading[] {
  const base = mockLatestReadings.find((r) => r.device_id === deviceId) ?? mockLatestReadings[0];
  return Array.from({ length: 12 }).map((_, i) => {
    const t = new Date(Date.now() - (11 - i) * 60 * 60 * 1000);
    return {
      device_id: base.device_id,
      device_code: base.device_code,
      time: t.toISOString(),
      ph: +((base.ph ?? 7.5) + Math.sin(i / 2) * 0.3).toFixed(2),
      temperature_c: +((base.temperature_c ?? 29) + Math.cos(i / 3) * 0.8).toFixed(1),
      salinity_ppt: +((base.salinity_ppt ?? 25) + Math.sin(i / 4) * 1.5).toFixed(1),
    };
  });
}

// ── Notifikasi ──────────────────────────────────────────────────────

export const mockNotifications: Notification[] = [
  {
    id: 1,
    device_id: 3,
    device_code: "SLV3",
    kolam_id: 3,
    source: "classification",
    quality_category: "buruk",
    event_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    message: "Suhu air terdeteksi 32.8°C, melebihi ambang aman. Segera periksa aerasi dan naungan kolam.",
    is_read: false,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    device_id: 2,
    device_code: "SLV2",
    kolam_id: 2,
    source: "prediction",
    quality_category: "sedang",
    event_time: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    message: "Prediksi 1 jam ke depan: pH berpotensi turun ke 6.9. Disarankan menyiapkan penyangga pH.",
    is_read: false,
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    device_id: 1,
    device_code: "SLV1",
    kolam_id: 1,
    source: "classification",
    quality_category: "baik",
    event_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    message: "Kondisi air telah kembali baik setelah sebelumnya kategori sedang.",
    is_read: true,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];

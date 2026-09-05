// Tipe data diselaraskan dengan Pydantic schema di backend/app/schemas/
// Lihat AUDIT_REPORT.md untuk detail mapping field yang sudah diperbaiki.

// ── Enum & Mapping ──────────────────────────────────────────────────

/** Kategori kualitas air dari backend (models/enums.py → WaterQualityCategory). */
export type WaterQualityCategory = "baik" | "sedang" | "buruk";

/** Label tampilan UI untuk status kualitas air (FR-08 CD GAB). */
export type StatusLabel = "Aman" | "Waspada" | "Bahaya";

export type UserRole = "admin" | "operator";

const CATEGORY_TO_LABEL: Record<WaterQualityCategory, StatusLabel> = {
  baik: "Aman",
  sedang: "Waspada",
  buruk: "Bahaya",
};

/** Konversi enum backend → label tampilan UI. */
export function categoryToLabel(cat: WaterQualityCategory): StatusLabel {
  return CATEGORY_TO_LABEL[cat] ?? "Waspada";
}

// ── Auth (schemas/user.py) ──────────────────────────────────────────

/** TokenOut */
export interface TokenOut {
  access_token: string;
  token_type: string;
}

/** UserOut */
export interface User {
  id: number;
  email: string;
  nama: string;
  role: UserRole;
  created_at: string;
}

// ── Kolam (schemas/kolam.py) ────────────────────────────────────────

/** KolamOut */
export interface Kolam {
  id: number;
  nama: string;
  is_active: boolean;
  created_at: string;
}

// ── Device (schemas/device.py) ──────────────────────────────────────

/** DeviceOut */
export interface Device {
  id: number;
  device_code: string;
  device_type: "slave_node" | "master_node" | "gateway";
  rack_label: string | null;
  parent_device_id: number | null;
  is_active: boolean;
  last_seen_at: string | null;
}

/** DeviceAdminOut — Device + status klaim, dipakai halaman admin /perangkat. */
export interface DeviceAdmin extends Device {
  kolam_id: number | null;
  kolam_nama: string | null;
  owner_nama?: string | null;
}

/** TargetKolamOut — Kolam tujuan untuk pemasangan device oleh admin. */
export interface TargetKolam {
  id: number;
  nama: string;
  owner_name: string;
  owner_email: string;
  current_device_id: number | null;
  current_device_code: string | null;
}

/** Payload POST /devices (schemas/device.py DeviceCreateIn) — form tambah device admin. */
export interface DeviceCreateIn {
  device_code: string;
  device_type: Device["device_type"];
  rack_label?: string | null;
  parent_device_id?: number | null;
}

// ── Sensor Reading (schemas/sensor_reading.py) ──────────────────────

/** SensorReadingOut */
export interface SensorReading {
  device_id: number;
  device_code: string;
  time: string;
  ph: number | null;
  temperature_c: number | null;
  salinity_ppt: number | null;
}

// ── Quality / Fuzzy (schemas/fuzzy.py) ──────────────────────────────

/** FuzzyClassificationOut */
export interface FuzzyClassification {
  time: string;
  quality_score: number;
  quality_category: WaterQualityCategory;
  membership_degrees: Record<string, unknown> | null;
  model_version: string;
}

/** FuzzyPredictionOut */
export interface FuzzyPrediction {
  time: string;
  target_time: string;
  horizon_minutes: number;
  predicted_quality_score: number | null;
  predicted_category: WaterQualityCategory | null;
  /** Ramalan per parameter — null untuk baris sebelum migrasi 027f8214c47a. */
  predicted_ph: number | null;
  predicted_temperature_c: number | null;
  predicted_salinity_ppt: number | null;
  model_version: string;
}

/** LatestQualityOut */
export interface LatestQuality {
  device_id: number;
  device_code: string | null;
  classification: FuzzyClassification | null;
  prediction: FuzzyPrediction | null;
}

/** DevicePredictionsOut */
export interface DevicePredictions {
  device_id: number;
  device_code: string | null;
  predictions: FuzzyPrediction[];
}

// ── Amonia (schemas/ammonia.py) ─────────────────────────────────────

/** AmmoniaRiskOut — FRAKSI NH3 (% dari TAN), BUKAN konsentrasi mg/L. */
export interface AmmoniaRisk {
  time: string;
  target_time: string;
  /** 0 = kondisi terukur dari sensor; >0 = ramalan FTS sekian menit ke depan. */
  horizon_minutes: number;
  fraction_nh3_pct: number | null;
  risk_level: string | null;
  /** false = pH/suhu/salinitas di luar rentang tervalidasi persamaan. */
  in_valid_range: boolean;
  input_ph: number | null;
  input_temperature_c: number | null;
  input_salinity_ppt: number | null;
  model_version: string;
}

/** AmmoniaRiskLogOut — satu baris log historis. */
export interface AmmoniaRiskLog extends AmmoniaRisk {
  device_id: number;
  device_code: string | null;
}

/** DeviceAmmoniaOut */
export interface DeviceAmmonia {
  device_id: number;
  device_code: string | null;
  current: AmmoniaRisk | null;
  forecast: AmmoniaRisk[];
  disclaimer: string;
}

// ── Notification (schemas/notification.py) ──────────────────────────

/** NotificationOut */
export interface Notification {
  id: number;
  device_id: number;
  device_code: string | null;
  kolam_id: number;
  source: string; // "classification" | "prediction" | "parameter"
  parameter?: string | null; // "ph" | "temperature_c" | "salinity_ppt" | "ammonia" | null
  quality_category: string; // WaterQualityCategory value
  event_time: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ── Tipe komposit khusus frontend ───────────────────────────────────

/** Satu sensor terpasang beserta kolam yang mengklaimnya — dipakai Log Historis. */
export interface Sensor {
  deviceId: number;
  deviceCode: string;
  kolamNama: string;
}

/** Gabungan data kolam + device + kualitas + reading terbaru, untuk dashboard. */
export interface KolamDashboard {
  kolam: Kolam;
  devices: Device[];
  quality: LatestQuality | null;
  latestReading: SensorReading | null;
  /** Risiko amonia terkini (horizon 0) device pertama kolam ini, untuk ikon+nilai di PondCard. */
  ammonia: AmmoniaRisk | null;
}

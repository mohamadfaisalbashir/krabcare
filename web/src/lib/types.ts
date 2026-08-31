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

const LABEL_TO_CATEGORY: Record<StatusLabel, WaterQualityCategory> = {
  Aman: "baik",
  Waspada: "sedang",
  Bahaya: "buruk",
};

/** Konversi enum backend → label tampilan UI. */
export function categoryToLabel(cat: WaterQualityCategory): StatusLabel {
  return CATEGORY_TO_LABEL[cat] ?? "Waspada";
}

/** Konversi label UI → enum backend (untuk filter/request). */
export function labelToCategory(label: StatusLabel): WaterQualityCategory {
  return LABEL_TO_CATEGORY[label] ?? "sedang";
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
  lokasi: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Device (schemas/device.py) ──────────────────────────────────────

/** DeviceOut */
export interface Device {
  id: number;
  device_code: string;
  device_type: "slave_node" | "master_node" | "gateway";
  level_number: number | null;
  rack_label: string | null;
  parent_device_id: number | null;
  is_active: boolean;
  last_seen_at: string | null;
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

// ── Notification (schemas/notification.py) ──────────────────────────

/** NotificationOut */
export interface Notification {
  id: number;
  device_id: number;
  device_code: string | null;
  kolam_id: number;
  source: string; // "classification" | "prediction"
  quality_category: string; // WaterQualityCategory value
  event_time: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ── Tipe komposit khusus frontend ───────────────────────────────────

/** Gabungan data kolam + device + kualitas + reading terbaru, untuk dashboard. */
export interface KolamDashboard {
  kolam: Kolam;
  devices: Device[];
  quality: LatestQuality | null;
  latestReading: SensorReading | null;
}

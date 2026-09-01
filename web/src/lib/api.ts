// Lapisan pemanggilan RESTful API ke backend FastAPI.
// Backend berada di monorepo yang sama: ../backend/ (FastAPI).
//
// Semua path sudah diselaraskan dengan route di backend/app/routers/*.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("access_token");
}

/** Buang token lalu lempar ke halaman login. Dipakai tombol keluar & handler 401. */
export function logout(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("access_token");
  window.location.href = "/login";
}

/**
 * Konfirmasi sebelum keluar akun, lalu buang token.
 *
 * Pakai window.confirm bawaan browser — dialog modal sendiri butuh state,
 * focus trap, dan penanganan Escape untuk hasil yang sama.
 */
export function confirmLogout(): void {
  if (window.confirm("Keluar dari akun ini? Anda perlu masuk lagi untuk membuka dashboard.")) {
    logout();
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    logout();
    throw new Error("Sesi berakhir, silakan login kembali.");
  }

  if (!res.ok) {
    // Backend FastAPI mengirim error di field `detail`, bukan `message`.
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Permintaan gagal (${res.status})`);
  }

  // Beberapa endpoint (mis. change-password) return 204 tanpa body.
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // ── Auth (routers/auth.py) ────────────────────────────────────────

  /** POST /auth/login → TokenOut */
  login: (email: string, password: string) =>
    request<import("./types").TokenOut>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  /** POST /auth/register → UserOut */
  register: (email: string, password: string, nama: string) =>
    request<import("./types").User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, nama }),
    }),

  /** GET /auth/me → UserOut */
  getMe: () => request<import("./types").User>("/auth/me"),

  /** PUT /auth/me → UserOut */
  updateProfile: (nama: string) =>
    request<import("./types").User>("/auth/me", {
      method: "PUT",
      body: JSON.stringify({ nama }),
    }),

  /** POST /auth/me/change-password → 204 */
  changePassword: (old_password: string, new_password: string) =>
    request<void>("/auth/me/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),

  /** POST /auth/forgot-password → {detail} */
  forgotPassword: (email: string) =>
    request<{ detail: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** POST /auth/reset-password → 204 */
  resetPassword: (token: string, new_password: string) =>
    request<void>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    }),

  // ── Kolam (routers/kolam.py) ──────────────────────────────────────

  /** POST /kolam → KolamOut */
  createKolam: (nama: string, lokasi?: string) =>
    request<import("./types").Kolam>("/kolam", {
      method: "POST",
      body: JSON.stringify({ nama, lokasi: lokasi || null }),
    }),

  /** PUT /kolam/:id → KolamOut. Backend menimpa nama DAN lokasi (bukan partial),
   *  jadi kirim keduanya walau yang diubah cuma namanya. */
  updateKolam: (kolamId: number, nama: string, lokasi?: string) =>
    request<import("./types").Kolam>(`/kolam/${kolamId}`, {
      method: "PUT",
      body: JSON.stringify({ nama, lokasi: lokasi || null }),
    }),

  /** DELETE /kolam/:id → 204. PERMANEN.
   *  Device-nya tidak ikut terhapus (FK SET NULL) — ia cuma jadi tak terklaim,
   *  beserta seluruh riwayat sensornya. Notifikasi kolam ini ikut hilang (CASCADE). */
  deleteKolam: (kolamId: number) =>
    request<void>(`/kolam/${kolamId}`, { method: "DELETE" }),

  /** POST /kolam/:id/devices/:code → 204 (klaim device ke kolam) */
  claimDevice: (kolamId: number, deviceCode: string) =>
    request<void>(`/kolam/${kolamId}/devices/${deviceCode}`, {
      method: "POST",
    }),

  /** GET /kolam → KolamOut[] */
  listKolam: () => request<import("./types").Kolam[]>("/kolam"),

  /** GET /kolam/:id → KolamOut */
  getKolam: (kolamId: number) =>
    request<import("./types").Kolam>(`/kolam/${kolamId}`),

  /** GET /kolam/:id/devices → DeviceOut[] */
  getKolamDevices: (kolamId: number) =>
    request<import("./types").Device[]>(`/kolam/${kolamId}/devices`),

  // ── Readings (routers/readings.py) ────────────────────────────────

  /** GET /readings → SensorReadingOut[] */
  getReadings: (params?: {
    device_id?: number;
    device_code?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", String(params.device_id));
    if (params?.device_code) qs.set("device_code", params.device_code);
    if (params?.start_time) qs.set("start_time", params.start_time);
    if (params?.end_time) qs.set("end_time", params.end_time);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<import("./types").SensorReading[]>(
      `/readings${query ? `?${query}` : ""}`
    );
  },

  // ── Quality (routers/quality.py) ──────────────────────────────────

  /** GET /quality/latest → LatestQualityOut[] */
  getLatestQuality: (deviceId?: number) => {
    const qs = deviceId != null ? `?device_id=${deviceId}` : "";
    return request<import("./types").LatestQuality[]>(`/quality/latest${qs}`);
  },

  /** GET /quality/predictions → DevicePredictionsOut[] */
  getPredictions: (deviceId?: number) => {
    const qs = deviceId != null ? `?device_id=${deviceId}` : "";
    return request<import("./types").DevicePredictions[]>(
      `/quality/predictions${qs}`
    );
  },

  // ── Notifications (routers/notifications.py) ──────────────────────

  /** GET /notifications → NotificationOut[] */
  getNotifications: (params?: { unread_only?: boolean; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<import("./types").Notification[]>(
      `/notifications${query ? `?${query}` : ""}`
    );
  },

  /** POST /notifications/:id/read → 204 */
  markNotificationRead: (notificationId: number) =>
    request<void>(`/notifications/${notificationId}/read`, { method: "POST" }),
};

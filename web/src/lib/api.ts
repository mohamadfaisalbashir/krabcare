// Pemanggilan REST API ke backend FastAPI (../backend/).
// Semua path mengikuti route di backend/app/routers/*.

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

/**
 * Alamat backend, dihitung saat dipanggil, bukan konstanta modul.
 *
 * NEXT_PUBLIC_* di-inline saat build (web/Dockerfile), defaultnya localhost.
 * Kalau halaman dibuka dari host lain (misal HP di WiFi yang sama), host di
 * alamat itu ditukar ke host halaman. Alamat berdomain asli tidak disentuh.
 */
function resolveApiBaseUrl(): string {
  const fallback = "http://localhost:8000/api/v1";
  if (typeof window === "undefined") return CONFIGURED_API_BASE_URL ?? fallback;

  const hostHalaman = window.location.hostname;
  const halamanDiLocalhost =
    hostHalaman === "localhost" || hostHalaman === "127.0.0.1" || hostHalaman === "::1";

  if (!CONFIGURED_API_BASE_URL) {
    return halamanDiLocalhost
      ? fallback
      : `${window.location.protocol}//${hostHalaman}:8000/api/v1`;
  }

  if (halamanDiLocalhost) return CONFIGURED_API_BASE_URL;

  try {
    const url = new URL(CONFIGURED_API_BASE_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = hostHalaman;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Alamat tidak bisa di-parse, pakai apa adanya.
  }
  return CONFIGURED_API_BASE_URL;
}

/** Dipakai pesan error supaya "tidak bisa menghubungi" menyebut alamatnya. */
export function apiBaseUrl(): string {
  return resolveApiBaseUrl();
}

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

/** Konfirmasi sebelum keluar akun, lalu buang token. */
export function confirmLogout(): void {
  if (window.confirm("Keluar dari akun ini? Anda perlu masuk lagi untuk membuka dashboard.")) {
    logout();
  }
}

/**
 * `detail` FastAPI punya dua bentuk: string dari HTTPException kita, atau
 * array `{loc, msg, type}` dari validasi Pydantic (422). Tanpa penanganan ini
 * bentuk array jadi "[object Object]". `loc` dipakai untuk tahu field mana
 * yang ditolak.
 */
function pesanError(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const pertama = detail[0] as { loc?: unknown[]; msg?: string };
    const msg = pertama?.msg;
    if (msg) {
      // loc = ["body", "email"] -> "email". Segmen terakhir adalah nama field.
      const field = Array.isArray(pertama.loc) ? pertama.loc[pertama.loc.length - 1] : null;
      // Kalimat kita menggantikan msg, bukan ditempel di depannya: msg Pydantic
      // berbahasa Inggris dan untuk pola email isinya regex mentah.
      return PESAN_FIELD[String(field)] ?? msg;
    }
  }

  return `Permintaan gagal (${status})`;
}

/**
 * Field backend -> kalimat Indonesia untuk galat validasi 422.
 * Field yang belum terdaftar di sini jatuh ke `msg` asli Pydantic.
 */
const PESAN_FIELD: Record<string, string> = {
  email: "Email tidak valid. Tulis lengkap dengan domainnya, contoh: nama@email.com",
  password: "Kata sandi minimal 8 karakter.",
  new_password: "Kata sandi baru minimal 8 karakter.",
  nama: "Nama tidak boleh kosong.",
  device_code: "Kode device tidak boleh kosong.",
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const base = resolveApiBaseUrl();

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // fetch cuma melempar untuk kegagalan jaringan (server mati, CORS ditolak,
    // DNS gagal); status HTTP apa pun tetap resolve. Sebut alamatnya, karena
    // "Failed to fetch" bawaan browser tidak menyebut apa-apa.
    throw new Error(
      `Tidak bisa menghubungi server di ${base}. Pastikan backend hidup dan alamat ini terjangkau dari perangkat Anda.`
    );
  }

  if (res.status === 401) {
    logout();
    throw new Error("Sesi berakhir, silakan login kembali.");
  }

  if (!res.ok) {
    // Backend FastAPI mengirim error di field `detail`, bukan `message`.
    const body = await res.json().catch(() => ({}));
    throw new Error(pesanError(body?.detail, res.status));
  }

  // Beberapa endpoint (mis. change-password) return 204 tanpa body.
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

export const api = {
  // Auth (routers/auth.py)

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

  /** DELETE /auth/me → 204. Permanen: kolam + notifikasi user ikut terhapus.
   *  Device dan riwayat sensornya tetap ada (FK SET NULL), statusnya kembali
   *  belum diklaim. */
  deleteAccount: () => request<void>("/auth/me", { method: "DELETE" }),

  /** POST /auth/verify-email → 204. Aktifkan akun lewat token dari email. */
  verifyEmail: (token: string) =>
    request<void>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  /** POST /auth/resend-verification → {detail}. Balasannya sama saja terdaftar atau tidak. */
  resendVerification: (email: string) =>
    request<{ detail: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
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

  // Kolam (routers/kolam.py)

  /** POST /kolam → KolamOut. Membuat kolam sekaligus mengklaim device-nya.
   *  Satu transaksi di backend: device_code salah -> 404/409 dan kolam tidak
   *  jadi dibuat, klien tidak perlu rollback. */
  createKolam: (nama: string, device_code: string) =>
    request<import("./types").Kolam>("/kolam", {
      method: "POST",
      body: JSON.stringify({ nama, device_code }),
    }),

  /** PUT /kolam/:id → KolamOut. */
  updateKolam: (kolamId: number, nama: string) =>
    request<import("./types").Kolam>(`/kolam/${kolamId}`, {
      method: "PUT",
      body: JSON.stringify({ nama }),
    }),

  /** DELETE /kolam/:id → 204. Permanen. Device dan riwayat sensornya tetap ada
   *  (FK SET NULL), statusnya kembali belum diklaim. Notifikasi kolam ikut
   *  terhapus (CASCADE). */
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

  // Devices (routers/devices.py, khusus admin)

  /** GET /devices → DeviceAdminOut[], semua device, sudah diklaim maupun belum. */
  listDevices: () =>
    request<import("./types").DeviceAdmin[]>("/devices"),

  /** GET /devices/target-kolams → TargetKolam[], daftar kolam untuk pemasangan device. */
  getTargetKolams: () =>
    request<import("./types").TargetKolam[]>("/devices/target-kolams"),

  /** POST /devices → DeviceOut (201). Ganti INSERT manual ke DB. */
  createDevice: (payload: import("./types").DeviceCreateIn) =>
    request<import("./types").Device>("/devices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** POST /devices/:id/claim → Pasangkan device ke kolam tertentu. */
  claimDeviceToKolam: (deviceId: number, kolamId: number) =>
    request<import("./types").Device>(`/devices/${deviceId}/claim`, {
      method: "POST",
      body: JSON.stringify({ kolam_id: kolamId }),
    }),

  /** POST /devices/:id/unclaim → Copot device dari kolam yang sedang terhubung. */
  unclaimDevice: (deviceId: number) =>
    request<import("./types").Device>(`/devices/${deviceId}/unclaim`, {
      method: "POST",
    }),

  /** DELETE /devices/:id → Hapus device dari database. */
  deleteDevice: (deviceId: number) =>
    request<void>(`/devices/${deviceId}`, {
      method: "DELETE",
    }),

  // Readings (routers/readings.py)

  /** GET /readings → SensorReadingOut[].
   *  `param` + `status` disaring di SQL (ambang Tabel 2.1 juga ada di backend),
   *  supaya satu halaman tetap penuh setelah difilter. */
  getReadings: (params?: {
    device_id?: number;
    device_code?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
    param?: import("./parameter").ParamKey;
    status?: "aman" | "waspada" | "bahaya";
  }) => {
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", String(params.device_id));
    if (params?.device_code) qs.set("device_code", params.device_code);
    if (params?.start_time) qs.set("start_time", params.start_time);
    if (params?.end_time) qs.set("end_time", params.end_time);
    if (params?.limit) qs.set("limit", String(params.limit));
    // != null, bukan cek falsy: offset=0 itu halaman pertama, bukan "tidak diisi".
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.param) qs.set("param", params.param);
    if (params?.status) qs.set("status", params.status);
    const query = qs.toString();
    return request<import("./types").SensorReading[]>(
      `/readings${query ? `?${query}` : ""}`
    );
  },

  // Quality (routers/quality.py)

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

  // Amonia (routers/quality.py)

  /** GET /quality/ammonia-risk → DeviceAmmoniaOut[] (terukur terkini + ramalan) */
  getAmmoniaRisk: (deviceId?: number) => {
    const qs = deviceId != null ? `?device_id=${deviceId}` : "";
    return request<import("./types").DeviceAmmonia[]>(`/quality/ammonia-risk${qs}`);
  },

  /** GET /quality/ammonia-risk/history → AmmoniaRiskLogOut[] */
  getAmmoniaHistory: (params?: {
    device_id?: number;
    start_time?: string;
    end_time?: string;
    risk_level?: "normal" | "perhatian" | "berbahaya";
    only_measured?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.device_id) qs.set("device_id", String(params.device_id));
    if (params?.start_time) qs.set("start_time", params.start_time);
    if (params?.end_time) qs.set("end_time", params.end_time);
    if (params?.risk_level) qs.set("risk_level", params.risk_level);
    if (params?.only_measured) qs.set("only_measured", "true");
    if (params?.limit) qs.set("limit", String(params.limit));
    // != null, bukan cek falsy: offset=0 itu halaman pertama, bukan "tidak diisi".
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<import("./types").AmmoniaRiskLog[]>(
      `/quality/ammonia-risk/history${query ? `?${query}` : ""}`
    );
  },

  // Notifications (routers/notifications.py)

  /** GET /notifications → NotificationOut[] */
  getNotifications: (params?: {
    unread_only?: boolean;
    limit?: number;
    offset?: number;
    /** Disaring di SQL. Menyaring di klien setelah limit bikin tab filter
     *  tampak kosong padahal barisnya ada di halaman berikutnya. */
    source?: import("./types").NotifSource;
  }) => {
    const qs = new URLSearchParams();
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.source) qs.set("source", params.source);
    if (params?.limit) qs.set("limit", String(params.limit));
    // != null, bukan cek falsy: offset=0 itu halaman pertama, bukan "tidak diisi".
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<import("./types").Notification[]>(
      `/notifications${query ? `?${query}` : ""}`
    );
  },

  /** POST /notifications/:id/read → 204 */
  markNotificationRead: (notificationId: number) =>
    request<void>(`/notifications/${notificationId}/read`, { method: "POST" }),

  /** DELETE /notifications/:id → 204 */
  deleteNotification: (notificationId: number) =>
    request<void>(`/notifications/${notificationId}`, { method: "DELETE" }),

  /** DELETE /notifications → { deleted: number } */
  deleteAllNotifications: () =>
    request<{ deleted: number }>(`/notifications`, { method: "DELETE" }),
};

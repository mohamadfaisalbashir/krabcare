// Lapisan pemanggilan RESTful API ke backend FastAPI.
// Backend berada di monorepo yang sama: ../backend/ (FastAPI).
//
// Semua path sudah diselaraskan dengan route di backend/app/routers/*.

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

/**
 * Alamat backend, dihitung SAAT DIPANGGIL dan bukan konstanta modul.
 *
 * Next meng-inline NEXT_PUBLIC_* ke bundel saat BUILD (lihat web/Dockerfile),
 * dan nilai default proyek ini `http://localhost:8000/api/v1`. Buka dashboard
 * dari HP di WiFi yang sama, dan browser HP itu menembak localhost-nya SENDIRI
 * — tidak ada backend di sana, jadi setiap permintaan mati sebagai
 * "Failed to fetch". Halamannya tetap terbuka (HTML-nya sudah sampai), sehingga
 * gejalanya menyamar jadi "gagal membuat kolam" / "error jaringan".
 *
 * Jadi: kalau alamat yang di-build menunjuk ke localhost padahal halamannya
 * dibuka dari host lain, host-nya ditukar ke host halaman. Alamat yang memang
 * disetel ke domain sungguhan (produksi) tidak disentuh sama sekali.
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
    // Alamat tidak bisa di-parse — pakai apa adanya, biar errornya jujur.
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

/**
 * `detail` FastAPI punya DUA bentuk, dan itu bukan detail sepele.
 *
 * HTTPException yang kita lempar sendiri mengisinya dengan string. TAPI galat
 * validasi Pydantic (422) mengisinya dengan ARRAY objek
 * `{loc, msg, type, ...}` — dan `new Error(array)` menghasilkan "[object
 * Object]". Itulah kenapa email yang ditolak pola backend terasa seperti tidak
 * divalidasi sama sekali: pesannya memang ada, cuma tidak pernah terbaca.
 *
 * `loc` dipakai untuk menyebut nama field-nya, karena satu form bisa punya
 * beberapa field dan "String should match pattern" saja tidak memberi tahu yang
 * mana.
 */
function pesanError(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const pertama = detail[0] as { loc?: unknown[]; msg?: string };
    const msg = pertama?.msg;
    if (msg) {
      // loc = ["body", "email"] -> "email". Segmen pertama selalu sumbernya
      // (body/query/path), jadi yang berguna bagi pengguna adalah yang terakhir.
      const field = Array.isArray(pertama.loc) ? pertama.loc[pertama.loc.length - 1] : null;
      const label = FIELD_LABEL[String(field)] ?? (field ? String(field) : null);
      return label ? `${label}: ${msg}` : msg;
    }
  }

  return `Permintaan gagal (${status})`;
}

/** Nama field backend -> label Indonesia, supaya pesan 422 bisa dibaca pengguna. */
const FIELD_LABEL: Record<string, string> = {
  email: "Email tidak valid",
  password: "Kata sandi",
  new_password: "Kata sandi baru",
  nama: "Nama",
  device_code: "Kode device",
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
    // fetch hanya melempar untuk kegagalan JARINGAN (server mati, CORS preflight
    // ditolak, DNS gagal) — status HTTP berapa pun tetap resolve. Pesan bawaannya
    // "Failed to fetch" tanpa konteks apa pun, dan pemanggil membungkusnya lagi
    // jadi "Gagal membuat kolam", sehingga penyebab sebenarnya tidak pernah
    // terlihat. Sebut alamatnya supaya bisa dicek langsung.
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

  /** DELETE /auth/me → 204. PERMANEN, dan menghapus kolam + notifikasi user ini.
   *  Device-nya selamat (FK SET NULL) beserta riwayat sensornya — ia cuma
   *  kembali jadi belum diklaim dan bisa dipasang admin ke pemilik lain. */
  deleteAccount: () => request<void>("/auth/me", { method: "DELETE" }),

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

  /** POST /kolam → KolamOut. Kolam DAN klaim device-nya sekaligus.
   *  Satu transaksi di backend: device_code yang salah -> 404/409 dan kolamnya
   *  TIDAK jadi dibuat, jadi tidak perlu rollback dari sisi klien. */
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

  // ── Devices (routers/devices.py, khusus admin) ───────────────────

  /** GET /devices → DeviceAdminOut[] — semua device, sudah diklaim maupun belum. */
  listDevices: () =>
    request<import("./types").DeviceAdmin[]>("/devices"),

  /** GET /devices/target-kolams → TargetKolam[] — daftar kolam untuk pemasangan device. */
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

  // ── Readings (routers/readings.py) ────────────────────────────────

  /** GET /readings → SensorReadingOut[].
   *  `param` + `status` menyaring di SQL (ambang Tabel 2.1 ada juga di backend),
   *  jadi satu halaman `limit` baris tetap penuh setelah difilter. */
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

  // ── Amonia (routers/quality.py) ───────────────────────────────────

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

  // ── Notifications (routers/notifications.py) ──────────────────────

  /** GET /notifications → NotificationOut[] */
  getNotifications: (params?: {
    unread_only?: boolean;
    limit?: number;
    offset?: number;
    /** Disaring di SQL. Menyaring di klien setelah limit membuat tab filter
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

import type { LogParam } from "./ammonia";

/**
 * Emoji per parameter, satu sumber untuk PondCard, submenu Log historis di
 * Sidebar, dan pil parameter di halaman Log historis. Emoji berwarna sendiri
 * dan tidak bisa diwarnai CSS, jadi status ditunjukkan lewat warna angkanya.
 */
export const PARAM_EMOJI: Record<LogParam, string> = {
  ph: "🧪",
  temperature_c: "🌡️",
  salinity_ppt: "🌊",
  amonia: "☣️",
  sistem: "⚠️",
};

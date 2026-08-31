import { logout } from "./api";

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

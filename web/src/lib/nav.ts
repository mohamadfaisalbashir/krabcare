/**
 * Item navigasi mana yang aktif untuk sebuah pathname.
 *
 * Dipakai Sidebar dan MobileNav — aturannya harus sama persis di keduanya,
 * jadi ditulis sekali di sini.
 */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Detail rak (/kolam/3) selalu dibuka dari Dashboard lewat PondCard, dan
  // tidak punya entri NAV sendiri. Tanpa pemetaan ini seluruh item mati di
  // halaman itu, dan navigasinya terlihat seperti rusak.
  if (pathname.startsWith("/kolam")) return href === "/dashboard";
  return pathname.startsWith(href);
}

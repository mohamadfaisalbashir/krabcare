/**
 * Item navigasi mana yang aktif untuk sebuah pathname.
 *
 * Dipakai Sidebar dan MobileNav, aturannya harus sama persis di keduanya,
 * jadi ditulis sekali di sini.
 */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Detail rak tidak punya rute sendiri lagi, ia terbuka inline di dashboard
  // (components/kolam/RakDetail.tsx), jadi pathname-nya tetap /dashboard dan
  // tidak ada pemetaan khusus yang perlu ditulis di sini.
  return pathname.startsWith(href);
}

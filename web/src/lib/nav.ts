/** Item navigasi mana yang aktif untuk sebuah pathname. Dipakai Sidebar dan
 *  MobileNav, aturannya harus sama di keduanya. */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Detail rak terbuka inline di dashboard (components/kolam/RakDetail.tsx),
  // bukan rute sendiri, jadi tidak ada pemetaan khusus di sini.
  return pathname.startsWith(href);
}

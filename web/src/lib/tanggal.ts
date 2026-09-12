// Format tanggal & waktu untuk seluruh tampilan: dd-mm-yyyy, jam lokal.
//
// Dibangun dari getDate()/getMonth()/getFullYear(), bukan toLocaleString, yang
// hasilnya ikut setelan locale mesin pengguna dan bukan dd-mm-yyyy.
// Tanpa import runtime supaya bisa dimuat `node --test` (lihat lib/export.ts).

function bagian(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    tanggal: `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`,
    jam: `${p(d.getHours())}:${p(d.getMinutes())}`,
    detik: p(d.getSeconds()),
  };
}

/** "09-09-2026" */
export function formatTanggal(iso: string): string {
  return bagian(iso).tanggal;
}

/** "09-09-2026 14:32" */
export function formatWaktu(iso: string): string {
  const b = bagian(iso);
  return `${b.tanggal} ${b.jam}`;
}

/** "09-09-2026 14:32:57", dipakai kolom waktu di ekspor CSV. */
export function formatWaktuDetik(iso: string): string {
  const b = bagian(iso);
  return `${b.tanggal} ${b.jam}:${b.detik}`;
}

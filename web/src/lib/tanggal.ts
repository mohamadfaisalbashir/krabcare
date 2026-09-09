// Format tanggal & waktu untuk seluruh tampilan: dd-mm-yyyy.
//
// Dibangun dari getDate()/getMonth()/getFullYear(), BUKAN toLocaleString.
// Locale "id-ID" memberi "9 Sep 2026" dan locale bawaan browser bisa memberi
// apa saja tergantung setelan mesin pengguna, dua-duanya bukan dd-mm-yyyy.
// Angkanya juga sengaja jam LOKAL, bukan UTC: pengguna membaca jam kolamnya.
//
// TANPA import runtime supaya bisa dimuat `node --test` (lihat lib/export.ts).

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

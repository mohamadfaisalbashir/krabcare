// Format tanggal & waktu untuk seluruh tampilan: dd-mm-yyyy, selalu jam Jakarta
// (WIB) apa pun zona waktu browser, sama dengan aplikasi mobile (mobile/lib/logic.dart).
//
// Dibangun dari getUTC*() atas waktu yang sudah digeser +7 jam, bukan
// toLocaleString, yang hasilnya ikut setelan locale mesin pengguna dan bukan dd-mm-yyyy.
// Tanpa import runtime supaya bisa dimuat `node --test` (lihat lib/export.ts).

/** WIB = UTC+7 tanpa DST, jadi offset tetap sudah benar tanpa data zona waktu. */
export const WIB_MS = 7 * 60 * 60 * 1000;

function bagian(iso: string) {
  // Jam dinding WIB dibaca lewat komponen UTC dari waktu yang sudah digeser.
  const d = new Date(new Date(iso).getTime() + WIB_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    tanggal: `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`,
    jam: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    detik: p(d.getUTCSeconds()),
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

/** yyyy-mm-dd hari ini di Jakarta (± `geserHari`), untuk nilai `<input type="date">`. */
export function tanggalWib(geserHari = 0): string {
  return new Date(Date.now() + WIB_MS + geserHari * 86_400_000).toISOString().slice(0, 10);
}

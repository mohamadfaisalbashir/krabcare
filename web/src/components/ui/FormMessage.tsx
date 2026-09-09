export type Message = { type: "ok" | "err"; text: string } | null;

/**
 * Pesan hasil submit, dirender tepat di bawah form yang memicunya.
 *
 * Di sini, bukan disalin per halaman: definisi yang identik sempat hidup dua
 * kali (profil & perangkat), dan halaman ketiga yang butuh umpan balik selalu
 * berakhir memakai `alert()` karena menyalin yang keempat kali terasa konyol.
 *
 * Bukan toast: aplikasi ini tidak punya sistem toast, dan pesan yang menempel
 * di bawah form-nya justru lebih tepat di sini — ia tetap terbaca setelah
 * beberapa detik, dan posisinya sendiri sudah menunjuk form mana yang berhasil.
 */
export default function FormMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      // role/aria-live supaya pembaca layar ikut mengumumkan hasilnya; tanpa
      // ini "berhasil" cuma peristiwa visual.
      role={message.type === "err" ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-lg px-3.5 py-2.5 text-sm ${
        message.type === "ok"
          ? "bg-status-amanBg text-status-aman"
          : "bg-status-bahayaBg text-status-bahaya"
      }`}
    >
      {message.text}
    </p>
  );
}

export type Message = { type: "ok" | "err"; text: string } | null;

/**
 * Pesan hasil submit, dirender tepat di bawah form yang memicunya.
 *
 * Bukan toast: aplikasi ini tidak punya sistem toast, dan pesan yang menempel
 * di bawah form tetap terbaca dan sudah menunjuk form mana yang dimaksud.
 */
export default function FormMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      // role/aria-live supaya pembaca layar ikut mengumumkan hasilnya.
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

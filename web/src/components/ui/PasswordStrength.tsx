export const CONTOH_SANDI = "Kepiting#2026";

// Level 1 = belum lolos aturan backend (schemas/user.py: min 8, huruf besar,
// simbol), 2 = lolos, 3 = lolos + panjang 12, ada angka dan huruf kecil.
// Sama dengan KekuatanSandi di mobile/lib/ui.dart.
export function nilaiSandi(s: string) {
  const kurang = [
    s.length < 8 && "minimal 8 karakter",
    !/[A-Z]/.test(s) && "huruf besar",
    !/[^A-Za-z0-9\s]/.test(s) && "simbol",
  ].filter(Boolean) as string[];
  if (kurang.length) return { level: 1, kurang };
  const sangat = s.length >= 12 && /\d/.test(s) && /[a-z]/.test(s);
  return { level: sangat ? 3 : 2, kurang };
}

const GAYA = [
  null,
  { label: "Lemah", bar: "bg-status-bahaya", teks: "text-status-bahaya" },
  { label: "Kuat", bar: "bg-status-waspada", teks: "text-status-waspada" },
  { label: "Sangat kuat", bar: "bg-status-aman", teks: "text-status-aman" },
];

export default function PasswordStrength({ value }: { value: string }) {
  if (!value) {
    return <p className="-mt-2 text-xs text-muted">Contoh kata sandi: {CONTOH_SANDI}</p>;
  }
  const { level, kurang } = nilaiSandi(value);
  const g = GAYA[level]!;
  return (
    <div className="-mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= level ? g.bar : "bg-border"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        <span className={`font-semibold ${g.teks}`}>{g.label}</span>
        {kurang.length > 0 && <>. Masih perlu {kurang.join(", ")}.</>}
      </p>
    </div>
  );
}

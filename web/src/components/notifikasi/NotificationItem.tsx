import { AlertOctagon, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Notification, StatusLabel, WaterQualityCategory, categoryToLabel } from "@/lib/types";
import StatusBadge from "@/components/ui/StatusBadge";
import clsx from "clsx";
import { formatWaktu } from "@/lib/tanggal";

/** Label sumber notifikasi sesuai backend notification.source. */
const SOURCE_LABEL: Record<string, string> = {
  classification: "Kondisi aktual",
  prediction: "Prediksi",
  parameter: "Parameter",
};

const PARAM_LABELS: Record<string, string> = {
  ph: "pH",
  temperature_c: "Suhu",
  salinity_ppt: "Salinitas",
  ammonia: "Amonia",
};

const STATUS_STYLE: Record<
  StatusLabel,
  { icon: React.ElementType; text: string; bg: string }
> = {
  Aman: { icon: CheckCircle2, text: "text-status-aman", bg: "bg-status-amanBg" },
  Waspada: {
    icon: AlertTriangle,
    text: "text-status-waspada",
    bg: "bg-status-waspadaBg",
  },
  Bahaya: {
    icon: AlertOctagon,
    text: "text-status-bahaya",
    bg: "bg-status-bahayaBg",
  },
};

/**
 * Kata status -> label warna. Dua kosakata dipetakan ke tiga warna yang sama:
 * "Aman/Waspada/Bahaya" (istilah tampilan, dipakai pesan sekarang) dan
 * "Baik/Sedang/Buruk" (istilah database, ada di baris notifikasi lama).
 *
 * ponytail: pencocokan kata polos. "Sedang" juga kata biasa ("sedang memuat"),
 * jadi template pesan baru yang memakainya begitu akan ikut jadi kuning. Aman
 * sekarang karena semua pesan lahir dari empat template di
 * notification_service.py. Kalau template bertambah, persempit ke pola huruf
 * besar saja.
 */
const KATA_STATUS: Record<string, StatusLabel> = {
  aman: "Aman",
  baik: "Aman",
  waspada: "Waspada",
  sedang: "Waspada",
  bahaya: "Bahaya",
  buruk: "Bahaya",
};

/**
 * Warnai kata status di mana pun ia muncul di dalam pesan. Pesan backend
 * menyebut status di tengah kalimat ("berubah dari Aman ke Waspada"), jadi
 * satu badge di pinggir tidak cukup untuk kalimat yang menyebut dua status.
 *
 * Regex case-insensitive karena backend memakai huruf kapital awal pada
 * kalimat transisi dan huruf besar semua pada kalimat lain. Grup tangkap di
 * split() membuat pemisahnya ikut masuk hasil, jadi tidak ada teks yang hilang.
 *
 * Warna dari STATUS_STYLE di berkas ini, sumber yang sama dengan ikon di kiri.
 */
function PesanBerwarna({ teks }: { teks: string }) {
  const bagian = teks.split(/(Aman|Waspada|Bahaya|Baik|Sedang|Buruk)/gi);
  return (
    <>
      {bagian.map((b, i) => {
        const gaya = STATUS_STYLE[KATA_STATUS[b.toLowerCase()]];
        return gaya ? (
          <span key={i} className={clsx("font-semibold", gaya.text)}>
            {b}
          </span>
        ) : (
          b
        );
      })}
    </>
  );
}

export default function NotificationItem({
  item,
  onRead,
  onDelete,
}: {
  item: Notification;
  onRead?: (id: number) => void;
  /** Hapus satu notifikasi/prediksi ini saja. */
  onDelete?: (id: number) => void;
}) {
  const label = categoryToLabel(item.quality_category as WaterQualityCategory);
  const style = STATUS_STYLE[label];
  const Icon = style.icon;

  return (
    <div className={clsx("flex gap-4 px-5 py-4", !item.is_read && "bg-brand-50/40")}>
      <div
        className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          style.bg,
          style.text
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-ink">
            {item.device_code ?? `Device #${item.device_id}`}
          </p>
          <span className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
            {SOURCE_LABEL[item.source] ?? item.source}
          </span>
          {/* Chip diwarnai kondisi, bukan warna merek. Chip ini yang menyebut
              hal apa yang dilaporkan ("Suhu", "Kualitas Kolam"), jadi warnanya
              harus ikut mengatakan kondisinya. style.bg dan style.text dihitung
              di atas dari quality_category yang sama dengan ikonnya. */}
          {item.parameter && PARAM_LABELS[item.parameter] && (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                style.bg,
                style.text
              )}
            >
              {PARAM_LABELS[item.parameter]}
            </span>
          )}
          {/* Syaratnya `!item.parameter` saja, tanpa memeriksa source. Kalau
              menuntut source === "classification", baris prediksi (parameter
              NULL, source "prediction") tidak cocok chip mana pun dan warnanya
              hilang. Prediksi meramal kategori kualitas air keseluruhan, subjek
              yang sama dengan klasifikasi, jadi labelnya memang sama. */}
          {!item.parameter && (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                style.bg,
                style.text
              )}
            >
              Kualitas Kolam
            </span>
          )}
          {/* Status ditulis sebagai teks. Kalau cuma tersirat dari bentuk dan
              warna ikon di kiri, ia tidak terbaca pembaca layar maupun oleh
              yang kesulitan membedakan warna. */}
          <StatusBadge status={label} size="sm" />
          {!item.is_read && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-label="Belum dibaca" />
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink">
          <PesanBerwarna teks={item.message} />
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          <p className="text-xs text-muted">
            {formatWaktu(item.created_at)}
          </p>
          {!item.is_read && onRead && (
            <button
              onClick={() => onRead(item.id)}
              className="py-1.5 text-xs font-semibold text-brand-600 hover:underline"
            >
              Tandai dibaca
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item.id)}
              aria-label="Hapus notifikasi ini"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-status-bahayaBg hover:text-status-bahaya"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

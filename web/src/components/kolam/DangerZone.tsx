"use client";

import { useState } from "react";
import { AlertOctagon } from "lucide-react";
import Input from "@/components/ui/Input";
import { api } from "@/lib/api";

/**
 * Zona berbahaya ala GitHub: menghapus rak butuh mengetik ulang namanya.
 *
 * Inline, bukan overlay. Modal sendiri butuh focus trap, penanganan Escape,
 * dan portal untuk hasil yang sama; window.confirm tidak bisa dipakai karena
 * di sini butuh kolom isian.
 */
export default function DangerZone({
  kolamId,
  nama,
  deviceCode,
  onDeleted,
}: {
  kolamId: number;
  nama: string;
  deviceCode: string | null;
  /** Dipanggil setelah hapus berhasil. Halaman yang memutuskan mau ke mana. */
  onDeleted: () => void;
}) {
  const [ketikan, setKetikan] = useState("");
  const [menghapus, setMenghapus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cocok = ketikan.trim() === nama;

  async function handleHapus() {
    // Peringatan terakhir di atas ketik-ulang-nama. Keduanya menjaga hal
    // berbeda: mengetik nama menjaga dari salah kolam, dialog ini dari salah
    // tekan. window.confirm, sama seperti konfirmasi destruktif lain di
    // aplikasi ini (lib/api.ts:69).
    if (
      !window.confirm(
        `Hapus kolam "${nama}" secara permanen?\n\n` +
          "Seluruh notifikasi kolam ini ikut terhapus. Device-nya tidak " +
          "terhapus, hanya kembali jadi belum diklaim beserta riwayat sensornya." +
          "\n\n" +
          "Tindakan ini tidak bisa dibatalkan."
      )
    ) {
      return;
    }

    setError(null);
    setMenghapus(true);
    try {
      await api.deleteKolam(kolamId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus kolam.");
      setMenghapus(false);
    }
  }

  // Tanpa `.glass` sendiri: blok ini sudah di dalam lembar kaca RakDetail dan
  // backdrop-filter bersarang cuma menambah biaya cat. Tint merah + garis 1px
  // sudah cukup memisahkannya.
  return (
    <div className="rounded-lg border border-status-bahaya/30 bg-status-bahayaBg/60 p-5 sm:max-w-2xl">
      <div className="mb-3 flex items-center gap-2.5">
        <AlertOctagon className="h-5 w-5 text-status-bahaya" />
        <h3 className="font-display text-base font-semibold text-status-bahaya">
          Zona berbahaya
        </h3>
      </div>

      <p className="text-sm font-semibold text-ink">
        Menghapus kolam ini bersifat permanen dan tidak dapat dibatalkan.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Tidak ada fitur pemulihan. Sekali dihapus, kolam ini beserta notifikasinya
        hilang selamanya. Yang <strong className="text-ink">tetap aman</strong>:
        seluruh riwayat pengukuran, klasifikasi, dan prediksi, karena semuanya
        menempel pada perangkat, bukan pada rak.
        {deviceCode ? (
          <>
            {" "}
            Perangkat <code className="font-mono text-ink">{deviceCode}</code>{" "}
            tidak ikut terhapus, hanya kembali menjadi belum terklaim dan bisa
            diklaim ulang untuk membuka datanya lagi.
          </>
        ) : (
          " Kolam ini belum terhubung ke perangkat mana pun."
        )}
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Input
            label={`Ketik "${nama}" untuk mengonfirmasi`}
            value={ketikan}
            onChange={(e) => setKetikan(e.target.value)}
            placeholder={nama}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={handleHapus}
          disabled={!cocok || menghapus}
          className="btn-danger"
        >
          {menghapus ? "Menghapus..." : "Hapus kolam ini"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
          {error}
        </p>
      )}
    </div>
  );
}

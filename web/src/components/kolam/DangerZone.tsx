"use client";

import { useState } from "react";
import { AlertOctagon } from "lucide-react";
import Input from "@/components/ui/Input";
import { api } from "@/lib/api";

/**
 * Zona berbahaya ala GitHub: menghapus rak butuh mengetik ulang namanya.
 *
 * Halaman detail rak menyembunyikan panel ini sampai tombol "Hapus rak" ditekan,
 * tapi wujudnya tetap INLINE, bukan overlay. Modal buatan sendiri butuh focus
 * trap, penanganan Escape, dan portal untuk hasil yang sama — alasan yang sama
 * yang membuat confirmLogout memilih window.confirm (lib/api.ts). window.confirm
 * sendiri tak bisa dipakai di sini karena butuh kolom isian.
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
  /** Dipanggil setelah hapus berhasil; halaman yang memutuskan mau ke mana. */
  onDeleted: () => void;
}) {
  const [ketikan, setKetikan] = useState("");
  const [menghapus, setMenghapus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cocok = ketikan.trim() === nama;

  async function handleHapus() {
    setError(null);
    setMenghapus(true);
    try {
      await api.deleteKolam(kolamId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus rak.");
      setMenghapus(false);
    }
  }

  // Tanpa `.glass` sendiri: blok ini sudah duduk di dalam lembar kaca
  // RakDetail, dan backdrop-filter bersarang cuma menambah biaya cat tanpa
  // menambah tampilan. Tint merah + garis 1px sudah cukup memisahkannya.
  return (
    <div className="rounded-lg border border-status-bahaya/30 bg-status-bahayaBg/60 p-5 sm:max-w-2xl">
      <div className="mb-3 flex items-center gap-2.5">
        <AlertOctagon className="h-5 w-5 text-status-bahaya" />
        <h3 className="font-display text-base font-semibold text-status-bahaya">
          Zona berbahaya
        </h3>
      </div>

      <p className="text-sm font-semibold text-ink">
        Menghapus rak ini bersifat permanen dan tidak dapat dibatalkan.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Tidak ada fitur pemulihan. Sekali dihapus, rak ini beserta notifikasinya
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
          " Rak ini belum terhubung ke perangkat mana pun."
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
          {menghapus ? "Menghapus..." : "Hapus rak ini"}
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

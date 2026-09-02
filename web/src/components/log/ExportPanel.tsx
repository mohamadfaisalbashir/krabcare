"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { PARAM_KEYS, PARAM_UI, ParamKey } from "@/lib/parameter";
import { Sensor } from "@/lib/types";
import { api } from "@/lib/api";
import {
  dayRangeToIso,
  fetchAllReadings,
  toCsv,
  csvFilename,
  downloadCsv,
  MAX_PAGES,
  type GetPage,
} from "@/lib/export";

/** yyyy-mm-dd untuk <input type="date">, dari tanggal LOKAL bukan UTC. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ExportPanel({
  sensors,
  defaultDeviceId,
}: {
  sensors: Sensor[];
  /** Ikut pilihan sensor di daftar, supaya panel tidak melawan konteks di layar. */
  defaultDeviceId: string;
}) {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);

  const [from, setFrom] = useState(isoDay(weekAgo));
  const [to, setTo] = useState(isoDay(today));
  const [paramSel, setParamSel] = useState<ParamKey | "semua">("semua");
  const [deviceSel, setDeviceSel] = useState(defaultDeviceId);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleDownload() {
    setError(null);
    setNote(null);

    if (from > to) {
      setError("Tanggal 'Dari' melewati tanggal 'Sampai'.");
      return;
    }
    const targets =
      deviceSel === "semua" ? sensors : sensors.filter((s) => String(s.deviceId) === deviceSel);
    if (targets.length === 0) {
      setError("Belum ada sensor yang bisa diunduh.");
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      // getPage sebagai parameter, bukan import di dalam lib/export.ts: modul itu
      // tetap bebas dependensi (bisa diuji node --test) dan progres jadi gratis.
      const getPage: GetPage = async (p) => {
        const rows = await api.getReadings(p);
        setProgress((n) => n + rows.length);
        return rows;
      };

      const { start, end } = dayRangeToIso(from, to);
      // Paralel antar sensor (maksimal 3), berurutan di dalam satu sensor.
      const results = await Promise.all(
        targets.map((s) => fetchAllReadings(getPage, s.deviceId, start, end))
      );

      const rows = results.flatMap((r) => r.rows);
      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal itu.");
        return;
      }

      const params = paramSel === "semua" ? PARAM_KEYS : [paramSel];
      const kolamByDevice = Object.fromEntries(sensors.map((s) => [s.deviceId, s.kolamNama]));
      const label = deviceSel === "semua" ? "semua" : targets[0].deviceCode;

      downloadCsv(toCsv(rows, params, kolamByDevice), csvFilename(label, params, from, to));

      if (results.some((r) => r.truncated)) {
        // Paging berjalan dari terbaru ke terlama, jadi yang terpotong adalah
        // data PALING LAMA. Itu harus dikatakan, bukan sekadar "terpotong".
        setNote(
          `Batas ${(MAX_PAGES * 1000).toLocaleString("id-ID")} baris per sensor tercapai — ` +
            "berkas berisi data terbaru saja, data paling lama terpotong. " +
            "Persempit rentang tanggalnya."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunduh data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-display text-base font-semibold text-ink">Unduh Data Mentah</h3>
        <p className="mt-1 text-xs text-muted">
          Berkas CSV berisi nilai apa adanya pada rentang tanggal yang dipilih —
          filter status di bawah tidak ikut diterapkan.
        </p>
      </div>

      {/* flex-wrap wajib: keempat field punya lebar tetap yang totalnya 704px,
          lebih lebar dari layar 640px kalau dipaksa satu baris. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="sm:w-40">
          <Input
            label="Dari"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="sm:w-40">
          <Input
            label="Sampai"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        <div className="sm:w-44">
          <label htmlFor="unduh-parameter" className="label-field">
            Parameter
          </label>
          <select
            id="unduh-parameter"
            value={paramSel}
            onChange={(e) => setParamSel(e.target.value as ParamKey | "semua")}
            className="input-field"
          >
            <option value="semua">Semua parameter</option>
            {PARAM_KEYS.map((p) => (
              <option key={p} value={p}>
                {PARAM_UI[p].short}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:w-52">
          <label htmlFor="unduh-sensor" className="label-field">
            Sensor
          </label>
          <select
            id="unduh-sensor"
            value={deviceSel}
            onChange={(e) => setDeviceSel(e.target.value)}
            className="input-field"
          >
            <option value="semua">Semua sensor</option>
            {sensors.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>
                {s.kolamNama} — {s.deviceCode}
              </option>
            ))}
          </select>
        </div>

        <Button variant="ghost" onClick={handleDownload} disabled={busy}>
          <Download className="mr-1.5 inline h-4 w-4" />
          {busy ? `Mengunduh… (${progress.toLocaleString("id-ID")} baris)` : "Unduh CSV"}
        </Button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
          {error}
        </p>
      )}
      {note && <p className="mt-3 text-xs leading-relaxed text-muted">{note}</p>}
    </Card>
  );
}

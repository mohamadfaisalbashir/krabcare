"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { PARAM_KEYS, PARAM_UI, ParamKey } from "@/lib/parameter";
import { AMONIA_UI } from "@/lib/ammonia";
import { AmmoniaRiskLog, Sensor } from "@/lib/types";
import { api } from "@/lib/api";
import {
  dayRangeToIso,
  fetchAllReadings,
  toCsv,
  petaAmoniaDari,
  namaBerkas,
  downloadCsv,
  downloadXlsx,
  MAX_PAGES,
  type ExportFormat,
  type GetPage,
} from "@/lib/export";

/** yyyy-mm-dd untuk <input type="date">, dari tanggal lokal bukan UTC. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Batas keras backend untuk /quality/ammonia-risk/history (le=1000). */
const AMONIA_CHUNK = 1000;
/** Sepadan dengan MAX_PAGES di lib/export.ts: 20.000 baris amonia per unduhan. */
const AMONIA_MAX_PAGES = 20;

/**
 * Ambil seluruh riwayat amonia terukur pada satu rentang waktu.
 *
 * Lebih sederhana dari fetchAllReadings karena endpoint ini punya `offset`,
 * jadi tidak perlu keyset cursor. `only_measured` menyaring ke horizon 0,
 * yaitu hasil hitung dari pembacaan nyata, bukan ramalan FTS. device_id tidak
 * dikirim: scope backend sudah membatasi ke device milik user.
 */
async function ambilAmonia(start: string, end: string) {
  const semua: AmmoniaRiskLog[] = [];
  for (let i = 0; i < AMONIA_MAX_PAGES; i++) {
    const page = await api.getAmmoniaHistory({
      start_time: start,
      end_time: end,
      only_measured: true,
      limit: AMONIA_CHUNK,
      offset: i * AMONIA_CHUNK,
    });
    semua.push(...page);
    if (page.length < AMONIA_CHUNK) break;
  }
  return semua;
}

export default function ExportPanel({ sensors }: { sensors: Sensor[] }) {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);

  const [from, setFrom] = useState(isoDay(weekAgo));
  const [to, setTo] = useState(isoDay(today));
  // "amonia" = amonia saja. Kolomnya selalu ikut di berkas apa pun, tapi tanpa
  // pilihan ini keberadaannya tidak kelihatan di layar.
  const [paramSel, setParamSel] = useState<ParamKey | "semua" | "amonia">("semua");
  const [format, setFormat] = useState<ExportFormat>("csv");
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
    if (sensors.length === 0) {
      setError("Belum ada sensor yang bisa diunduh.");
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      // getPage sebagai parameter, bukan import di lib/export.ts, supaya modul
      // itu tetap bebas dependensi dan bisa diuji `node --test`.
      const getPage: GetPage = async (p) => {
        const rows = await api.getReadings(p);
        setProgress((n) => n + rows.length);
        return rows;
      };

      const { start, end } = dayRangeToIso(from, to);
      // Paralel antar sensor (maksimal 3), berurutan di dalam satu sensor.
      const results = await Promise.all(
        sensors.map((s) => fetchAllReadings(getPage, s.deviceId, start, end))
      );

      // flatMap menyambung sensor demi sensor, jadi berkas gabungan melompat
      // mundur tiap ganti sensor. Diurutkan lagi supaya kronologis.
      const rows = results
        .flatMap((r) => r.rows)
        .sort((a, b) => a.time.localeCompare(b.time));
      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal itu.");
        return;
      }

      const params =
        paramSel === "semua" ? PARAM_KEYS : paramSel === "amonia" ? [] : [paramSel];
      const kolamByDevice = Object.fromEntries(sensors.map((s) => [s.deviceId, s.kolamNama]));
      const amonia = petaAmoniaDari(await ambilAmonia(start, end));

      const filename = namaBerkas("semua", params, from, to, format);
      if (format === "xlsx") {
        await downloadXlsx(rows, params, kolamByDevice, amonia, filename);
      } else {
        downloadCsv(toCsv(rows, params, kolamByDevice, amonia), filename);
      }

      if (results.some((r) => r.truncated)) {
        // Paging berjalan dari terbaru ke terlama, jadi yang terpotong adalah
        // data paling lama, dan potongan itu ada di awal berkas.
        setNote(
          `Batas ${(MAX_PAGES * 1000).toLocaleString("id-ID")} baris per sensor tercapai. ` +
            "Data paling lama terpotong, jadi berkas ini tidak mulai dari tanggal " +
            "'Dari' yang dipilih. Persempit rentang tanggalnya."
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
        <h3 className="font-display text-base font-semibold text-ink">Unduh data mentah</h3>
        <p className="mt-1 text-xs text-muted">
          Berisi nilai apa adanya pada rentang tanggal yang dipilih, urut mulai
          dari data paling lama. Ikut disertakan waktu data itu sampai di server,
          untuk mengukur berapa lama pengirimannya dari alat.
        </p>
      </div>

      {/* flex-wrap wajib: ketiga field punya lebar tetap yang bersama tombolnya
          masih lebih lebar dari layar 640px kalau dipaksa satu baris. */}
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
            onChange={(e) => setParamSel(e.target.value as ParamKey | "semua" | "amonia")}
            className="input-field"
          >
            <option value="semua">Semua parameter</option>
            {PARAM_KEYS.map((p) => (
              <option key={p} value={p}>
                {PARAM_UI[p].short}
              </option>
            ))}
            <option value="amonia">{AMONIA_UI.short}</option>
          </select>
        </div>

        <div className="sm:w-36">
          <label htmlFor="unduh-format" className="label-field">
            Format
          </label>
          <select
            id="unduh-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="input-field"
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
          </select>
        </div>

        <Button variant="ghost" onClick={handleDownload} disabled={busy}>
          <Download className="mr-1.5 inline h-4 w-4" />
          {busy
            ? `Mengunduh… (${progress.toLocaleString("id-ID")} baris)`
            : `Unduh ${format.toUpperCase()}`}
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

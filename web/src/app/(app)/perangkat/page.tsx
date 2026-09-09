"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Cpu, Clock, CheckCircle2, Trash2, Link2, Unlink } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-store";
import { Device, DeviceAdmin, TargetKolam } from "@/lib/types";
import { formatWaktu } from "@/lib/tanggal";
import FormMessage, { type Message } from "@/components/ui/FormMessage";


const DEVICE_TYPE_LABEL: Record<Device["device_type"], string> = {
  slave_node: "Slave node",
  master_node: "Master node",
  gateway: "Gateway (Raspberry Pi)",
};

/**
 * Tipe yang boleh DIPILIH saat mendaftarkan device baru — gateway TIDAK ikut.
 *
 * Gateway (Raspberry Pi) bukan device yang diklaim ke kolam: ia yang MENGIRIM
 * data device lain lewat /ingest/* dengan X-API-Key, dan didaftarkan lewat
 * seed SQL, bukan lewat panel ini. Menawarkannya di dropdown cuma mengundang
 * baris yang tidak akan pernah punya pembacaan sensor.
 *
 * DEVICE_TYPE_LABEL di atas TETAP memuat gateway — ia dipakai sebagai label
 * baris untuk gateway yang memang sudah terdaftar, dan enum backend
 * (models/enums.py) juga tidak disentuh supaya device lama tidak jadi tertolak.
 */
const TIPE_BISA_DIDAFTAR: Device["device_type"][] = ["slave_node", "master_node"];

/** Baris satu device dengan aksi pasang, lepas, atau hapus. */
function DeviceRow({
  d,
  onAssign,
  onUnclaim,
  onDelete,
  busy,
}: {
  d: DeviceAdmin;
  onAssign?: (d: DeviceAdmin) => void;
  onUnclaim?: (d: DeviceAdmin) => void;
  onDelete: (d: DeviceAdmin) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold text-ink">{d.device_code}</p>
        <p className="text-xs text-muted">
          {DEVICE_TYPE_LABEL[d.device_type]}
          {d.kolam_nama ? ` · Kolam: ${d.kolam_nama}` : ""}
          {d.owner_nama ? ` (Milik: ${d.owner_nama})` : ""}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          <Clock className="h-3 w-3" />
          {d.last_seen_at
            ? `Terakhir aktif: ${formatWaktu(d.last_seen_at)}`
            : "Belum pernah kirim data"}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {onAssign && (
          <button
            type="button"
            onClick={() => onAssign(d)}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50/70 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
            title="Pasang ke kolam user"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Pasang</span>
          </button>
        )}

        {onUnclaim && (
          <button
            type="button"
            onClick={() => onUnclaim(d)}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-status-waspada hover:bg-status-waspadaBg hover:text-status-waspada disabled:opacity-50"
            title="Lepaskan device dari kolam"
          >
            <Unlink className="h-3.5 w-3.5" />
            <span>Lepas</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onDelete(d)}
          disabled={busy}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-status-bahayaBg hover:text-status-bahaya disabled:opacity-50"
          title="Hapus device"
          aria-label={`Hapus device ${d.device_code}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function PerangkatPage() {
  const router = useRouter();
  const user = useUser();

  // Halaman ini cuma buat admin. Item nav-nya sudah disembunyikan untuk role
  // lain (Sidebar/MobileNav), tapi URL tetap bisa diketik langsung, jadi
  // dijaga juga di sini — begitu user diketahui BUKAN admin, tendang balik.
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  const [devices, setDevices] = useState<DeviceAdmin[]>([]);
  const [targetKolams, setTargetKolams] = useState<TargetKolam[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [deviceType, setDeviceType] = useState<Device["device_type"]>("slave_node");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<Message>(null);

  // State untuk modal pasang device ke kolam
  const [assignModalDevice, setAssignModalDevice] = useState<DeviceAdmin | null>(null);
  const [selectedKolamId, setSelectedKolamId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<number | null>(null);
  /** Hasil aksi pada BARIS device (pasang/lepas/hapus) — terpisah dari
   *  formMessage yang milik form "Tambah device" di atasnya. */
  const [aksiMessage, setAksiMessage] = useState<Message>(null);

  function loadDevices() {
    setLoadingList(true);
    Promise.all([api.listDevices(), api.getTargetKolams().catch(() => [])])
      .then(([devList, kolamList]) => {
        setDevices(devList);
        setTargetKolams(kolamList);
      })
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : "Gagal memuat daftar device.")
      )
      .finally(() => setLoadingList(false));
  }

  useEffect(() => {
    if (user?.role === "admin") loadDevices();
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage(null);
    setSubmitting(true);
    try {
      const created = await api.createDevice({
        device_code: deviceCode.trim(),
        device_type: deviceType,
        rack_label: null,
      });
      setDevices((list) =>
        [{ ...created, kolam_id: null, kolam_nama: null, owner_nama: null }, ...list].sort((a, b) =>
          a.device_code.localeCompare(b.device_code)
        )
      );
      setFormMessage({
        type: "ok",
        text: `Device '${created.device_code}' berhasil ditambahkan, siap diklaim ke kolam.`,
      });
      setDeviceCode("");
    } catch (err) {
      setFormMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal menambahkan device.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(d: DeviceAdmin) {
    const konfirmasi = window.confirm(
      `Hapus device '${d.device_code}' secara permanen?\n\nPerangkat dan seluruh riwayat pengukurannya akan dihapus dari sistem.`
    );
    if (!konfirmasi) return;

    setBusyDeviceId(d.id);
    setAksiMessage(null);
    try {
      await api.deleteDevice(d.id);
      setAksiMessage({ type: "ok", text: `Device '${d.device_code}' berhasil dihapus.` });
      loadDevices();
    } catch (err) {
      setAksiMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal menghapus device.",
      });
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function handleUnclaim(d: DeviceAdmin) {
    const konfirmasi = window.confirm(
      `Lepaskan device '${d.device_code}' dari kolam '${d.kolam_nama}'?`
    );
    if (!konfirmasi) return;

    const asalKolam = d.kolam_nama;
    setBusyDeviceId(d.id);
    setAksiMessage(null);
    try {
      await api.unclaimDevice(d.id);
      setAksiMessage({
        type: "ok",
        text: `Device '${d.device_code}' berhasil dilepas dari kolam '${asalKolam}'.`,
      });
      loadDevices();
    } catch (err) {
      setAksiMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Gagal mencopot device dari kolam.",
      });
    } finally {
      setBusyDeviceId(null);
    }
  }

  function handleOpenAssign(d: DeviceAdmin) {
    setAssignModalDevice(d);
    setSelectedKolamId("");
    setAssignError(null);
  }

  async function handleConfirmAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignModalDevice || !selectedKolamId) return;

    setAssigning(true);
    setAssignError(null);
    setAksiMessage(null);
    try {
      await api.claimDeviceToKolam(assignModalDevice.id, Number(selectedKolamId));
      // Nama kolam dibaca dari daftar target SEBELUM loadDevices menyegarkannya,
      // dan device-nya dari state modal sebelum modalnya ditutup.
      const kolam = targetKolams.find((k) => k.id === Number(selectedKolamId));
      setAksiMessage({
        type: "ok",
        text:
          `Device '${assignModalDevice.device_code}' berhasil dipasang ke kolam ` +
          `'${kolam?.nama ?? selectedKolamId}'.`,
      });
      setAssignModalDevice(null);
      setSelectedKolamId("");
      loadDevices();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Gagal memasangkan device.");
    } finally {
      setAssigning(false);
    }
  }

  // Belum ketahuan role-nya (store masih memuat /auth/me) — jangan render
  // apa pun dulu, sama seperti guard di (app)/layout.tsx.
  if (!user || user.role !== "admin") return null;

  const belumDiklaim = devices.filter((d) => d.kolam_id == null);
  const sudahDiklaim = devices.filter((d) => d.kolam_id != null);

  return (
    <>
      <Topbar
        title="Perangkat"
        subtitle="Lihat device yang sudah/belum diklaim & daftarkan device baru"
      />

      <div className="flex-1 space-y-6 p-5 sm:p-8">
        <Card>
          <div className="mb-4 flex items-center gap-2.5">
            <PlusCircle className="h-5 w-5 text-brand-500" />
            <h3 className="font-display text-base font-semibold text-ink">
              Tambah device baru
            </h3>
          </div>
          <p className="mb-4 text-sm text-muted">
            Ganti INSERT manual ke database. device_code harus persis sama
            dengan yang dikirim firmware (case-sensitive). Device baru lahir
            belum terklaim kolam mana pun; Anda dapat langsung memasangkannya
            ke kolam pengguna dari panel di bawah.
          </p>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Device code"
              value={deviceCode}
              onChange={(e) => setDeviceCode(e.target.value)}
              placeholder="mis. 54D660E9BFB4"
              required
            />
            <div>
              <label htmlFor="device-type" className="label-field">
                Tipe device
              </label>
              <select
                id="device-type"
                className="input-field"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as Device["device_type"])}
              >
                {TIPE_BISA_DIDAFTAR.map((value) => (
                  <option key={value} value={value}>
                    {DEVICE_TYPE_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <FormMessage message={formMessage} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Menambahkan..." : "Tambah device"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Hasil pasang/lepas/hapus. Di ATAS kedua daftar, karena aksinya
            memindahkan barisnya antar daftar — pesan yang menempel di barisnya
            sendiri akan ikut hilang bersama baris itu. */}
        <FormMessage message={aksiMessage} />

        {listError && (
          <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
            {listError}
          </p>
        )}

        <Card className="p-0">
          <div className="flex items-center gap-2.5 p-5 pb-0 sm:p-6 sm:pb-0">
            <Cpu className="h-5 w-5 text-brand-500" />
            <h3 className="font-display text-base font-semibold text-ink">
              Belum diklaim ({loadingList ? "…" : belumDiklaim.length})
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            {loadingList ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : belumDiklaim.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Tidak ada device menunggu klaim. Semua device terdaftar sudah
                terhubung ke kolam.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {belumDiklaim.map((d) => (
                  <DeviceRow
                    key={d.id}
                    d={d}
                    onAssign={handleOpenAssign}
                    onDelete={handleDelete}
                    busy={busyDeviceId === d.id}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center gap-2.5 p-5 pb-0 sm:p-6 sm:pb-0">
            <CheckCircle2 className="h-5 w-5 text-status-aman" />
            <h3 className="font-display text-base font-semibold text-ink">
              Sudah diklaim ({loadingList ? "…" : sudahDiklaim.length})
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            {loadingList ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : sudahDiklaim.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Belum ada device yang diklaim ke kolam mana pun.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {sudahDiklaim.map((d) => (
                  <DeviceRow
                    key={d.id}
                    d={d}
                    onUnclaim={handleUnclaim}
                    onDelete={handleDelete}
                    busy={busyDeviceId === d.id}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Modal Pasang Device ke Kolam User */}
      {assignModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="mb-2 flex items-center gap-2">
              <Link2 className="h-5 w-5 text-brand" />
              <h3 className="font-display text-lg font-semibold text-ink">
                Pasang Device ke Kolam
              </h3>
            </div>
            <p className="mb-4 text-xs text-muted leading-relaxed">
              Hubungkan perangkat <span className="font-mono font-semibold text-ink">{assignModalDevice.device_code}</span> dengan kolam milik pengguna agar data sensornya mulai terekam di kolam tersebut.
            </p>

            <form onSubmit={handleConfirmAssign} className="space-y-4">
              <div>
                <label htmlFor="select-kolam-modal" className="label-field">
                  Pilih Kolam Tujuan
                </label>
                <select
                  id="select-kolam-modal"
                  className="input-field"
                  value={selectedKolamId}
                  onChange={(e) => setSelectedKolamId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih salah satu kolam --</option>
                  {targetKolams.map((k) => (
                    <option
                      key={k.id}
                      value={k.id}
                      disabled={Boolean(k.current_device_code && k.current_device_id !== assignModalDevice.id)}
                    >
                      {k.nama} — {k.owner_name} ({k.owner_email})
                      {k.current_device_code ? ` [Sudah ada: ${k.current_device_code}]` : " [Kosong / Siap]"}
                    </option>
                  ))}
                </select>
                {targetKolams.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    Belum ada kolam yang dibuat oleh pengguna di sistem.
                  </p>
                )}
              </div>

              {assignError && (
                <p className="rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-xs text-status-bahaya">
                  {assignError}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setAssignModalDevice(null);
                    setAssignError(null);
                  }}
                  disabled={assigning}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={assigning || !selectedKolamId}>
                  {assigning ? "Memasangkan..." : "Pasangkan Device"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

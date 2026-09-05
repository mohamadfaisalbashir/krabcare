"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Cpu, Clock, CheckCircle2 } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-store";
import { Device, DeviceAdmin } from "@/lib/types";

type Message = { type: "ok" | "err"; text: string } | null;

const DEVICE_TYPE_LABEL: Record<Device["device_type"], string> = {
  slave_node: "Slave node",
  master_node: "Master node",
  gateway: "Gateway (Raspberry Pi)",
};

/** Pesan hasil submit, dirender tepat di bawah form yang memicunya. */
function FormMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
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

/** Baris satu device, dipakai di dua seksi (sudah diklaim & belum). */
function DeviceRow({ d }: { d: DeviceAdmin }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold text-ink">{d.device_code}</p>
        <p className="text-xs text-muted">
          {DEVICE_TYPE_LABEL[d.device_type]}
          {d.kolam_nama ? ` · Kolam: ${d.kolam_nama}` : ""}
        </p>
      </div>
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Clock className="h-3.5 w-3.5" />
        {d.last_seen_at
          ? `Terakhir kirim data: ${new Date(d.last_seen_at).toLocaleString("id-ID")}`
          : "Belum pernah kirim data"}
      </span>
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
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [deviceType, setDeviceType] = useState<Device["device_type"]>("slave_node");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<Message>(null);

  function loadDevices() {
    setLoadingList(true);
    api
      .listDevices()
      .then(setDevices)
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
        [{ ...created, kolam_id: null, kolam_nama: null }, ...list].sort((a, b) =>
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
            belum terklaim kolam mana pun; pemilik kolam yang klaim lewat kode
            ini dari halaman Dashboard.
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
                {Object.entries(DEVICE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
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
                  <DeviceRow key={d.id} d={d} />
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
                  <DeviceRow key={d.id} d={d} />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

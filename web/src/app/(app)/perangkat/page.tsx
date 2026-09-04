"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Cpu, Clock } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-store";
import { Device } from "@/lib/types";

type Message = { type: "ok" | "err"; text: string } | null;

const DEVICE_TYPE_LABEL: Record<Device["device_type"], string> = {
  slave_node: "Slave node (sensor per tingkat)",
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

  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [deviceCode, setDeviceCode] = useState("");
  const [deviceType, setDeviceType] = useState<Device["device_type"]>("slave_node");
  const [rackLabel, setRackLabel] = useState("");
  const [levelNumber, setLevelNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<Message>(null);

  function loadUnclaimed() {
    setLoadingList(true);
    api
      .listUnclaimedDevices()
      .then(setDevices)
      .catch((err: unknown) =>
        setListError(err instanceof Error ? err.message : "Gagal memuat daftar device.")
      )
      .finally(() => setLoadingList(false));
  }

  useEffect(() => {
    if (user?.role === "admin") loadUnclaimed();
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormMessage(null);
    setSubmitting(true);
    try {
      const created = await api.createDevice({
        device_code: deviceCode.trim(),
        device_type: deviceType,
        rack_label: rackLabel.trim() || null,
        level_number: levelNumber.trim() ? Number(levelNumber) : null,
      });
      setDevices((list) => [created, ...list]);
      setFormMessage({
        type: "ok",
        text: `Device '${created.device_code}' berhasil ditambahkan — siap diklaim ke kolam.`,
      });
      setDeviceCode("");
      setRackLabel("");
      setLevelNumber("");
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

  return (
    <>
      <Topbar
        title="Perangkat"
        subtitle="Lihat device yang belum diklaim & daftarkan device baru"
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
            Ganti INSERT manual ke database — device_code harus persis sama
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
            <Input
              label="Rak (opsional)"
              value={rackLabel}
              onChange={(e) => setRackLabel(e.target.value)}
              placeholder="mis. Rak A"
            />
            <Input
              label="Level/tingkat (opsional)"
              type="number"
              value={levelNumber}
              onChange={(e) => setLevelNumber(e.target.value)}
              placeholder="mis. 1"
            />
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

        <Card className="p-0">
          <div className="flex items-center gap-2.5 p-5 pb-0 sm:p-6 sm:pb-0">
            <Cpu className="h-5 w-5 text-brand-500" />
            <h3 className="font-display text-base font-semibold text-ink">
              Device belum diklaim
            </h3>
          </div>
          <div className="p-5 sm:p-6">
            {listError && (
              <p className="mb-4 rounded-lg bg-status-bahayaBg px-3.5 py-2.5 text-sm text-status-bahaya">
                {listError}
              </p>
            )}
            {loadingList ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : devices.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Tidak ada device menunggu klaim — semua device terdaftar sudah
                terhubung ke kolam.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-ink">
                        {d.device_code}
                      </p>
                      <p className="text-xs text-muted">
                        {DEVICE_TYPE_LABEL[d.device_type]}
                        {d.rack_label ? ` · ${d.rack_label}` : ""}
                        {d.level_number != null ? ` · level ${d.level_number}` : ""}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Clock className="h-3.5 w-3.5" />
                      {d.last_seen_at
                        ? `Terakhir kirim data: ${new Date(d.last_seen_at).toLocaleString("id-ID")}`
                        : "Belum pernah kirim data"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

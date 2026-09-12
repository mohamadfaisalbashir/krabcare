"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  History,
  BellRing,
  UserRound,
  LogOut,
  Menu,
  ChevronDown,
  Cpu,
} from "lucide-react";
import clsx from "clsx";
import Logo from "./Logo";
import { confirmLogout } from "@/lib/api";
import { isNavActive } from "@/lib/nav";
import { useUser } from "@/lib/user-store";
import { PARAM_KEYS, PARAM_UI, ParamKey } from "@/lib/parameter";
import { AMONIA_UI, LOG_PARAM_AMONIA, LogParam } from "@/lib/ammonia";
import { AMONIA_ICON, PARAM_ICON } from "@/lib/param-icons";
import { formatUnreadBadge, useUnreadCount } from "@/lib/notif-store";

const STORAGE_KEY = "sidebar_collapsed";

/**
 * Tiga aturan animasi buka/tutup panel ini:
 *
 * 1. Semua yang bergerak memakai durasi & kurva yang sama (`ease-smooth`).
 * 2. Tidak ada yang di-unmount di tengah animasi.
 * 3. Properti layout yang dianimasikan seminimal mungkin: cuma lebar <aside>
 *    dan tinggi submenu lewat trik grid 0fr->1fr. Label memakai opacity +
 *    transform, dan padding aside tetap supaya ikon tidak bergeser.
 *
 * Grafik recharts di panel dashboard ikut menggambar ulang saat lebar berubah;
 * itu ditangani prop `debounce` pada ResponsiveContainer, bukan di sini.
 */
const MOVE = "transition-all duration-300 ease-smooth motion-reduce:transition-none";

/** Kotak ikon 36px untuk setiap baris: tombol kuncup, item nav, tombol keluar.
 *  Ukuran seragam + padding aside tetap bikin ketiganya duduk pada sumbu X yang
 *  sama, dan saat kuncup (12 + 36 + 12 = 60px) ikonnya pas di tengah panel. */
const ICON_BOX = "flex h-9 w-9 shrink-0 items-center justify-center";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/log-historis",
    label: "Log historis",
    icon: History,
    // `param` adalah nama field backend (ph / temperature_c / salinity_ppt),
    // labelnya dari PARAM_UI supaya tidak ada string yang diduplikasi.
    children: [
      ...PARAM_KEYS.map((p) => ({ param: p as LogParam, label: PARAM_UI[p].short })),
      // Amonia di urutan terakhir karena ia turunan dari ketiga parameter di
      // atasnya.
      { param: LOG_PARAM_AMONIA as LogParam, label: AMONIA_UI.short },
    ],
  },
  { href: "/notifikasi", label: "Notifikasi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

/** Cuma dirender untuk role admin: lihat device belum diklaim & tambah device.
 *  Diketik eksplisit ke elemen NAV karena item dalam satu array literal saling
 *  meminjamkan properti opsional (children) lewat inferensi TS, sedangkan
 *  ADMIN_NAV_ITEM berdiri sendiri dan tanpa anotasi ini gagal type-check. */
const ADMIN_NAV_ITEM: (typeof NAV)[number] = { href: "/perangkat", label: "Perangkat", icon: Cpu };

/**
 * Label yang memudar, bukan menyusut. Cuma `opacity` + `translate-x`, dua
 * properti compositor tanpa layout; lebarnya dibiarkan alami dan terpotong
 * `overflow-x-hidden` di <aside>.
 *
 * Ada jeda saat membentang, supaya teks tidak tampil penuh sebelum panelnya
 * punya ruang. Saat menguncup jedanya nol, teks harus lenyap duluan.
 */
function CollapsingLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        "ml-1 whitespace-nowrap",
        "transition-[opacity,transform] duration-300 ease-smooth motion-reduce:transition-none",
        collapsed
          ? "pointer-events-none -translate-x-1 opacity-0 delay-0"
          : "translate-x-0 opacity-100 delay-100"
      )}
    >
      {children}
    </span>
  );
}

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useUser();
  // Admin tidak punya kolam, jadi Dashboard/Log historis/Notifikasi tidak
  // relevan; nav-nya cuma Perangkat + Profil. "Profil" diambil dari NAV yang
  // sama, bukan didefinisikan ulang.
  const navItems =
    user?.role === "admin"
      ? [ADMIN_NAV_ITEM, ...NAV.filter((item) => item.href === "/profil")]
      : NAV;

  // null selama pengambilan pertama. Badge tidak dirender sampai angkanya
  // diketahui, supaya tidak berkedip "0" lalu berubah.
  const unread = useUnreadCount();

  // Aman dari hydration mismatch: (app)/layout.tsx mengembalikan null sampai
  // `authorized` di-set di useEffect, jadi komponen ini tidak pernah dirender
  // di server maupun di render klien pertama.
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(STORAGE_KEY) === "1"
  );

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Halaman log memakai "ph" untuk param kosong atau tak dikenal
  // (log-historis/page.tsx:69-72). Ditiru di sini supaya /log-historis polos
  // menyalakan submenu "pH".
  const rawParam = searchParams.get("param");
  const activeParam: LogParam =
    rawParam === LOG_PARAM_AMONIA || PARAM_KEYS.includes(rawParam as ParamKey)
      ? (rawParam as LogParam)
      : "ph";

  return (
    <aside
      className={clsx(
        // sticky + h-screen: panel tetap setinggi layar saat konten digulir.
        // Tanpa ini ia memanjang mengikuti tinggi dokumen dan tombol Keluar
        // terdorong jauh ke bawah di halaman panjang.
        "sticky top-0 flex h-screen flex-col justify-between overflow-y-auto",
        // overflow-x-hidden wajib: overflow-y-auto memaksa sumbu X jadi `auto`,
        // dan label yang tetap ter-render memunculkan scrollbar mendatar saat
        // panel menguncup.
        "overflow-x-hidden",
        // bg-bg, bukan bg-surface: panel nav adalah lapisan latar di belakang
        // panel konten yang putih, seperti NavigationView WinUI 3.
        "border-r border-border bg-bg px-3 py-6",
        // Hanya lebar yang beranimasi. Padding tetap, supaya ikon diam di
        // tempat sementara panelnya melebar.
        "transition-[width] duration-300 ease-smooth motion-reduce:transition-none",
        collapsed ? "w-[3.75rem]" : "w-64",
        className
      )}
    >
      <div>
        <div className="flex items-center">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Bentangkan navigasi" : "Kuncupkan navigasi"}
            aria-expanded={!collapsed}
            className={clsx(
              ICON_BOX,
              "rounded-lg text-ink transition-colors duration-150 hover:bg-border/60 hover:text-ink"
            )}
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <CollapsingLabel collapsed={collapsed}>
            <Logo />
          </CollapsingLabel>
        </div>

        <div className="my-6 border-t border-border" />

        <nav className="space-y-1" aria-label="Navigasi utama">
          {navItems.map(({ href, label, icon: Icon, children }) => {
            const active = isNavActive(pathname, href);
            return (
              <NavGroup
                key={href}
                href={href}
                label={label}
                Icon={Icon}
                active={active}
                collapsed={collapsed}
                children_={children}
                activeParam={activeParam}
                badge={href === "/notifikasi" ? unread : null}
              />
            );
          })}
        </nav>
      </div>

      <button
        onClick={confirmLogout}
        title={collapsed ? "Keluar" : undefined}
        className={clsx(
          "flex items-center rounded-lg text-sm font-medium text-ink",
          "transition-colors duration-150 hover:bg-border/60 hover:text-status-bahaya"
        )}
      >
        <span className={ICON_BOX}>
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <CollapsingLabel collapsed={collapsed}>Keluar</CollapsingLabel>
      </button>
    </aside>
  );
}

function NavGroup({
  href,
  label,
  Icon,
  active,
  collapsed,
  children_,
  activeParam,
  badge,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
  collapsed: boolean;
  children_?: { param: LogParam; label: string }[];
  activeParam: LogParam;
  /** Jumlah belum dibaca. null = belum diketahui, 0 = kosong. Keduanya tidak dirender. */
  badge?: number | null;
}) {
  // Sentinel, bukan useEffect sinkronisasi: grup terbuka sendiri saat
  // halamannya aktif, tetap bisa dibuka manual, dan tidak ada state yang bisa
  // jatuh tidak sinkron dengan rute.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? active;

  const hasChildren = !!children_?.length;
  // Terbuka hanya saat panel terbentang; submenu tidak muat di rail 60px.
  // Terpisah dari `open` yang menyimpan niat pengguna, jadi submenu kembali
  // seperti semula begitu panel dibentangkan.
  const showChildren = hasChildren && open && !collapsed;

  return (
    <div>
      {/* Latar aktif dan hover ada di pembungkus, bukan di <Link>, supaya
          sorotan membentang sampai melewati chevron. Di <Link>, chevron berada
          di luar area berlatar dan tampak menggantung.
          Jangan tambahkan overflow-hidden, itu memotong outline fokus global. */}
      <div
        className={clsx(
          "relative flex items-center rounded-lg",
          "transition-colors duration-150",
          active ? "bg-brand-50" : "hover:bg-border/60"
        )}
      >
        {/* Indikator aksen ala WinUI3 NavigationView. Dekoratif, maknanya
            dibawa aria-current di bawah. Item non-aktif tetap merender span
            ini dalam keadaan menyusut supaya perpindahannya beranimasi. */}
        <span
          aria-hidden
          className={clsx(
            "absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-500",
            "transition duration-300 ease-smooth motion-reduce:transition-none",
            active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
          )}
        />
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={collapsed ? label : undefined}
          className={clsx(
            "flex min-w-0 flex-1 items-center rounded-lg text-sm font-medium",
            "transition-colors duration-150",
            active ? "text-brand-700" : "text-ink"
          )}
        >
          <span className={clsx(ICON_BOX, "relative")}>
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
            {/* Kuncup: titik saja, angka tidak muat di rail 60px. */}
            {collapsed && !!badge && (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-status-bahaya ring-2 ring-bg"
              />
            )}
          </span>
          <CollapsingLabel collapsed={collapsed}>{label}</CollapsingLabel>
          {!collapsed && !!badge && (
            <span
              className="ml-auto mr-2 flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-status-bahaya px-1.5 text-[11px] font-semibold text-white"
              aria-label={`${badge} belum dibaca`}
            >
              {formatUnreadBadge(badge)}
            </span>
          )}
        </Link>

        {hasChildren && !collapsed && (
          <button
            onClick={() => setOpenOverride(!open)}
            aria-label={`${open ? "Tutup" : "Buka"} submenu ${label}`}
            aria-expanded={open}
            // Tanpa latar hover sendiri: baris sudah punya, dua lapis terbaca
            // sebagai kotak di dalam kotak.
            className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink transition-colors duration-150 hover:text-ink"
          >
            <ChevronDown
              className={clsx(
                "h-4 w-4 transition-transform duration-300 ease-smooth motion-reduce:transition-none",
                open && "rotate-180"
              )}
              strokeWidth={2.2}
            />
          </button>
        )}
      </div>

      {hasChildren && (
        // Trik grid 0fr->1fr: tinggi beranimasi tanpa mengukur DOM dan tanpa
        // max-height tebakan. Anak grid wajib overflow-hidden, tanpa itu isinya
        // meluber saat barisnya 0fr.
        <div
          className={clsx(
            "grid",
            MOVE,
            showChildren
              ? "mt-1 grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-0.5" aria-hidden={!showChildren}>
              {children_!.map(({ param, label: childLabel }) => {
                const childActive = active && activeParam === param;
                // Ikon yang sama dengan kartu parameter dan panel prediksi.
                const ChildIcon =
                  param === LOG_PARAM_AMONIA ? AMONIA_ICON : PARAM_ICON[param];
                return (
                  <Link
                    key={param}
                    href={`${href}?param=${param}`}
                    // replace, bukan push: pil parameter di halaman juga memakai
                    // router.replace, jadi tombol Back berperilaku sama.
                    replace
                    // Tersembunyi tapi masih di DOM supaya bisa beranimasi, jadi
                    // harus dikeluarkan dari urutan Tab.
                    tabIndex={showChildren ? undefined : -1}
                    aria-current={childActive ? "page" : undefined}
                    className={clsx(
                      "relative ml-6 flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm",
                      "transition-colors duration-150 focus-visible:rounded-lg",
                      childActive
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink hover:bg-border/60 hover:text-ink"
                    )}
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        "absolute left-0 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-brand-500",
                        "transition duration-300 ease-smooth motion-reduce:transition-none",
                        childActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                      )}
                    />
                    {/* Sedikit lebih kecil dari ikon induk (18px) supaya hierarkinya
                        terbaca. Gaya goresannya sama. */}
                    <ChildIcon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                    {childLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

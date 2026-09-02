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
} from "lucide-react";
import clsx from "clsx";
import Logo from "./Logo";
import { confirmLogout } from "@/lib/api";
import { isNavActive } from "@/lib/nav";
import { PARAM_KEYS, PARAM_UI, ParamKey } from "@/lib/parameter";
import { PARAM_ICON } from "@/lib/param-icons";

const STORAGE_KEY = "sidebar_collapsed";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/log-historis",
    label: "Log Historis",
    icon: History,
    // Anak-anaknya menaut ke tampilan per-parameter yang sudah ada. `param`
    // adalah nama field mentah backend (ph / temperature_c / salinity_ppt),
    // labelnya diambil dari PARAM_UI supaya tidak ada string yang diduplikasi.
    children: PARAM_KEYS.map((p) => ({ param: p, label: PARAM_UI[p].short })),
  },
  { href: "/notifikasi", label: "Notifikasi & Prediksi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Aman dari hydration mismatch tanpa trik: (app)/layout.tsx mengembalikan null
  // sampai `authorized` di-set di dalam useEffect, jadi komponen ini tidak pernah
  // dirender di server maupun di render klien pertama. Lazy init karenanya hanya
  // berjalan di klien, dan tidak ada kedipan "terbuka lalu menguncup".
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

  // Halaman log memakai "ph" untuk param yang kosong atau tak dikenal
  // (log-historis/page.tsx:69-72). Ditiru di sini supaya /log-historis polos
  // menyalakan submenu "pH", sesuai apa yang benar-benar dirender halaman itu.
  const rawParam = searchParams.get("param");
  const activeParam: ParamKey = PARAM_KEYS.includes(rawParam as ParamKey)
    ? (rawParam as ParamKey)
    : "ph";

  return (
    <aside
      className={clsx(
        // sticky + h-screen: panel setinggi layar penuh yang tetap di tempat
        // saat konten digulir. Tanpa ini ia ikut memanjang mengikuti tinggi
        // dokumen, sehingga tombol Keluar terdorong jauh di bawah lipatan pada
        // halaman panjang seperti Log Historis.
        "sticky top-0 flex h-screen flex-col justify-between overflow-y-auto",
        // bg-bg, bukan bg-surface: panel nav adalah lapisan LATAR dan panel
        // konten yang putih, seperti NavigationView WinUI 3.
        "border-r border-border bg-bg py-6",
        "transition-[width,padding] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-16 px-2" : "w-64 px-4",
        className
      )}
    >
      <div>
        <div className={clsx("flex items-center gap-2", collapsed && "flex-col")}>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Bentangkan navigasi" : "Kuncupkan navigasi"}
            aria-expanded={!collapsed}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink/70 transition-colors duration-100 hover:bg-bg hover:text-ink"
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          {!collapsed && <Logo />}
        </div>

        <div className="my-6 border-t border-border" />

        <nav className="space-y-1" aria-label="Navigasi utama">
          {NAV.map(({ href, label, icon: Icon, children }) => {
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
              />
            );
          })}
        </nav>
      </div>

      <button
        onClick={confirmLogout}
        title={collapsed ? "Keluar" : undefined}
        className={clsx(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/60",
          "transition-colors duration-100 hover:bg-bg hover:text-status-bahaya",
          collapsed && "justify-center px-0"
        )}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
        {!collapsed && "Keluar"}
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
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
  collapsed: boolean;
  children_?: { param: ParamKey; label: string }[];
  activeParam: ParamKey;
}) {
  // Sentinel, bukan useEffect sinkronisasi: grup terbuka sendiri saat halamannya
  // aktif, tetap bisa dibuka manual dari halaman lain, dan tidak ada state yang
  // bisa jatuh tidak sinkron dengan rute.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? active;

  const hasChildren = !!children_?.length && !collapsed;

  return (
    <div>
      {/* Latar aktif/hover ada di PEMBUNGKUS, bukan di <Link>, supaya sorotan
          membentang utuh sampai melewati chevron. Kalau ditaruh di Link, chevron
          adalah saudara di luar area berlatar dan tampak menggantung.
          Jangan tambahkan overflow-hidden — itu memotong outline fokus global. */}
      <div
        className={clsx(
          "relative flex items-center rounded-lg",
          "transition-colors duration-100",
          active ? "bg-brand-50" : "hover:bg-bg"
        )}
      >
        {/* Indikator aksen ala WinUI3 NavigationView. Dekoratif —
            maknanya sudah dibawa aria-current di bawah. Item non-aktif
            tetap merender span ini dalam keadaan menyusut, supaya
            perpindahannya beranimasi tumbuh/menyusut, bukan mengedip. */}
        <span
          aria-hidden
          className={clsx(
            "absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-brand-500",
            "transition duration-200 ease-out motion-reduce:transition-none",
            active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
          )}
        />
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          title={collapsed ? label : undefined}
          className={clsx(
            "flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            "transition-colors duration-100 focus-visible:rounded-lg",
            collapsed && "justify-center px-0",
            active ? "text-brand-700" : "text-ink/70"
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2.2} />
          {!collapsed && label}
        </Link>

        {hasChildren && (
          <button
            onClick={() => setOpenOverride(!open)}
            aria-label={`${open ? "Tutup" : "Buka"} submenu ${label}`}
            aria-expanded={open}
            // Tanpa latar hover sendiri: baris sudah menyediakannya, dua lapis
            // akan terbaca sebagai kotak di dalam kotak.
            className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink/50 transition-colors duration-100 hover:text-ink"
          >
            <ChevronDown
              className={clsx(
                "h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none",
                open && "rotate-180"
              )}
              strokeWidth={2.2}
            />
          </button>
        )}
      </div>

      {hasChildren && open && (
        <div className="mt-1 space-y-0.5">
          {children_!.map(({ param, label: childLabel }) => {
            const childActive = active && activeParam === param;
            // Ikon yang sama dengan yang dipakai kartu parameter dan panel
            // prediksi, supaya satu parameter selalu dikenali lewat lambang
            // yang sama di seluruh aplikasi.
            const ChildIcon = PARAM_ICON[param];
            return (
              <Link
                key={param}
                href={`${href}?param=${param}`}
                // replace, bukan push: pil parameter di dalam halaman memakai
                // router.replace juga, jadi tombol Back berperilaku sama untuk
                // dua kontrol yang mengerjakan hal identik.
                replace
                aria-current={childActive ? "page" : undefined}
                className={clsx(
                  "relative ml-6 flex items-center gap-2.5 rounded-lg py-2 pl-4 pr-3 text-sm",
                  "transition-colors duration-100 focus-visible:rounded-lg",
                  childActive
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-ink/60 hover:bg-bg hover:text-ink"
                )}
              >
                <span
                  aria-hidden
                  className={clsx(
                    "absolute left-0 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-brand-500",
                    "transition duration-200 ease-out motion-reduce:transition-none",
                    childActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                  )}
                />
                {/* Sedikit lebih kecil dari ikon induk (18px) supaya hierarkinya
                    tetap terbaca, gaya goresan sama. */}
                <ChildIcon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
                {childLabel}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

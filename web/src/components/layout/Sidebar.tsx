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
 * Kunci kehalusan buka/tutup panel ini ada di tiga aturan:
 *
 * 1. SEMUA yang bergerak memakai durasi & kurva yang sama (`ease-smooth`).
 * 2. TIDAK ADA yang di-unmount di tengah animasi, dulu label & Logo hilang
 *    seketika sementara lebarnya beranimasi, dan itu yang terbaca patah-patah.
 * 3. Sesedikit mungkin properti LAYOUT yang dianimasikan. Yang tersisa cuma
 *    lebar <aside> (memang itu intinya) dan tinggi submenu lewat trik grid
 *    0fr→1fr. Label memakai opacity+transform saja. Padding aside dibuat tetap
 *    sehingga ikon tidak bergeser mendatar sama sekali selama panel melebar.
 *
 * Sisa jank terbesarnya justru bukan di berkas ini: grafik recharts di panel
 * detail dashboard ikut menggambar ulang tiap frame saat lebar berubah. Itu
 * ditangani prop `debounce` pada ResponsiveContainer, bukan di sini.
 */
const MOVE = "transition-all duration-300 ease-smooth motion-reduce:transition-none";

/** Kotak ikon 36px yang dipakai SETIAP baris, tombol kuncup, item nav, dan
 *  tombol keluar. Karena ukurannya seragam dan padding aside tetap, ketiganya
 *  duduk pada sumbu X yang sama, dan pada keadaan kuncup (12 + 36 + 12 = 60px)
 *  ikonnya tepat di tengah panel tanpa perlu `justify-center` yang berpindah. */
const ICON_BOX = "flex h-9 w-9 shrink-0 items-center justify-center";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/log-historis",
    label: "Log historis",
    icon: History,
    // Anak-anaknya menaut ke tampilan per-parameter yang sudah ada. `param`
    // adalah nama field mentah backend (ph / temperature_c / salinity_ppt),
    // labelnya diambil dari PARAM_UI supaya tidak ada string yang diduplikasi.
    children: [
      ...PARAM_KEYS.map((p) => ({ param: p as LogParam, label: PARAM_UI[p].short })),
      // Amonia menutup daftar, bukan menyelip di tengah: ia turunan dari ketiga
      // parameter di atasnya, jadi urutannya ikut menjelaskan asalnya.
      { param: LOG_PARAM_AMONIA as LogParam, label: AMONIA_UI.short },
    ],
  },
  { href: "/notifikasi", label: "Notifikasi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

/** Cuma dirender untuk role admin, lihat device belum diklaim & tambah device baru.
 *  Diketik eksplisit ke elemen NAV: item-item dalam SATU array literal saling
 *  "meminjamkan" properti opsional (children) satu sama lain lewat inferensi TS,
 *  tapi ADMIN_NAV_ITEM dideklarasikan terpisah jadi tidak ikut kebagian itu,
 *  tanpa anotasi ini destructuring `children` di NavGroup gagal type-check. */
const ADMIN_NAV_ITEM: (typeof NAV)[number] = { href: "/perangkat", label: "Perangkat", icon: Cpu };

/**
 * Label yang memudar, bukan menyusut.
 *
 * Sebelumnya ia menganimasikan `max-width`, properti LAYOUT, jadi setiap frame
 * memaksa hitung ulang tata letak seluruh sidebar sementara panelnya juga
 * sedang melebar. Sekarang hanya `opacity` + `translate-x`, dua properti yang
 * dikerjakan compositor tanpa layout sama sekali. Lebarnya dibiarkan alami dan
 * TERPOTONG oleh `overflow-x-hidden` di <aside>, tidak ada lebar yang perlu
 * diinterpolasi.
 *
 * Jeda saat membentang disengaja: tanpa itu teks sudah tampil penuh sebelum
 * panelnya punya ruang, dan yang terlihat adalah huruf yang terjepit tepi.
 * Saat menguncup jedanya nol, teks harus lenyap duluan, bukan ikut terpotong.
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
  // Admin gak punya kolam sendiri, jadi Dashboard/Log historis/Notifikasi
  // (semuanya berbasis kepemilikan kolam) gak relevan buatnya, nav-nya cuma
  // Perangkat (kelola device) + Profil. Item "Profil" diambil dari NAV yang
  // sama (bukan didefinisikan ulang) supaya tidak ada dua sumber kebenaran.
  const navItems =
    user?.role === "admin"
      ? [ADMIN_NAV_ITEM, ...NAV.filter((item) => item.href === "/profil")]
      : NAV;

  // null selama pengambilan pertama, badge sengaja tidak dirender sampai
  // angkanya benar-benar diketahui, supaya tidak berkedip "0" lalu berubah.
  const unread = useUnreadCount();

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
  const activeParam: LogParam =
    rawParam === LOG_PARAM_AMONIA || PARAM_KEYS.includes(rawParam as ParamKey)
      ? (rawParam as LogParam)
      : "ph";

  return (
    <aside
      className={clsx(
        // sticky + h-screen: panel setinggi layar penuh yang tetap di tempat
        // saat konten digulir. Tanpa ini ia ikut memanjang mengikuti tinggi
        // dokumen, sehingga tombol Keluar terdorong jauh di bawah lipatan pada
        // halaman panjang seperti Log historis.
        "sticky top-0 flex h-screen flex-col justify-between overflow-y-auto",
        // overflow-x-hidden WAJIB dan bukan kosmetik: overflow-y-auto memaksa
        // sumbu X ikut jadi `auto`, dan label yang kini tetap ter-render (bukan
        // di-unmount lagi) akan memunculkan scrollbar mendatar saat menguncup.
        "overflow-x-hidden",
        // bg-bg, bukan bg-surface: panel nav adalah lapisan LATAR dan panel
        // konten yang putih, seperti NavigationView WinUI 3.
        "border-r border-border bg-bg px-3 py-6",
        // HANYA lebar yang beranimasi. Padding sengaja tetap, itu yang membuat
        // ikon diam di tempat sementara panelnya melebar.
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
  /** Jumlah belum dibaca. null = belum diketahui (jangan dirender), 0 = kosong (jangan dirender juga). */
  badge?: number | null;
}) {
  // Sentinel, bukan useEffect sinkronisasi: grup terbuka sendiri saat halamannya
  // aktif, tetap bisa dibuka manual dari halaman lain, dan tidak ada state yang
  // bisa jatuh tidak sinkron dengan rute.
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? active;

  const hasChildren = !!children_?.length;
  // Terbuka HANYA saat panel terbentang: submenu tidak muat di rail selebar
  // 60px. Ini kondisi TAMPILAN, terpisah dari `open` yang menyimpan niat
  // pengguna, jadi submenu kembali seperti semula begitu panel dibentangkan.
  const showChildren = hasChildren && open && !collapsed;

  return (
    <div>
      {/* Latar aktif/hover ada di PEMBUNGKUS, bukan di <Link>, supaya sorotan
          membentang utuh sampai melewati chevron. Kalau ditaruh di Link, chevron
          adalah saudara di luar area berlatar dan tampak menggantung.
          Jangan tambahkan overflow-hidden, itu memotong outline fokus global. */}
      <div
        className={clsx(
          "relative flex items-center rounded-lg",
          "transition-colors duration-150",
          active ? "bg-brand-50" : "hover:bg-border/60"
        )}
      >
        {/* Indikator aksen ala WinUI3 NavigationView. Dekoratif,
            maknanya sudah dibawa aria-current di bawah. Item non-aktif
            tetap merender span ini dalam keadaan menyusut, supaya
            perpindahannya beranimasi tumbuh/menyusut, bukan mengedip. */}
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
            // Tanpa latar hover sendiri: baris sudah menyediakannya, dua lapis
            // akan terbaca sebagai kotak di dalam kotak.
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
        // Trik grid 0fr→1fr: tingginya beranimasi tanpa mengukur DOM dan tanpa
        // max-height yang harus ditebak. Anak grid WAJIB overflow-hidden,
        // tanpa itu isinya meluber keluar saat barisnya berukuran 0fr.
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
                // Ikon yang sama dengan yang dipakai kartu parameter dan panel
                // prediksi, supaya satu parameter selalu dikenali lewat lambang
                // yang sama di seluruh aplikasi.
                const ChildIcon =
                  param === LOG_PARAM_AMONIA ? AMONIA_ICON : PARAM_ICON[param];
                return (
                  <Link
                    key={param}
                    href={`${href}?param=${param}`}
                    // replace, bukan push: pil parameter di dalam halaman memakai
                    // router.replace juga, jadi tombol Back berperilaku sama untuk
                    // dua kontrol yang mengerjakan hal identik.
                    replace
                    // Tersembunyi tapi masih di DOM (itulah yang membuatnya bisa
                    // beranimasi), jadi harus dikeluarkan dari urutan Tab,
                    // kalau tidak fokus bisa mendarat di elemen tak terlihat.
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
                        tetap terbaca, gaya goresan sama. */}
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, History, BellRing, UserRound, Cpu } from "lucide-react";
import clsx from "clsx";
import { isNavActive } from "@/lib/nav";
import { useUser } from "@/lib/user-store";
import { formatUnreadBadge, useUnreadCount } from "@/lib/notif-store";

// Label lebih pendek dari Sidebar, ruang horizontalnya jauh lebih sempit.
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/log-historis", label: "Log", icon: History },
  { href: "/notifikasi", label: "Notifikasi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

/** Cuma dirender untuk role admin, sama seperti Sidebar. */
const ADMIN_NAV_ITEM = { href: "/perangkat", label: "Device", icon: Cpu };

export default function MobileNav() {
  const pathname = usePathname();
  const user = useUser();
  // Sama seperti Sidebar: admin tidak punya kolam, jadi cuma Perangkat + Profil.
  const navItems =
    user?.role === "admin"
      ? [ADMIN_NAV_ITEM, ...NAV.filter((item) => item.href === "/profil")]
      : NAV;
  const unread = useUnreadCount();
  const index = navItems.findIndex(({ href }) => isNavActive(pathname, href));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Navigasi utama"
    >
      {/* Satu latar + bar atas yang bergeser antar tab, pola sama dengan
          ParamSwitch di RakDetail.tsx. Latar per tab berganti seketika dan
          terlihat patah saat pindah halaman. */}
      <span
        aria-hidden
        className={clsx(
          "absolute inset-y-0 left-0 bg-brand-50 transition-transform duration-300 ease-smooth motion-reduce:transition-none",
          index < 0 && "opacity-0"
        )}
        style={{ width: `${100 / navItems.length}%`, transform: `translateX(${Math.max(0, index) * 100}%)` }}
      >
        <span className="absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-full bg-brand-500" />
      </span>
      {navItems.map(({ href, label, icon: Icon }, i) => {
        const active = i === index;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              // basis-0 + min-w-0: lebar tiap tab sama persis, tidak ikut panjang label.
              "relative flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              "transition-colors duration-300",
              active ? "text-aksen-kuat" : "text-muted"
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {href === "/notifikasi" && !!unread && (
                <span
                  className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-bahaya px-1 text-[9px] font-semibold text-surface"
                  aria-label={`${unread} belum dibaca`}
                >
                  {formatUnreadBadge(unread)}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

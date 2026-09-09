"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, History, BellRing, UserRound, Cpu } from "lucide-react";
import clsx from "clsx";
import { isNavActive } from "@/lib/nav";
import { useUser } from "@/lib/user-store";
import { formatUnreadBadge, useUnreadCount } from "@/lib/notif-store";

// Label sengaja lebih pendek dari Sidebar, ruang horizontalnya jauh lebih sempit.
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
  // Sama seperti Sidebar: admin cuma butuh Perangkat + Profil, gak punya
  // kolam sendiri buat Dashboard/Log/Notifikasi.
  const navItems =
    user?.role === "admin"
      ? [ADMIN_NAV_ITEM, ...NAV.filter((item) => item.href === "/profil")]
      : NAV;
  const unread = useUnreadCount();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Navigasi utama"
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              "transition-colors duration-100",
              active ? "bg-brand-50 text-brand-700" : "text-muted"
            )}
          >
            {/* Bar bawah horizontal, jadi aksennya di sisi ATAS tab dan
                tumbuh melebar (scale-x), bukan di kiri seperti sidebar. */}
            <span
              aria-hidden
              className={clsx(
                "absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-full bg-brand-500",
                "transition duration-200 ease-out motion-reduce:transition-none",
                active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
              )}
            />
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {href === "/notifikasi" && !!unread && (
                <span
                  className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-status-bahaya px-1 text-[9px] font-semibold text-white"
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

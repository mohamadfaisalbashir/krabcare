"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, History, BellRing, UserRound } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/log-historis", label: "Log", icon: History },
  { href: "/notifikasi", label: "Notifikasi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface sm:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-brand-600" : "text-muted"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={2.2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

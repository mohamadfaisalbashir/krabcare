"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  BellRing,
  UserRound,
  LogOut,
} from "lucide-react";
import clsx from "clsx";
import Logo from "./Logo";
import { confirmLogout } from "@/lib/api";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/log-historis", label: "Log Historis", icon: History },
  { href: "/notifikasi", label: "Notifikasi & Prediksi", icon: BellRing },
  { href: "/profil", label: "Profil", icon: UserRound },
];

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={clsx(
        "flex h-full flex-col justify-between border-r border-border bg-surface px-4 py-6",
        className
      )}
    >
      <div>
        <div className="px-2">
          <Logo />
        </div>
        <div className="ripple-rule my-6" />
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink/70 hover:bg-bg hover:text-ink"
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <button
        onClick={confirmLogout}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-bg hover:text-status-bahaya"
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={2.2} />
        Keluar
      </button>
    </aside>
  );
}

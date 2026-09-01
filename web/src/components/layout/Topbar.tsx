"use client";

import { useEffect, useState } from "react";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { User } from "@/lib/types";

export default function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Backend TokenOut tidak membawa data user — diambil terpisah lewat GET /auth/me.
    api.getMe().then(setUser).catch(() => {});
  }, []);

  const initial = user?.nama.charAt(0).toUpperCase() ?? "…";

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface/80 px-5 py-4 backdrop-blur sm:px-8">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink sm:text-2xl">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          {user ? (
            <>
              <p className="text-sm font-medium text-ink">{user.nama}</p>
              <p className="text-xs text-muted">{user.email}</p>
            </>
          ) : (
            <div className="flex flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-semibold text-white">
          {initial}
        </div>
      </div>
    </header>
  );
}

import { mockUser } from "@/lib/mock-data";

export default function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const initial = mockUser.namaLengkap.charAt(0).toUpperCase();
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
          <p className="text-sm font-medium text-ink">{mockUser.namaLengkap}</p>
          <p className="text-xs text-muted">{mockUser.namaTambak}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 font-display text-sm font-semibold text-white">
          {initial}
        </div>
      </div>
    </header>
  );
}

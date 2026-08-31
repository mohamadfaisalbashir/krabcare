import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar className="hidden w-64 shrink-0 sm:flex" />
      <div className="flex min-h-screen flex-1 flex-col pb-16 sm:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}

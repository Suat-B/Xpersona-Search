"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardSidebarNav } from "@/components/layout/DashboardSidebarNav";
import { MobileDashboardNav } from "@/components/layout/MobileDashboardNav";
import { AIFirstBanner } from "@/components/ui/AIFirstBanner";

function isGamesRoute(pathname: string | null): boolean {
  return !!pathname?.startsWith("/games");
}

interface DashboardChromeProps {
  displayName: string;
  isAdmin?: boolean;
  children: React.ReactNode;
}

/**
 * Conditionally renders dashboard chrome. On /games/* routes we render only children
 * for an immersive full-screen trading terminal experience.
 */
export function DashboardChrome({
  displayName,
  isAdmin = false,
  children,
}: DashboardChromeProps) {
  const pathname = usePathname();
  const onGamesRoute = isGamesRoute(pathname);

  if (onGamesRoute) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full bg-black">
      <MobileDashboardNav displayName={displayName} isAdmin={isAdmin} />
      <aside className="scroll-stable-layer dashboard-sidebar hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-[var(--border)] overflow-x-hidden">
        <div className="absolute inset-0 bg-[var(--bg-matte)]/80 backdrop-blur-xl" />
        <div className="relative flex h-full flex-col">
          <div className="h-20 flex items-center px-6 border-b border-[var(--border)]">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  Xpersona
                </span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  AI-First Probability Game
                </span>
              </div>
            </Link>
          </div>
          <DashboardSidebarNav isAdmin={isAdmin} />
          <div className="p-4 border-t border-[var(--border)]">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-[var(--border)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#0ea5e9]/80">
                <span className="text-sm font-semibold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-xs text-[var(--text-tertiary)] truncate">
                  Logged in as {displayName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <main className="scroll-contain-paint flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-7xl p-4 sm:p-6 md:p-8 space-y-6">
          <AIFirstBanner />
          {children}
        </div>
      </main>
    </div>
  );
}

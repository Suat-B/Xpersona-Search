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
  userEmail?: string | null;
  isAdmin?: boolean;
  children: React.ReactNode;
}

/**
 * Conditionally renders dashboard chrome. On /games/* routes we render only children
 * for an immersive full-screen trading terminal experience.
 */
export function DashboardChrome({
  displayName,
  userEmail = null,
  isAdmin = false,
  children,
}: DashboardChromeProps) {
  const pathname = usePathname();
  const onGamesRoute = isGamesRoute(pathname);

  if (onGamesRoute) {
    return <>{children}</>;
  }

  return (
    <div className="dashboard-theme flex min-h-screen w-full flex-col md:flex-row bg-[var(--dash-bg)]">
      <MobileDashboardNav displayName={displayName} isAdmin={isAdmin} />
      <aside className="scroll-stable-layer dashboard-sidebar hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-[var(--dash-divider)] overflow-x-hidden bg-[var(--dash-bg)]">
        <div className="relative flex h-full flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-[var(--dash-divider)]">
            <Link href="/" className="flex items-center gap-3 group mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#0077b6] shadow-lg shadow-[#0ea5e9]/20 group-hover:shadow-[#0ea5e9]/40 transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  Xpersona
                </span>
                <span className="text-[10px] font-medium text-[var(--dash-text-secondary)] uppercase tracking-wider">
                  AI-First Probability Game
                </span>
              </div>
            </Link>
            <div className="pt-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{displayName}</span>
                <svg className="w-3.5 h-3.5 text-[var(--dash-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
              <p className="text-xs text-[var(--dash-text-secondary)] truncate mt-0.5">
                {userEmail ? `Free Plan - ${userEmail}` : "Free Plan"}
              </p>
            </div>
          </div>
          <DashboardSidebarNav isAdmin={isAdmin} />
        </div>
      </aside>
      <main className="scroll-contain-paint relative z-0 flex-1 min-h-0 overflow-y-auto bg-[var(--dash-bg)]">
        <div className="w-full max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 space-y-6 min-w-0 sm:overflow-x-hidden">
          <AIFirstBanner />
          {children}
        </div>
      </main>
    </div>
  );
}

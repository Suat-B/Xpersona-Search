"use client";

import Link from "next/link";
import { TradingSidebarNav } from "@/components/layout/TradingSidebarNav";
import { TradingMobileNav } from "@/components/layout/TradingMobileNav";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";

interface TradingChromeProps {
  displayName: string;
  userEmail?: string | null;
  isAdmin?: boolean;
  isPermanent?: boolean;
  children: React.ReactNode;
}

/**
 * Trading service chrome. Sidebar with marketplace-focused nav.
 */
export function TradingChrome({
  displayName,
  userEmail = null,
  isAdmin = false,
  isPermanent = false,
  children,
}: TradingChromeProps) {
  return (
    <div className="dashboard-theme flex min-h-screen w-full flex-col md:flex-row bg-[var(--dash-bg)]">
      <TradingMobileNav
        displayName={displayName}
        isAdmin={isAdmin}
        isPermanent={isPermanent}
      />
      <aside className="scroll-stable-layer dashboard-sidebar hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-[var(--dash-divider)] overflow-x-hidden bg-[var(--dash-bg)]">
        <div className="relative flex h-full flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-[var(--dash-divider)]">
            <Link href="/trading" className="flex items-center gap-3 group mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#30d158] to-[#248a3d] shadow-lg shadow-[#30d158]/20 group-hover:shadow-[#30d158]/40 transition-shadow">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                Xpersona
              </span>
            </Link>
            <UserAccountMenu
              displayName={displayName}
              userEmail={userEmail}
              isPermanent={isPermanent}
            />
          </div>
          <TradingSidebarNav />
        </div>
      </aside>
      <main className="scroll-contain-paint relative z-0 flex-1 min-h-0 overflow-y-auto bg-[var(--dash-bg)]">
        <div className="w-full max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 space-y-6 min-w-0 sm:overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

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
  accountType?: string | null;
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
  accountType = null,
  children,
}: TradingChromeProps) {
  return (
    <div className="flex h-[100dvh] min-h-dvh w-full flex-col overflow-hidden bg-black text-white md:flex-row">
      <TradingMobileNav
        displayName={displayName}
        isAdmin={isAdmin}
        isPermanent={isPermanent}
      />
      <aside className="scroll-stable-layer hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-white overflow-x-hidden bg-black">
        <div className="relative flex h-full flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-white">
            <Link href="/trading" className="block mb-4">
              <span className="text-lg font-bold tracking-tight text-white">
                Xpersona
              </span>
            </Link>
            <UserAccountMenu
              displayName={displayName}
              userEmail={userEmail}
              isPermanent={isPermanent}
              accountType={accountType}
            />
          </div>
          <TradingSidebarNav />
        </div>
      </aside>
      <main className="scroll-contain-paint relative z-0 flex-1 min-h-0 overflow-y-auto bg-black">
        <div className="w-full max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 space-y-6 min-w-0 sm:overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

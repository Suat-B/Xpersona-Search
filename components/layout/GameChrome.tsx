"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GameSidebarNav } from "@/components/layout/GameSidebarNav";
import { MobileDashboardNav } from "@/components/layout/MobileDashboardNav";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";

function isGamesRoute(pathname: string | null): boolean {
  return !!pathname?.startsWith("/games");
}

interface GameChromeProps {
  displayName: string;
  userEmail?: string | null;
  isAdmin?: boolean;
  isPermanent?: boolean;
  accountType?: string | null;
  children: React.ReactNode;
}

export function GameChrome({
  displayName,
  userEmail = null,
  isAdmin = false,
  isPermanent = false,
  accountType = null,
  children,
}: GameChromeProps) {
  const pathname = usePathname();
  const onGamesRoute = isGamesRoute(pathname);

  if (onGamesRoute) {
    return <>{children}</>;
  }

  return (
    <div className="dashboard-theme flex h-[100dvh] min-h-dvh w-full flex-col overflow-hidden bg-[var(--dash-bg)] md:flex-row">
      <MobileDashboardNav
        displayName={displayName}
        isAdmin={isAdmin}
        isPermanent={isPermanent}
        service="game"
      />
      <aside className="scroll-stable-layer dashboard-sidebar hidden w-[280px] min-w-[280px] flex-col md:flex sticky top-0 h-screen border-r border-[var(--dash-divider)] overflow-x-hidden bg-[var(--dash-bg)]">
        <div className="relative flex h-full flex-col">
          <div className="px-6 pt-6 pb-4 border-b border-[var(--dash-divider)]">
            <Link href="/" className="block mb-4">
              <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
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
          <GameSidebarNav isAdmin={isAdmin} />
        </div>
      </aside>
      <main className="scroll-contain-paint relative z-0 flex-1 min-h-0 overflow-y-auto overscroll-y-contain bg-[var(--dash-bg)]">
        <div className="w-full max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 space-y-6 min-w-0 sm:overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

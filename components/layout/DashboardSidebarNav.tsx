"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAiConnectionStatus } from "@/lib/hooks/use-ai-connection-status";
import { HeartbeatIndicator } from "@/components/ui/HeartbeatIndicator";

const ICONS = {
  dice: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  trading: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  deposit: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
    </svg>
  ),
  withdraw: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  strategies: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  api: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  ),
  connectAi: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  transactions: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
} as const;

const NAV_GROUPS = [
  {
    label: "Account",
    links: [
      { href: "/", label: "Home", icon: "home" as const, exact: true },
      { href: "/games/dice", label: "Open Game", icon: "dice" as const, exact: true },
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const, exact: true },
    ],
  },
  {
    label: "Trading",
    links: [
      { href: "/trading", label: "Marketplace", icon: "trading" as const, exact: false },
    ],
  },
  {
    label: "Funds",
    links: [
      { href: "/dashboard/connect-ai", label: "Connect AI", icon: "connectAi" as const, exact: false },
      { href: "/dashboard/deposit", label: "Deposit", icon: "deposit" as const, exact: true },
      { href: "/dashboard/withdraw", label: "Withdraw", icon: "withdraw" as const, exact: true },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/dashboard/strategies", label: "Strategies", icon: "strategies" as const, exact: false },
      { href: "/dashboard/api", label: "API", icon: "api" as const, exact: false },
    ],
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface DashboardSidebarNavProps {
  isAdmin?: boolean;
}

export function DashboardSidebarNav({ isAdmin = false }: DashboardSidebarNavProps) {
  const pathname = usePathname();
  const { hasApiKey } = useAiConnectionStatus();

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-sidebar">
      {NAV_GROUPS.map((group, groupIdx) => (
        <div key={group.label} className={groupIdx > 0 ? "mt-6 pt-4 border-t border-[var(--dash-divider)]" : ""}>
          <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.links.map(({ href, label, icon, exact }) => {
              const active = isActive(pathname ?? "", href, exact);
              const isConnectAi = href === "/dashboard/connect-ai";
              const aiConnected = isConnectAi && hasApiKey === true;
              const displayLabel = isConnectAi && hasApiKey === true ? "AI connected" : label;

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-[var(--dash-nav-active)] text-white"
                      : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white",
                    aiConnected && "text-[#30d158]"
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                      active
                        ? aiConnected ? "bg-[#30d158]/20 text-[#30d158]" : "text-white"
                        : "text-[var(--dash-text-secondary)] group-hover:text-white",
                      aiConnected && !active && "group-hover:text-[#30d158]"
                    )}
                  >
                    {ICONS[icon]}
                  </span>
                  <span className="flex-1">{displayLabel}</span>
                  {active && !aiConnected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                  )}
                  {aiConnected && <HeartbeatIndicator />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      
      {isAdmin && (
        <div className="mt-6 pt-4 border-t border-[var(--dash-divider)]">
          <Link
            href="/admin"
            className={cn(
              "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
              (pathname ?? "").startsWith("/admin")
                ? "bg-[var(--dash-nav-active)] text-amber-400"
                : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-amber-400"
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                (pathname ?? "").startsWith("/admin")
                  ? "text-amber-400"
                  : "text-[var(--dash-text-secondary)] group-hover:text-amber-400"
              )}
            >
              {ICONS.admin}
            </span>
            <span className="flex-1">Admin</span>
          </Link>
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-[var(--dash-divider)]">
        <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider">
          Support
        </p>
        <div className="space-y-1">
        <Link
          href="/dashboard/transactions"
          className={cn(
            "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
            (pathname ?? "").startsWith("/dashboard/transactions")
              ? "bg-[var(--dash-nav-active)] text-white"
              : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
          )}
        >
          <span 
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
              (pathname ?? "").startsWith("/dashboard/transactions")
                ? "text-[var(--accent-blue)]"
                : "text-[var(--dash-text-secondary)] group-hover:text-white"
            )}
          >
            {ICONS.transactions}
          </span>
          <span className="flex-1">Transactions</span>
        </Link>

        <Link
          href="/dashboard/provably-fair"
          className={cn(
            "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-1",
            (pathname ?? "").startsWith("/dashboard/provably-fair")
              ? "bg-[var(--dash-nav-active)] text-white"
              : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
          )}
        >
          <span 
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
              (pathname ?? "").startsWith("/dashboard/provably-fair")
                ? "text-emerald-400"
                : "text-[var(--dash-text-secondary)] group-hover:text-white"
            )}
          >
            {ICONS.shield}
          </span>
          <span className="flex-1">Provably Fair</span>
        </Link>
        
        </div>
      </div>
    </nav>
  );
}

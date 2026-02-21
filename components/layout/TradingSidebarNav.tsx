"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getGameUrl } from "@/lib/service-urls";

const ICONS = {
  trading: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  developer: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  profile: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
  transactions: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  dice: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
} as const;

const TRADING_NAV_GROUPS = [
  {
    label: "Marketplace",
    links: [
      { href: "/trading", label: "Browse strategies", icon: "trading" as const, exact: false },
      { href: "/trading/developer", label: "Developer", icon: "developer" as const, exact: false },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/dashboard/profile", label: "Profile", icon: "profile" as const, exact: true },
    ],
  },
  {
    label: "Funds",
    links: [
      { href: "/dashboard/deposit", label: "Deposit", icon: "deposit" as const, exact: true },
      { href: "/dashboard/withdraw", label: "Withdraw", icon: "withdraw" as const, exact: true },
    ],
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function TradingSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-sidebar">
      {TRADING_NAV_GROUPS.map((group, groupIdx) => (
        <div key={group.label} className={groupIdx > 0 ? "mt-6 pt-4 border-t border-[var(--dash-divider)]" : ""}>
          <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.links.map(({ href, label, icon, exact }) => {
              const active = isActive(pathname ?? "", href, exact);

              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-[var(--dash-nav-active)] text-white"
                      : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                      active ? "text-white" : "text-[var(--dash-text-secondary)] group-hover:text-white"
                    )}
                  >
                    {ICONS[icon]}
                  </span>
                  <span className="flex-1">{label}</span>
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-6 pt-4 border-t border-[var(--dash-divider)]">
        <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider">
          Game
        </p>
        <a
          href={getGameUrl("/")}
          className="group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white transition-all duration-200"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--dash-text-secondary)] group-hover:text-white">
            {ICONS.dice}
          </span>
          <span className="flex-1">Play game</span>
          <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

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
            href="/dashboard/settings"
            className={cn(
              "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-1",
              (pathname ?? "").startsWith("/dashboard/settings")
                ? "bg-[var(--dash-nav-active)] text-white"
                : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200",
                (pathname ?? "").startsWith("/dashboard/settings")
                  ? "text-[var(--accent-purple)]"
                  : "text-[var(--dash-text-secondary)] group-hover:text-white"
              )}
            >
              {ICONS.settings}
            </span>
            <span className="flex-1">Settings</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

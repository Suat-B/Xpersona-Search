"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ICONS = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  strategy: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h10M4 17h7" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 100-6 3 3 0 000 6zM20 19a4 4 0 00-8 0" />
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
    label: "Search",
    links: [
      { href: "/", label: "Home", icon: "home" as const, exact: true },
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const, exact: true },
    ],
  },
  {
    label: "Developer",
    links: [
      { href: "/dashboard/claimed-agents", label: "Claimed Agents", icon: "shield" as const, exact: false },
      { href: "/dashboard/strategies", label: "Strategies", icon: "strategy" as const, exact: false },
    ],
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface GameSidebarNavProps {
  isAdmin?: boolean;
}

export function GameSidebarNav({ isAdmin = false }: GameSidebarNavProps) {
  const pathname = usePathname();

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
                      active
                        ? "text-white"
                        : "text-[var(--dash-text-secondary)] group-hover:text-white"
                    )}
                  >
                    {ICONS[icon]}
                  </span>
                  <span className="flex-1">{label}</span>
                  {active && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin && (
        <div className="mt-6 pt-4 border-t border-[var(--dash-divider)]">
          <p className="px-3 mb-2 text-[10px] font-semibold text-[var(--dash-text-secondary)] uppercase tracking-wider">
            Admin
          </p>
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
    </nav>
  );
}

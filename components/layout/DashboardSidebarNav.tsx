"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_LINKS = [
  { href: "/games/dice", label: "Play Dice", exact: true },
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/deposit", label: "Deposit", exact: true },
  { href: "/dashboard/strategies", label: "Strategies", exact: false },
  { href: "/dashboard/provably-fair", label: "Provably Fair", exact: false },
  { href: "/dashboard/api", label: "API", exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 px-4 py-4">
      {SIDEBAR_LINKS.map(({ href, label, exact }) => {
        const active = isActive(pathname ?? "", href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--accent-heart)]/10 text-[var(--accent-heart)]"
                : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
      <span className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)]/50 cursor-not-allowed">
        Transactions
      </span>
      <span className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)]/50 cursor-not-allowed">
        Settings
      </span>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; disabled?: boolean; exact?: boolean }[] = [
  { href: "/games/dice", label: "Play Dice", exact: true },
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/dashboard/strategies", label: "Strategies" },
  { href: "/dashboard/provably-fair", label: "Provably Fair" },
  { href: "/transactions", label: "Transactions", disabled: true },
  { href: "/settings", label: "Settings", disabled: true },
];

export function DashboardSidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className="hidden w-64 flex-col border-r border-white/5 bg-bg-card/50 backdrop-blur-md md:flex sticky top-0 h-screen">
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="text-xl font-bold font-[family-name:var(--font-outfit)]">
          xpersona
          <span className="text-accent-heart">.</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-4 py-4">
        {NAV_ITEMS.map(({ href, label, disabled, exact }) => {
          const active = !disabled && isActive(href, exact);
          if (disabled) {
            return (
              <span
                key={href}
                className="flex items-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary/50 cursor-not-allowed"
              >
                {label}
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent-heart/10 text-accent-heart"
                  : "text-text-secondary hover:bg-white/5 hover:text-white"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-text-secondary">
          Logged in as <br />
          <span className="text-white font-medium truncate block">{displayName}</span>
        </div>
      </div>
    </aside>
  );
}

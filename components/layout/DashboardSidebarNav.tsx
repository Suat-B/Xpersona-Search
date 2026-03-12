"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const PLAYGROUND_ICON = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l2.3 4.66L19.5 9l-3.75 3.65.88 5.16L12 15.37l-4.63 2.44.88-5.16L4.5 9l5.2-1.34L12 3z" />
  </svg>
);

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardSidebarNav() {
  const pathname = usePathname();
  const playgroundHref = "/dashboard/playground";
  const active = isActive(pathname ?? "", playgroundHref);

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-sidebar">
      <Link
        href={playgroundHref}
        className={cn(
          "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-[var(--dash-nav-active)] text-white"
            : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200",
            active ? "text-white" : "text-[var(--dash-text-secondary)] group-hover:text-white"
          )}
        >
          {PLAYGROUND_ICON}
        </span>
        <span className="flex-1">Playground AI</span>
        {active && <div className="h-1.5 w-1.5 rounded-full bg-[#0ea5e9]" />}
      </Link>
    </nav>
  );
}

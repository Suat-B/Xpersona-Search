"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useIsPermanent } from "@/lib/hooks/use-is-permanent";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAiConnectionStatus } from "@/lib/hooks/use-ai-connection-status";
import { HeartbeatIndicator } from "@/components/ui/HeartbeatIndicator";
import { getTradingUrl } from "@/lib/service-urls";
import type { Service } from "@/lib/subdomain";

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
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  profile: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
} as const;

const GAME_LINKS = [
  { href: "/", label: "Home", icon: "home" as const, exact: true, external: false },
  { href: "/games/dice", label: "Open Game", icon: "dice" as const, exact: true, external: false },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const, exact: true, external: false },
  { href: getTradingUrl("/"), label: "Marketplace", icon: "trading" as const, exact: false, external: true },
  { href: "/dashboard/connect-ai", label: "Connect AI", icon: "connectAi" as const, exact: false, external: false },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" as const, exact: true, external: false },
  { href: "/dashboard/deposit", label: "Deposit", icon: "deposit" as const, exact: true, external: false },
  { href: "/dashboard/withdraw", label: "Withdraw", icon: "withdraw" as const, exact: true, external: false },
  { href: "/dashboard/strategies", label: "Strategies", icon: "strategies" as const, exact: false, external: false },
  { href: "/dashboard/api", label: "API", icon: "api" as const, exact: false, external: false },
  { href: "/dashboard/transactions", label: "Transactions", icon: "transactions" as const, exact: false, external: false },
  { href: "/dashboard/provably-fair", label: "Provably Fair", icon: "shield" as const, exact: false, external: false },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" as const, exact: false, external: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface MobileDashboardNavProps {
  displayName: string;
  isAdmin?: boolean;
  isPermanent?: boolean;
  service?: Service;
}

export function MobileDashboardNav({ displayName, isAdmin = false, isPermanent: serverIsPermanent = false, service = "game" }: MobileDashboardNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { hasApiKey } = useAiConnectionStatus();
  const isPermanent = useIsPermanent(serverIsPermanent);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header
      className="scroll-stable-layer md:hidden sticky top-0 z-[60] shrink-0 w-full border-b border-[var(--dash-divider)] bg-[var(--dash-bg)] shadow-sm"
      role="banner"
    >
      <div className="flex h-14 min-h-[44px] items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-heart)] to-[var(--accent-purple)]">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Xpersona</span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--dash-bg-card)] text-white hover:bg-[var(--dash-nav-active)] transition-colors"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              className="fixed inset-0 top-14 z-[9998] bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <nav
              className="fixed top-14 left-0 right-0 bottom-0 z-[9999] flex flex-col bg-[var(--dash-bg)] border-r border-[var(--dash-divider)] animate-in fade-in slide-in-from-top-2 duration-200"
              aria-label="Navigation menu"
            >
            <div className="flex-1 overflow-y-auto p-4 space-y-1 pb-20">
              <Link
                href="/games/dice"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[10px] px-3 py-3 text-sm font-semibold bg-[var(--dash-nav-active)] text-[#0ea5e9] border border-[var(--dash-divider)] mb-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0ea5e9]/30">
                  {ICONS.dice}
                </span>
                <span>Open Game</span>
                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              {GAME_LINKS.filter((l) => l.href !== "/games/dice").map(({ href, label, icon, exact, external }) => {
                const active = !external && isActive(pathname ?? "", href, exact);
                const isConnectAi = href === "/dashboard/connect-ai";
                const aiConnected = isConnectAi && hasApiKey === true;
                const displayLabel = isConnectAi && hasApiKey === true ? "AI connected" : label;
                const className = cn(
                  "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-[var(--dash-nav-active)] text-white"
                    : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white",
                  aiConnected && "text-[#30d158]"
                );
                const content = (
                  <>
                    <span className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      active ? aiConnected ? "bg-[#30d158]/20 text-[#30d158]" : "text-white" : "text-[var(--dash-text-secondary)] group-hover:text-white",
                      aiConnected && !active && "group-hover:text-[#30d158]"
                    )}>
                      {ICONS[icon]}
                    </span>
                    <span className="flex-1 flex items-center gap-2">
                      {displayLabel}
                      {aiConnected && <HeartbeatIndicator />}
                      {external && (
                        <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      )}
                    </span>
                  </>
                );
                return external ? (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={className}>
                    {content}
                  </a>
                ) : (
                  <Link key={href} href={href} onClick={() => setOpen(false)} className={className}>
                    {content}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium",
                    (pathname ?? "").startsWith("/admin")
                      ? "bg-[var(--dash-nav-active)] text-amber-400"
                      : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-amber-400"
                  )}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-400">
                    {ICONS.admin}
                  </span>
                  Admin
                </Link>
              )}
            </div>
            <div className="sticky bottom-0 left-0 right-0 p-4 border-t border-[var(--dash-divider)] bg-[var(--dash-bg)] mt-auto shrink-0 space-y-3">
              {!isPermanent && (
                <div className="flex gap-2">
                  <Link
                    href="/auth/signin"
                    onClick={() => setOpen(false)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    onClick={() => setOpen(false)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-heart)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Sign up
                  </Link>
                </div>
              )}
              <p className="text-xs text-[var(--dash-text-secondary)] truncate">
                Logged in as {displayName}
              </p>
            </div>
          </nav>
          </>,
          document.body
        )}
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useIsPermanent } from "@/lib/hooks/use-is-permanent";
import { createPortal } from "react-dom";
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
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
} as const;

const TRADING_LINKS = [
  { href: "/trading", label: "Marketplace", icon: "trading" as const, exact: false },
  { href: "/trading/developer", label: "Developer", icon: "developer" as const, exact: false },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" as const, exact: true },
  { href: "/dashboard/deposit", label: "Deposit", icon: "deposit" as const, exact: true },
  { href: "/dashboard/withdraw", label: "Withdraw", icon: "withdraw" as const, exact: true },
  { href: "/dashboard/transactions", label: "Transactions", icon: "transactions" as const, exact: false },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" as const, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface TradingMobileNavProps {
  displayName: string;
  isAdmin?: boolean;
  isPermanent?: boolean;
}

export function TradingMobileNav({
  displayName,
  isAdmin = false,
  isPermanent: serverIsPermanent = false,
}: TradingMobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isPermanent = useIsPermanent(serverIsPermanent);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className="scroll-stable-layer md:hidden sticky top-0 z-[60] shrink-0 w-full border-b border-[var(--dash-divider)] bg-[var(--dash-bg)] shadow-sm"
      role="banner"
    >
      <div className="flex h-14 min-h-[44px] items-center justify-between px-4">
        <Link href="/trading" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#30d158] to-[#248a3d]">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                <a
                  href={getGameUrl("/")}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-3 text-sm font-semibold bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[var(--dash-divider)] mb-3"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0ea5e9]/30">
                    {ICONS.dice}
                  </span>
                  <span>Play game</span>
                  <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                {TRADING_LINKS.map(({ href, label, icon, exact }) => {
                  const active = isActive(pathname ?? "", href, exact);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "bg-[var(--dash-nav-active)] text-white"
                          : "text-[var(--dash-text-secondary)] hover:bg-[#2a2a2a] hover:text-white"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          active ? "text-white" : "text-[var(--dash-text-secondary)] group-hover:text-white"
                        )}
                      >
                        {ICONS[icon]}
                      </span>
                      <span className="flex-1">{label}</span>
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
                <p className="text-xs text-[var(--dash-text-secondary)] truncate">Logged in as {displayName}</p>
              </div>
            </nav>
          </>,
          document.body
        )}
    </header>
  );
}

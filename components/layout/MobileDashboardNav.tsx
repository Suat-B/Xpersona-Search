"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useIsPermanent } from "@/lib/hooks/use-is-permanent";
import { useAutoHideHeader } from "@/lib/hooks/use-auto-hide-header";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { Service } from "@/lib/subdomain";

const MOBILE_LINKS = [
  {
    href: "/dashboard/playground",
    label: "Playground AI",
    exact: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l2.3 4.66L19.5 9l-3.75 3.65.88 5.16L12 15.37l-4.63 2.44.88-5.16L4.5 9l5.2-1.34L12 3z" />
      </svg>
    ),
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface MobileDashboardNavProps {
  displayName: string;
  isPermanent?: boolean;
  service?: Service;
}

export function MobileDashboardNav({ displayName, isPermanent: serverIsPermanent = false }: MobileDashboardNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isPermanent = useIsPermanent(serverIsPermanent);
  const headerHidden = useAutoHideHeader({
    scrollContainerSelector: '[data-header-scroll-root="dashboard"]',
    disabled: open,
  });

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
      className={cn(
        "scroll-stable-layer md:hidden sticky top-0 z-[60] shrink-0 w-full border-b border-[var(--dash-divider)] bg-[var(--dash-bg)] shadow-sm overflow-hidden transition-[max-height,transform,opacity,border-color] duration-300",
        headerHidden
          ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none border-transparent"
          : "max-h-24 translate-y-0 opacity-100"
      )}
      role="banner"
    >
      <div className="flex h-14 min-h-[44px] items-center justify-between px-4">
        <Link href="/">
          <span className="font-bold text-[var(--text-primary)]">Xpersona</span>
        </Link>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
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
                {MOBILE_LINKS.map(({ href, label, icon, exact }) => {
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
                        {icon}
                      </span>
                      <span className="flex-1">{label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="sticky bottom-0 left-0 right-0 mt-auto shrink-0 space-y-3 border-t border-[var(--dash-divider)] bg-[var(--dash-bg)] p-4">
                {!isPermanent && (
                  <div className="flex gap-2">
                    <Link
                      href="/auth/signin?callbackUrl=/dashboard"
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
                <p className="truncate text-xs text-[var(--dash-text-secondary)]">
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";
import { useAutoHideHeader } from "@/lib/hooks/use-auto-hide-header";

const NAV_LINKS = [
  { href: "/playground", label: "Playground" },
  { href: "/chat", label: "Chat" },
  { href: "/search", label: "Search" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/graph", label: "Graph" },
  { href: "/reliability", label: "Reliability" },
  { href: "/tool-pack", label: "Tool Pack" },
] as const;

interface TopNavHFProps {
  isAuthenticated?: boolean;
}

export function TopNavHF({ isAuthenticated = false }: TopNavHFProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [planBadge, setPlanBadge] = useState<string | null>(null);
  const isPlaygroundPage = pathname === "/playground" || pathname.startsWith("/playground/");
  const headerHidden = useAutoHideHeader({ disabled: menuOpen || isPlaygroundPage });
  const isSearchPage = pathname === "/search" || pathname.startsWith("/search/");
  const isLightHeaderPage = isSearchPage;
  const headerSurfaceClass = isPlaygroundPage
    ? "border-b border-[#005EB8] bg-[#005EB8]"
    : isSearchPage
      ? "border-b border-[#ffffff] bg-[#ffffff]"
      : "border-b border-[var(--border)] bg-[var(--bg-matte)]";
  const navLinkClass = isLightHeaderPage
    ? "px-2 py-1 text-sm text-black hover:text-black/80 transition-colors"
    : "px-2 py-1 text-sm text-white hover:text-white transition-colors";
  const authButtonClass = isLightHeaderPage
    ? "rounded-full bg-black text-white px-3 py-1 text-sm font-medium hover:bg-black/90 transition-colors"
    : "rounded-full bg-white text-black px-3 py-1 text-sm font-medium hover:bg-white/90 transition-colors";
  const mobileMenuButtonShellClass = isLightHeaderPage
    ? "flex h-9 w-10 items-center justify-center rounded-full border border-black/20 bg-black/5"
    : "flex h-9 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]";
  const mobileMenuButtonClass = isLightHeaderPage
    ? "flex h-full w-full items-center justify-center text-black"
    : "flex h-full w-full items-center justify-center text-[var(--text-primary)]";
  const mobileMenuPanelClass = isLightHeaderPage
    ? "lg:hidden border-t border-black/10 bg-white"
    : "lg:hidden border-t border-[var(--border)] bg-[var(--bg-deep)]";
  const mobileMenuLinkClass = isLightHeaderPage
    ? "block rounded-lg px-3 py-2 text-sm text-black hover:bg-black/5 hover:text-black transition-colors"
    : "block rounded-lg px-3 py-2 text-sm text-white hover:bg-white/5 hover:text-white transition-colors";
  const mobileMenuDividerClass = isLightHeaderPage
    ? "pt-2 border-t border-black/10 space-y-2"
    : "pt-2 border-t border-[var(--border)] space-y-2";
  const mobileMenuSignInClass = isLightHeaderPage
    ? "block rounded-lg px-3 py-2 text-sm text-black hover:bg-black/5 transition-colors"
    : "block rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5 transition-colors";
  const mobileMenuAuthButtonClass = isLightHeaderPage
    ? "block rounded-lg px-3 py-2 text-sm font-medium bg-black text-white hover:bg-black/90 transition-colors"
    : "block rounded-lg px-3 py-2 text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors";

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPlanBadge(null);
      return;
    }

    let cancelled = false;
    fetch("/api/v1/me/playground-usage", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        return json as { plan?: "trial" | "paid" | null; status?: string } | null;
      })
      .then((data) => {
        if (cancelled || !data) return;
        const isActive = data.status === "active" || data.status === "trial";
        if (!isActive) {
          setPlanBadge(null);
          return;
        }
        setPlanBadge(data.plan === "trial" ? "Trial Active" : "Plan Active");
      })
      .catch(() => {
        if (!cancelled) setPlanBadge(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return (
    <header
      className={`scroll-stable-layer sticky top-0 z-50 w-full overflow-hidden transition-[max-height,transform,opacity,border-color,background-color] duration-300 ${headerSurfaceClass} ${
        headerHidden
          ? "max-h-0 -translate-y-2 opacity-0 pointer-events-none border-transparent"
          : "max-h-[40rem] translate-y-0 opacity-100"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1260px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex flex-none items-center gap-2">
          {isSearchPage ? (
            <span className="text-xl font-black tracking-tight text-black">Xpersona</span>
          ) : (
            <Image
              src="/xpersona-logo-1.png"
              alt="Xpersona"
              width={112}
              height={28}
              className="h-7 w-auto"
              priority
            />
          )}
        </Link>

        <div className="flex-1 max-w-md">
          <GlobalSearchBar />
        </div>

        <nav className="ml-auto hidden lg:flex items-center gap-3" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={navLinkClass}
            >
              {link.label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              {planBadge ? (
                <span className="rounded-full border border-cyan-300/40 bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-100">
                  {planBadge}
                </span>
              ) : null}
              <span className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
                Signed in
              </span>
              <Link
                href="/dashboard"
                className={authButtonClass}
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin?callbackUrl=/dashboard"
                className={navLinkClass}
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className={authButtonClass}
              >
                Sign up
              </Link>
            </>
          )}
        </nav>

        <div className="lg:hidden flex flex-none items-center">
          <div className={mobileMenuButtonShellClass}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={mobileMenuButtonClass}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className={mobileMenuPanelClass}>
          <div className="mx-auto w-full max-w-[1260px] space-y-2 px-4 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={mobileMenuLinkClass}
              >
                {link.label}
              </Link>
            ))}
            <div className={mobileMenuDividerClass}>
              {isAuthenticated ? (
                <>
                  {planBadge ? (
                    <div className="rounded-lg px-3 py-2 text-xs font-medium text-cyan-100 bg-cyan-500/15 border border-cyan-300/40">
                      {planBadge}
                    </div>
                  ) : null}
                  <div className="rounded-lg px-3 py-2 text-xs font-medium text-emerald-200 bg-emerald-500/15 border border-emerald-300/40">
                    Signed in
                  </div>
                  <Link
                    href="/dashboard"
                    className={mobileMenuAuthButtonClass}
                  >
                    Dashboard
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/signin?callbackUrl=/dashboard"
                    className={mobileMenuSignInClass}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    className={mobileMenuAuthButtonClass}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

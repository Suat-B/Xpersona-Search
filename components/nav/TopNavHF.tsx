"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { GlobalSearchBar } from "@/components/search/GlobalSearchBar";

const NAV_LINKS = [
  { href: "/search", label: "Search" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/graph", label: "Graph" },
  { href: "/reliability", label: "Reliability" },
  { href: "/tool-pack", label: "Tool Pack" },
] as const;

export function TopNavHF() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <header className="scroll-stable-layer sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--bg-deep)]/85 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/xpersona-logo-1.png"
            alt="Xpersona"
            width={112}
            height={28}
            className="h-7 w-auto"
            priority
          />
        </Link>

        <div className="flex-1 max-w-md">
          <GlobalSearchBar />
        </div>

        <nav className="ml-auto hidden lg:flex items-center gap-3" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-2 py-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/auth/signin?callbackUrl=/dashboard"
            className="px-2 py-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="rounded-full bg-white text-black px-3 py-1 text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Sign up
          </Link>
        </nav>

        <div className="lg:hidden flex flex-none items-center">
          <div className="flex h-9 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)]">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-full w-full items-center justify-center text-[var(--text-primary)]"
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
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--bg-deep)]/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-[var(--border)] space-y-2">
              <Link
                href="/auth/signin?callbackUrl=/dashboard"
                className="block rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="block rounded-lg px-3 py-2 text-sm font-medium bg-white text-black hover:bg-white/90 transition-colors"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

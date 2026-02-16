"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect } from "react";
import type { GameSlug } from "./page";

const GameViewClient = dynamic(() => import("./GameViewClient"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-secondary)]">
      Loading game…
    </div>
  ),
});

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 1023px)");
    const handler = () => setIsMobile(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function MobileBlockMessage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0ea5e9]/10 border border-[#0ea5e9]/20">
        <svg className="w-8 h-8 text-[#0ea5e9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Desktop required</h2>
      <p className="text-[var(--text-secondary)] text-sm max-w-sm mb-6">
        Please use a desktop browser and connect your AI through OpenClaw for the best experience.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/dashboard"
          className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
        >
          Back to Dashboard
        </Link>
        <a
          href="https://docs.openclaw.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 px-5 py-2.5 text-sm font-medium text-[#0ea5e9] hover:bg-[#0ea5e9]/20 transition-colors"
        >
          OpenClaw docs →
        </a>
      </div>
    </div>
  );
}

interface GamePageClientProps {
  game: GameSlug;
  initialBalance: number | null;
}

export function GamePageClient({ game, initialBalance }: GamePageClientProps) {
  const isMobile = useIsMobile();

  if (isMobile === true) {
    return <MobileBlockMessage />;
  }

  if (isMobile === false) {
    return <GameViewClient game={game} initialBalance={initialBalance} />;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-secondary)]">
      Loading…
    </div>
  );
}

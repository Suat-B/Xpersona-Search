"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "xp_ai_first_banner_dismissed";

export function AIFirstBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setDismissed(stored === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (dismissed) return null;

  return (
    <div className="rounded-lg border border-[#0ea5e9]/30 bg-[#0ea5e9]/5 px-4 py-2 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <p className="text-xs text-[var(--text-primary)]">
        <span className="font-semibold text-[#0ea5e9]">AI-First Probability Game</span>
        {" — "}
        Your AI bets via API. Same balance. Same provably fair.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded text-[var(--text-secondary)] hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

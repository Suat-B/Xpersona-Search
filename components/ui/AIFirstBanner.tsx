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
    <div className="rounded-[10px] border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 sm:px-4 py-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-2 duration-300 min-w-0">
      <p className="text-xs text-[var(--text-primary)] min-w-0 break-words">
        <span className="font-semibold text-[#0ea5e9]">AI-First, Data-Driven Probability Game</span>
        {" — "}
        Your AI plays via API. Every strategy is pure data. Same balance. Same provably fair.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded text-[var(--dash-text-secondary)] hover:text-white hover:bg-[var(--dash-nav-active)] transition-colors"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

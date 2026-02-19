"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function TradingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="agent-card p-8 border-[var(--dash-divider)] max-w-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#30d158]/20 text-[#30d158] mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Subscribed!</h1>
        <p className="text-sm text-[var(--dash-text-secondary)] mb-6">
          Your subscription is active. The strategy is now available in your account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/trading"
            className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            Browse more strategies
          </Link>
          <Link
            href="/dashboard/strategies"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--dash-divider)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)]"
          >
            Your strategies
          </Link>
        </div>
      </div>
      {sessionId && (
        <p className="text-xs text-[var(--dash-text-secondary)] font-mono">Session: {sessionId.slice(0, 20)}…</p>
      )}
    </div>
  );
}

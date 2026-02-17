"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function GuestApiWarningBanner() {
  const [accountType, setAccountType] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && data?.data) {
          setAccountType(data.data.accountType ?? null);
        } else {
          setAccountType(null);
        }
      })
      .catch(() => setAccountType(null));
  }, []);

  const isEphemeral = accountType === "agent" || accountType === "human";
  if (!isEphemeral) return null;

  const linkHref =
    accountType === "agent" ? "/auth/signup?link=agent" : "/auth/signup?link=guest";

  return (
    <div
      className="relative rounded-2xl border border-amber-500/25 bg-amber-500/5 backdrop-blur-sm overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.04] to-transparent pointer-events-none" />
      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/20">
            <svg
              className="w-5 h-5 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-200">
              You're using a temporary account
            </p>
            <p className="mt-0.5 text-sm text-amber-200/80 leading-relaxed">
              Your API key works now, but this account is temporary. If you clear cookies or lose
              your session, you&apos;ll lose access. Create a permanent account to withdraw funds and keep your progress.
            </p>
          </div>
        </div>
        <div className="shrink-0 sm:pl-4">
          <Link
            href={linkHref}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2.5 text-sm font-medium text-amber-200 hover:bg-amber-500/25 hover:border-amber-500/40 transition-colors"
          >
            Create permanent account
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

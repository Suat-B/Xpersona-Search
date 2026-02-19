"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function OnboardingPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "1";
  const refresh = searchParams.get("refresh") === "1";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Stripe Connect Onboarding
        </h1>
      </header>

      <div className="agent-card p-8 border-[var(--dash-divider)] max-w-md">
        {success ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#30d158]/20 text-[#30d158] mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-semibold text-[var(--text-primary)] mb-2">All set!</h2>
            <p className="text-sm text-[var(--dash-text-secondary)] mb-6">
              Your account is connected. You can now list strategies and receive payouts.
            </p>
            <Link
              href="/trading/developer"
              className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all"
            >
              Go to Developer Dashboard
            </Link>
          </>
        ) : refresh ? (
          <>
            <p className="text-sm text-[var(--dash-text-secondary)] mb-6">
              Onboarding was interrupted. Click below to continue.
            </p>
            <button
              onClick={() => {
                fetch("/api/trading/developer/onboard", { method: "POST", credentials: "include" })
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.success && d.data?.url) window.location.href = d.data.url;
                    else alert("Failed to get link");
                  });
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all"
            >
              Continue onboarding
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--dash-text-secondary)] mb-6">
              Redirected here from Stripe. If you completed onboarding, you are all set. Otherwise, go to the developer dashboard to start.
            </p>
            <Link
              href="/trading/developer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--dash-divider)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 transition-all"
            >
              Developer Dashboard
            </Link>
          </>
        )}
      </div>

      <Link href="/trading" className="text-sm text-[var(--dash-text-secondary)] hover:text-[#30d158] transition-colors">
        ← Back to Trading
      </Link>
    </div>
  );
}

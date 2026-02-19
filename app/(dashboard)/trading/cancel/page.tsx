"use client";

import Link from "next/link";

export default function TradingCancelPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="agent-card p-8 border-[var(--dash-divider)] max-w-md">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Checkout cancelled</h1>
        <p className="text-sm text-[var(--dash-text-secondary)] mb-6">
          Your subscription was not completed. You can try again anytime.
        </p>
        <Link
          href="/trading"
          className="inline-flex items-center gap-2 rounded-full bg-[#30d158] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#30d158]/90 transition-all"
        >
          Back to marketplace
        </Link>
      </div>
    </div>
  );
}

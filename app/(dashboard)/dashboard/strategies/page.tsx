"use client";

import StrategiesSectionClient from "../StrategiesSectionClient";
import { AI_FIRST_MESSAGING } from "@/lib/ai-first-messaging";
import { GlassCard } from "@/components/ui/GlassCard";

export default function StrategiesPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 border border-[var(--accent-heart)]/20">
              <svg className="w-6 h-6 text-[var(--accent-heart)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-outfit)]">
                {AI_FIRST_MESSAGING.strategiesHero}
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {AI_FIRST_MESSAGING.strategiesSubtitle}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Callout */}
      <GlassCard className="p-4 border-[var(--accent-heart)]/10">
        <p className="text-sm text-[var(--text-primary)]">
          {AI_FIRST_MESSAGING.strategiesCallout}
        </p>
      </GlassCard>

      <StrategiesSectionClient />
    </div>
  );
}

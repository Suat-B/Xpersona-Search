"use client";

import dynamic from "next/dynamic";

const StrategiesSection = dynamic(
  () => import("@/components/strategies/StrategiesSection").then((mod) => mod.StrategiesSection),
  { 
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-[var(--text-secondary)]">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
          Loading strategies…
        </div>
      </div>
    )
  }
);

export default function StrategiesSectionClient() {
  return <StrategiesSection />;
}

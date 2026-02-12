"use client";

import { GlassCard } from "@/components/ui/GlassCard";

interface ProfileStatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  /** Optional color class for value (e.g. text-emerald-400 for positive) */
  valueColor?: string;
}

export function ProfileStatsCard({
  label,
  value,
  subtext,
  valueColor,
}: ProfileStatsCardProps) {
  return (
    <GlassCard className="p-4">
      <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          valueColor ?? "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
      {subtext && (
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtext}</p>
      )}
    </GlassCard>
  );
}

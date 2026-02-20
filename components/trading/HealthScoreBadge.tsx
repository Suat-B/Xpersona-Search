"use client";

import { cn } from "@/lib/utils";

export type HealthLabel = "healthy" | "moderate" | "struggling";

interface HealthScoreBadgeProps {
  score: number;
  label: HealthLabel;
  className?: string;
  showScore?: boolean;
}

const LABEL_STYLES: Record<HealthLabel, string> = {
  healthy: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  moderate: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  struggling: "bg-rose-500/20 text-rose-400 border-rose-500/40",
};

const LABEL_DISPLAY: Record<HealthLabel, string> = {
  healthy: "Healthy",
  moderate: "Moderate",
  struggling: "Struggling",
};

export function HealthScoreBadge({
  score,
  label,
  className,
  showScore = true,
}: HealthScoreBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        LABEL_STYLES[label],
        className
      )}
      title={`Health score: ${score}/100`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {showScore ? `${score} · ${LABEL_DISPLAY[label]}` : LABEL_DISPLAY[label]}
    </span>
  );
}

"use client";

const TIER_CONFIG: Record<string, { label: string; fee: number; color: string; bgColor: string }> = {
  newcomer: {
    label: "Newcomer",
    fee: 25,
    color: "text-amber-400",
    bgColor: "bg-amber-500/20 border-amber-500/40",
  },
  established: {
    label: "Established",
    fee: 20,
    color: "text-sky-400",
    bgColor: "bg-sky-500/20 border-sky-500/40",
  },
  elite: {
    label: "Elite",
    fee: 15,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20 border-purple-500/40",
  },
  platinum: {
    label: "Platinum",
    fee: 10,
    color: "text-[#30d158]",
    bgColor: "bg-[#30d158]/20 border-[#30d158]/40",
  },
};

const TIER_TOOLTIP =
  "Fee tiers are based on subscriber count and rating. Higher tiers unlock lower platform fees: Newcomer (25%) → Established (20%) → Elite (15%) → Platinum (10%).";

interface FeeTierBadgeProps {
  feeTier: string;
  subscriberCount?: number;
}

export function FeeTierBadge({ feeTier, subscriberCount }: FeeTierBadgeProps) {
  const key = (feeTier || "newcomer").toLowerCase();
  const config = TIER_CONFIG[key] ?? TIER_CONFIG.newcomer;

  return (
    <div className="group/tooltip relative inline-block">
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${config.bgColor} ${config.color}`}
        title={TIER_TOOLTIP}
      >
        {config.label} {config.fee}%
      </span>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-[var(--dash-divider)] bg-[var(--dash-bg-card)] px-3 py-2 text-xs text-[var(--dash-text-secondary)] shadow-xl group-hover/tooltip:block"
      >
        {TIER_TOOLTIP}
        {typeof subscriberCount === "number" && (
          <p className="mt-1.5 border-t border-[var(--dash-divider)] pt-1.5 font-medium text-[var(--text-primary)]">
            Your subscribers: {subscriberCount}
          </p>
        )}
      </div>
    </div>
  );
}

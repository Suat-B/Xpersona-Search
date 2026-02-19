"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface StrategyCardProps {
  id: string;
  name: string;
  description?: string | null;
  priceMonthlyCents: number;
  developerName: string;
  sharpeRatio?: number | null;
  riskLabel?: string | null;
  category?: string | null;
  timeframe?: string | null;
  liveTrackRecordDays?: number | null;
}

const RISK_COLORS: Record<string, string> = {
  conservative: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  moderate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  aggressive: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

export function StrategyCard({
  id,
  name,
  description,
  priceMonthlyCents,
  developerName,
  sharpeRatio,
  riskLabel,
  category,
  timeframe,
  liveTrackRecordDays,
}: StrategyCardProps) {
  const price = (priceMonthlyCents / 100).toFixed(2);
  const riskClass = riskLabel ? RISK_COLORS[riskLabel.toLowerCase()] ?? "" : "";

  return (
    <Link
      href={`/trading/strategy/${id}`}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#30d158]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dash-bg)] active:scale-[0.98] transition-transform duration-150"
    >
      <div className="agent-card p-5 h-full flex flex-col relative overflow-hidden border border-[var(--dash-divider)] rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] hover:border-[#30d158]/40 hover:shadow-[0_0_24px_-4px_rgba(48,209,88,0.15)] group-hover:bg-[var(--bg-card-hover)]">
        {/* Subtle top accent line on hover */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#30d158]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Pills row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-[#30d158]/10 text-[#30d158]/90 border border-[#30d158]/20">
              {category}
            </span>
          )}
          {timeframe && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--dash-divider)]/80 text-[var(--dash-text-secondary)]">
              {timeframe}
            </span>
          )}
          {riskLabel && (
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border", riskClass)}>
              {riskLabel}
            </span>
          )}
          {liveTrackRecordDays != null && liveTrackRecordDays >= 90 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/30">
              Live 90+
            </span>
          )}
        </div>

        <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[#30d158] transition-colors duration-200">
          {name}
        </h3>
        <p className="text-xs text-[var(--dash-text-secondary)] mt-0.5">by {developerName}</p>
        {description && (
          <p className="mt-2 text-sm text-[var(--dash-text-secondary)] line-clamp-2 flex-1 leading-relaxed">
            {description}
          </p>
        )}

        {/* Mini metrics when available */}
        {sharpeRatio != null && (
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--dash-text-secondary)]">
            <span className="font-mono tabular-nums">
              Sharpe <span className="text-[#30d158] font-semibold">{sharpeRatio.toFixed(2)}</span>
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between pt-4 border-t border-[var(--dash-divider)]/80">
          <span className="text-lg font-bold text-[#30d158]">
            ${price}<span className="text-xs font-normal text-[var(--dash-text-secondary)]">/mo</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--dash-text-secondary)] group-hover:text-[#30d158] transition-colors duration-200">
            View
            <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

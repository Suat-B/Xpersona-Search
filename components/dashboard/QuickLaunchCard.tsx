"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

export function QuickLaunchCard() {
  return (
    <Link href="/games/dice" className="block group">
      <GlassCard className="relative overflow-hidden border border-[var(--accent-heart)]/30 bg-gradient-to-br from-[var(--accent-heart)]/5 to-transparent hover:border-[var(--accent-heart)]/50 hover:from-[var(--accent-heart)]/10 transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-heart)]/20 text-xl group-hover:scale-105 transition-transform">
            🎲
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
              Play Dice
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              Provably fair
            </p>
          </div>
          <svg className="w-4 h-4 shrink-0 text-[var(--text-secondary)] group-hover:text-[var(--accent-heart)] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </GlassCard>
    </Link>
  );
}

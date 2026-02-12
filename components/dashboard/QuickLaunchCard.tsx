"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";

export function QuickLaunchCard() {
  return (
    <Link href="/games/dice" className="block group">
      <GlassCard className="relative overflow-hidden border-2 border-[var(--accent-heart)]/30 bg-gradient-to-br from-[var(--accent-heart)]/10 to-transparent hover:border-[var(--accent-heart)]/50 transition-all duration-300 hover:scale-[1.02]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent-heart)]/20 text-3xl group-hover:scale-110 transition-transform">
            🎲
          </div>
          <div>
            <div className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">
              Quick Launch
            </div>
            <div className="text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
              Play Dice →
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
              Pure over/under. Provably fair.
            </p>
          </div>
        </div>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[var(--accent-heart)]/5 group-hover:bg-[var(--accent-heart)]/10 transition-colors" />
      </GlassCard>
    </Link>
  );
}

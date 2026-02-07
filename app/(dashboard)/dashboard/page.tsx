"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import QuantMetrics from "@/components/dashboard/QuantMetrics";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";

const GAMES = [
  { slug: "dice", name: "Dice", icon: "🎲", desc: "Roll over or under. Pure probability. AI-first." },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* 1. Top Section: Metrics */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-mono tracking-tight glow-text-white">DASHBOARD_V2</h2>
          <div className="flex gap-2">
            <button disabled className="px-3 py-1.5 text-xs font-mono border border-white/10 rounded bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 transition">
              DEPOSIT
            </button>
            <button disabled className="px-3 py-1.5 text-xs font-mono border border-white/10 rounded bg-white/5 text-[var(--text-secondary)] hover:bg-white/10 transition">
              WITHDRAW
            </button>
          </div>
        </div>
        <QuantMetrics />
      </section>

      {/* 2. Main Grid: Games & Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Game Grid (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)] uppercase tracking-wider">Dice Casino — AI First</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {GAMES.map((game) => (
                <Link href={`/games/${game.slug}`} key={game.slug} className="group block h-full">
                  <GlassCard className="h-full p-5 hover:bg-white/5 hover:border-white/20 transition-all duration-300 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10 text-4xl group-hover:scale-110 group-hover:opacity-20 transition-transform">
                      {game.icon}
                    </div>
                    <div className="relative z-10 flex flex-col h-full justify-between">
                      <div>
                        <div className="text-2xl mb-2">{game.icon}</div>
                        <h3 className="font-bold text-lg text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
                          {game.name}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                          {game.desc}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center text-xs font-medium text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                        Launch Protocol →
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          </section>

          {/* Strategies card: link to full page */}
          <section>
            <GlassCard className="p-5">
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Strategies</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Create, run, and manage dice strategies. Python and quick config.
              </p>
              <Link
                href="/dashboard/strategies"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
              >
                Manage strategies
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </GlassCard>
          </section>
        </div>

        {/* Right: API (1/3 width) */}
        <div className="space-y-4 flex flex-col">
          <ApiKeySection />
          <Link
            href="/dashboard/api"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent-heart)] hover:underline"
          >
            Full API docs and OpenClaw integration
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

    </div>
  );
}

"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import StrategiesSectionClient from "./StrategiesSectionClient";
import { QuantMetrics } from "@/components/dashboard/QuantMetrics";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { TransactionTable } from "@/components/dashboard/TransactionTable";

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

          {/* Strategies Section */}
          <section id="strategies" className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">Python strategies</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Write custom Python, run on the dice game. Same code for you and for OpenClaw AI agents.
              </p>
            </div>
            <StrategiesSectionClient />
          </section>
        </div>

        {/* Right: Live Feed & VIP (1/3 width) */}
        <div className="space-y-6 flex flex-col">
          {/* VIP Status Mock */}
          <GlassCard className="p-5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">VIP STATUS</h3>
                <p className="text-xs text-[var(--text-secondary)]">Level 3: Quant Trader</p>
              </div>
              <span className="text-xs font-mono bg-[var(--accent-heart)]/10 text-[var(--accent-heart)] px-2 py-1 rounded">Rank 452</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
              <div className="bg-[var(--accent-heart)] h-1.5 rounded-full w-[65%] shadow-[0_0_10px_var(--accent-heart)]"></div>
            </div>
            <p className="text-[10px] text-right text-[var(--text-secondary)]">Next: Market Maker (65%)</p>
          </GlassCard>

          {/* Live Feed */}
          <div className="flex-1 min-h-[300px]">
            <LiveFeed />
          </div>
        </div>
      </div>

      {/* 3. Bottom: Transactions */}
      <section>
        <TransactionTable />
      </section>

    </div>
  );
}

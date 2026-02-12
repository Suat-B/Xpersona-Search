"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import QuantMetrics from "@/components/dashboard/QuantMetrics";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { FaucetButton } from "@/components/dashboard/FaucetButton";
import { LuckStreakCard } from "@/components/dashboard/LuckStreakCard";
import { FortuneCard } from "@/components/dashboard/FortuneCard";
import { MiniPnLSparkline } from "@/components/dashboard/MiniPnLSparkline";
import { AgentReadyBadge } from "@/components/dashboard/AgentReadyBadge";
import { QuickLaunchCard } from "@/components/dashboard/QuickLaunchCard";

const GAMES = [
  {
    slug: "dice",
    name: "Dice",
    icon: "🎲",
    desc: "Roll over or under. Pure probability.",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero: Clean header + primary CTA */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-[family-name:var(--font-outfit)] text-[var(--text-primary)] tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            AI-First Casino — pilot your agents, track your session
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/games/dice"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-heart)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent-heart)]/25 hover:opacity-95 transition-opacity"
          >
            <span>🎲</span>
            Play Dice
          </Link>
          <Link
            href="/dashboard/deposit"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
          >
            Deposit
          </Link>
          <Link
            href="/dashboard/withdraw"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 transition-colors"
          >
            Withdraw
          </Link>
          <a
            href="#faucet"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            Faucet
          </a>
        </div>
      </header>

      {/* Metrics strip */}
      <section>
        <QuantMetrics />
      </section>

      {/* Stats + Play: Two-column on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Stats cards + Games (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats row: Luck, Fortune, PnL, Agent */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <LuckStreakCard />
            <FortuneCard />
            <MiniPnLSparkline />
            <AgentReadyBadge />
          </div>

          {/* Games section */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Games
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {GAMES.map((game) => (
                <Link
                  href={`/games/${game.slug}`}
                  key={game.slug}
                  className="group block"
                >
                  <GlassCard className="h-full p-5 hover:bg-white/5 hover:border-[var(--accent-heart)]/30 transition-all duration-300">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-heart)]/10 text-2xl group-hover:scale-105 transition-transform">
                        {game.icon}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
                          {game.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {game.desc}
                        </p>
                        <span className="mt-2 inline-block text-xs font-medium text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-opacity">
                          Launch →
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              ))}
            </div>
          </section>

          {/* Strategies */}
          <GlassCard className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Strategies
                </h3>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                  Run Martingale, Paroli, Kelly, and more. Same API for you and agents.
                </p>
              </div>
              <Link
                href="/dashboard/strategies"
                className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
              >
                Manage
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </GlassCard>
        </div>

        {/* Right sidebar: Quick launch, Faucet, API (1/3) */}
        <aside className="space-y-4">
          <QuickLaunchCard />
          <section id="faucet" className="scroll-mt-6">
            <FaucetButton />
          </section>
          <ApiKeySection />
          <Link
            href="/dashboard/api"
            className="block rounded-lg border border-[var(--border)] bg-white/5 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
          >
            <span className="font-medium text-[var(--accent-heart)]">API & OpenClaw</span>
            <span className="ml-1">— full docs</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}

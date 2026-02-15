"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import QuantMetrics from "@/components/dashboard/QuantMetrics";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { RecoveryLinkCard } from "@/components/dashboard/RecoveryLinkCard";
import { FaucetButton } from "@/components/dashboard/FaucetButton";
import { LuckStreakCard } from "@/components/dashboard/LuckStreakCard";
import { FortuneCard } from "@/components/dashboard/FortuneCard";
import { MiniPnLSparkline } from "@/components/dashboard/MiniPnLSparkline";
import { AgentReadyBadge } from "@/components/dashboard/AgentReadyBadge";
import { ConnectAIPanel } from "@/components/dashboard/ConnectAIPanel";
import { QuickLaunchCard } from "@/components/dashboard/QuickLaunchCard";
import { StrategiesCountBadge } from "@/components/dashboard/StrategiesCountBadge";

const GAMES = [
  {
    slug: "dice",
    name: "Dice",
    icon: "🎲",
    desc: "Roll over or under. Pure probability.",
    color: "from-[#ff2d55] to-[#5e5ce6]",
    glow: "shadow-[#ff2d55]/20",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero Header */}
      <header className="relative">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#30d158] shadow-[0_0_10px_#30d158] animate-pulse" />
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">READY TO PLAY</span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-gradient-primary">
              Dashboard
            </h1>
            <p className="mt-2 text-[var(--text-secondary)] max-w-md">
              Your home for provably fair dice. Play yourself or deploy AI to play for you.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/games/dice"
              className="group relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff2d55] to-[#ff5e7d] px-6 py-3 text-sm font-medium text-white shadow-lg shadow-[#ff2d55]/30 hover:shadow-[#ff2d55]/50 hover:scale-105 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <svg className="relative w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="relative">Play Dice</span>
            </Link>
            
            <Link
              href="/dashboard/connect-ai"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-heart)]/40 bg-[var(--accent-heart)]/10 px-5 py-3 text-sm font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 hover:border-[var(--accent-heart)]/60 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Connect AI
            </Link>
            
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] p-1 backdrop-blur-sm">
              <Link
                href="/dashboard/deposit"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all"
              >
                <svg className="w-4 h-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Deposit
              </Link>
              <div className="w-px h-4 bg-[var(--border)]" />
              <Link
                href="/dashboard/withdraw"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all"
              >
                <svg className="w-4 h-4 text-[#0a84ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Withdraw
              </Link>
            </div>
            
            <a
              href="#free-credits"
              className="inline-flex items-center gap-2 rounded-full border border-[#30d158]/30 bg-[#30d158]/10 px-4 py-2.5 text-sm font-medium text-[#30d158] hover:bg-[#30d158]/20 hover:shadow-[0_0_20px_rgba(48,209,88,0.2)] transition-all"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("free-credits")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Free Credits
            </a>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="relative">
        <div className="absolute -inset-8 bg-gradient-to-r from-[#ff2d55]/5 via-[#5e5ce6]/5 to-[#0a84ff]/5 rounded-[40px] blur-3xl opacity-60 pointer-events-none" />
        <QuantMetrics />
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-5">
          {/* Stats Row - 2x2 Grid */}
          <div className="grid grid-cols-2 gap-5">
            <LuckStreakCard />
            <FortuneCard />
            <MiniPnLSparkline />
            <AgentReadyBadge />
          </div>

          <ConnectAIPanel />

          {/* Games Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-[#ff2d55] to-[#5e5ce6]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Games
                </h2>
              </div>
              <Link 
                href="/games" 
                className="group flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] transition-colors"
              >
                View all
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {GAMES.map((game) => (
                <Link
                  href={`/games/${game.slug}`}
                  key={game.slug}
                  className="group block"
                >
                  <div className="agent-card h-full min-h-[160px] p-6 transition-all duration-500 group-hover:scale-[1.02]">
                    <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
                      style={{ background: `linear-gradient(135deg, rgba(255,45,85,0.08) 0%, rgba(94,92,230,0.04) 100%)` }} 
                    />
                    
                    <div className="relative flex items-start gap-5">
                      <div className={`
                        relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl 
                        bg-gradient-to-br ${game.color}
                        shadow-lg ${game.glow} group-hover:shadow-xl group-hover:scale-110 
                        transition-all duration-500
                      `}
                      >
                        <span className="text-3xl filter drop-shadow-lg">{game.icon}</span>
                        
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#30d158] rounded-full border-2 border-[#0a0a0a]" />
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[var(--text-primary)] text-lg group-hover:text-gradient-accent transition-all">
                            {game.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/30">
                            Live
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
                          {game.desc}
                        </p>
                        
                        <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[var(--accent-heart)] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-8px] group-hover:translate-x-0">
                          Play Now
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Strategies Card */}
          <div className="agent-card p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5e5ce6]/20 to-[#bf5af2]/10 text-[#bf5af2] border border-[#bf5af2]/20">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--text-primary)] text-lg">
                      Betting Strategies
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#5e5ce6]/20 text-[#5e5ce6] border border-[#5e5ce6]/30">
                      Automated
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
                    Run Martingale, Paroli, Kelly, and more. Same strategies work for you and your AI.
                  </p>
                  
                  <div className="mt-3 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#30d158]" />
                      <StrategiesCountBadge />
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]" />
                      Real-time
                    </span>
                  </div>
                </div>
              </div>
              
              <Link
                href="/dashboard/strategies"
                className="shrink-0 inline-flex items-center gap-2 rounded-full border border-[#bf5af2]/30 bg-[#bf5af2]/10 px-5 py-2.5 text-sm font-medium text-[#bf5af2] hover:bg-[#bf5af2]/20 hover:shadow-[0_0_20px_rgba(191,90,242,0.2)] transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Create a strategy
              </Link>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="lg:col-span-4 space-y-5">
          <div className="relative">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#5e5ce6]/10 rounded-full blur-[80px] pointer-events-none" />
            <QuickLaunchCard />
          </div>
          
          <section id="free-credits" className="scroll-mt-6">
            <FaucetButton />
          </section>

          <RecoveryLinkCard />

          <ApiKeySection />
          
          <Link
            href="/dashboard/api"
            className="group block"
          >
            <div className="agent-card p-5 transition-all duration-300 group-hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#0a84ff]/20 to-[#64d2ff]/10 text-[#0a84ff] border border-[#0a84ff]/20 group-hover:shadow-[0_0_20px_rgba(10,132,255,0.3)] transition-shadow"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">API & OpenClaw</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Documentation</p>
                  </div>
                </div>
                
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] group-hover:bg-[#0a84ff]/10 transition-colors"
                >
                  <svg className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[#0a84ff] group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </aside>
      </div>

      {/* Footer — cohesive bottom section */}
      <footer className="mt-12 pt-6 border-t border-white/[0.06]">
        <div className="flex flex-col gap-6">
          {/* Nav links — single row, consistent spacing */}
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/games/dice" className="text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Play Dice
            </Link>
            <Link href="/dashboard/strategies" className="text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Strategies
            </Link>
            <Link href="/dashboard/provably-fair" className="text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              Provably Fair
            </Link>
            <Link href="/dashboard/api" className="text-[var(--text-secondary)] hover:text-[var(--accent-heart)] transition-colors">
              API Docs
            </Link>
          </nav>

          {/* Bottom row: branding + status */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/[0.04]">
            <p className="text-xs text-[var(--text-tertiary)] order-2 sm:order-1">
              Xpersona · AI-first casino · Provably fair over/under dice
            </p>
            <div className="flex items-center gap-2 order-1 sm:order-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse shrink-0" aria-hidden />
              <span className="text-[11px] text-[var(--text-tertiary)]">All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ClientOnly } from "@/components/ClientOnly";
import { useDiceSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";
import { DiceStrategyPanel } from "./DiceStrategyPanel";
import { RecentResults } from "@/components/ui/RecentResults";
import { StreakIndicator } from "@/components/ui/StreakIndicator";
import { StatsSummary } from "@/components/ui/StatsSummary";
import { DiceVerificationHistory } from "./DiceVerificationHistory";

const ACTIVE_STRATEGY_KEY = "xpersona_active_strategy_run";

const DiceGame = dynamic(() => import("./DiceGame"), { ssr: false });

const GAMES = ["dice"] as const;
type GameSlug = (typeof GAMES)[number];

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
}

export default function GamePageClient({ game }: { game: GameSlug }) {
  const { series, totalPnl, rounds, reset } = useDiceSessionPnL();
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [autoPlayActive, setAutoPlayActive] = useState(false);
  const [recentResults, setRecentResults] = useState<RollResult[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"stats" | "strategy">("stats");
  const [activeStrategyRun, setActiveStrategyRun] = useState<{ name: string } | null>(null);

  // Sync "your strategy is running" state (set by dashboard when user runs a Python strategy)
  useEffect(() => {
    const readStored = () => {
      try {
        const raw = sessionStorage.getItem(ACTIVE_STRATEGY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { name?: string };
          if (parsed?.name) setActiveStrategyRun({ name: parsed.name });
          else setActiveStrategyRun(null);
        } else {
          setActiveStrategyRun(null);
        }
      } catch {
        setActiveStrategyRun(null);
      }
    };
    readStored();
    const handle = (e: Event) => {
      const d = (e as CustomEvent<{ active: boolean; name?: string }>).detail;
      if (d?.active && d?.name) setActiveStrategyRun({ name: d.name });
      else setActiveStrategyRun(null);
    };
    window.addEventListener("strategy-run-state", handle);
    return () => window.removeEventListener("strategy-run-state", handle);
  }, []);

  // Load balance on mount
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const res = await fetch("/api/me/balance");
        const data = await res.json();
        if (data.success) {
          setBalance(data.data.balance);
        }
      } catch {
        // Silently fail
      }
    };
    loadBalance();

    const handleBalanceUpdate = () => {
      loadBalance();
    };
    window.addEventListener("balance-updated", handleBalanceUpdate);
    return () => window.removeEventListener("balance-updated", handleBalanceUpdate);
  }, []);

  const loadStrategyConfig = (config: { amount: number; target: number; condition: "over" | "under" }) => {
    setAmount(config.amount);
    setTarget(config.target);
    setCondition(config.condition);
  };

  const handleResult = (result: RollResult) => {
    setRecentResults(prev => [...prev, result].slice(-20));
  };

  const handleReset = () => {
    reset();
    setRecentResults([]);
  };

  return (
    <div className="h-screen w-full flex flex-col min-h-0 overflow-hidden bg-[var(--bg-deep)]">
      {/* Header - Compact 56px */}
      <header className="flex-shrink-0 h-14 flex items-center justify-between px-6 border-b border-white/5 bg-[var(--bg-card)]/50 backdrop-blur-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        
        <div className="flex items-center gap-2">
          <span className="text-xl">🎲</span>
          <h1 className="text-lg font-bold font-[family-name:var(--font-outfit)] text-[var(--text-primary)]">
            Pure Dice
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)]">
            <svg className="w-4 h-4 text-[var(--accent-heart)]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">Balance:</span>
            <span className="text-sm font-mono font-bold text-[var(--text-primary)]">
              {balance.toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* Your strategy is running - dice-themed pill (user, not AI) */}
      {activeStrategyRun && (
        <div className="flex-shrink-0 px-4 py-2 flex items-center justify-center gap-2 bg-[var(--bg-card)] border-b border-[var(--border)]/50">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium">Your strategy</span>
            <span className="text-sm font-semibold truncate max-w-[180px]">{activeStrategyRun.name}</span>
            <span className="text-xs opacity-90">is placing dice bets</span>
          </div>
          <Link
            href="/dashboard/strategies"
            className="text-xs font-medium text-[var(--accent-heart)] hover:underline"
          >
            View run →
          </Link>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-row gap-4 p-4 overflow-hidden">
        {/* Left column: Game - takes remaining space */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <ClientOnly
            fallback={
              <div className="flex-1 flex items-center justify-center font-mono text-sm text-[var(--text-secondary)] animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
                  Loading game...
                </div>
              </div>
            }
          >
            <DiceGame
              amount={amount}
              target={target}
              condition={condition}
              onAmountChange={setAmount}
              onTargetChange={setTarget}
              onConditionChange={setCondition}
              onRoundComplete={() => {}}
              onAutoPlayChange={setAutoPlayActive}
              onResult={handleResult}
            />
          </ClientOnly>
        </div>

        {/* Right column: Stats & Strategy - 360px fixed */}
        <aside className="w-[360px] flex-shrink-0 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex-shrink-0 flex gap-1 p-1 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)]">
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                activeTab === "stats"
                  ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Stats
              </span>
            </button>
            <button
              onClick={() => setActiveTab("strategy")}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                activeTab === "strategy"
                  ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                Strategy
              </span>
            </button>
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
            {activeTab === "stats" ? (
              <>
                {/* Session PnL Chart */}
                <div className="flex-shrink-0">
                  <SessionPnLChart
                    series={series}
                    totalPnl={totalPnl}
                    rounds={rounds}
                    onReset={handleReset}
                  />
                </div>

                {/* Quick Stats Row */}
                <div className="flex-shrink-0 flex items-center justify-between px-1">
                  <StreakIndicator results={recentResults} />
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="text-xs uppercase tracking-wider">Rounds</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">{rounds}</span>
                  </div>
                </div>

                {/* Recent Results - Compact */}
                <div className="flex-shrink-0">
                  <RecentResults results={recentResults} />
                </div>

                {/* Stats Summary - Compact */}
                <div className="flex-shrink-0">
                  <StatsSummary results={recentResults} />
                </div>

                {/* Verifiable dice history with Verify modal */}
                <div className="flex-shrink-0">
                  <DiceVerificationHistory />
                </div>
              </>
            ) : (
              <div className="flex-shrink-0 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Load a saved strategy or run Python code. Running a strategy places real dice bets and updates your balance.
                </p>
                <Link
                  href="/dashboard/strategies"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-heart)] hover:underline"
                >
                  Create & manage strategies
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                  <div className="p-4">
                    <DiceStrategyPanel
                      amount={amount}
                      target={target}
                      condition={condition}
                      disabled={autoPlayActive}
                      onLoadConfig={loadStrategyConfig}
                      onBalanceUpdate={() => window.dispatchEvent(new Event("balance-updated"))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions Footer */}
          <div className="flex-shrink-0 flex gap-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <button
              onClick={handleReset}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>
            <button
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
            <button
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-all flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help
            </button>
          </div>
        </aside>
      </main>

      {/* Footer - Compact 48px */}
      <footer className="flex-shrink-0 h-12 flex items-center justify-between px-6 border-t border-white/5 bg-[var(--bg-card)]/50 backdrop-blur-sm">
        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5" title="Every roll is verifiable — use Verifiable history above to view verification data">
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Provably Fair
          </span>
          <span className="text-[var(--border)]">|</span>
          <span>3% House Edge</span>
          <span className="text-[var(--border)]">|</span>
          <span className="text-[var(--accent-heart)]">RTP 97%</span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-secondary)]">
            Min: 1 | Max: 10,000
          </span>
        </div>
      </footer>
    </div>
  );
}

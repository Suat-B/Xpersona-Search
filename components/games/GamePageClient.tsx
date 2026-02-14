"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ClientOnly } from "@/components/ClientOnly";
import { useDiceSessionPnL } from "./useSessionPnL";
import { DiceStrategyPanel } from "./DiceStrategyPanel";
import { DiceStatisticsPanel } from "./DiceStatisticsPanel";
import { CreativeDiceStrategiesSection } from "./CreativeDiceStrategiesSection";
import { AgentApiSection } from "./AgentApiSection";
import { CompactAdvancedStrategyBuilder } from "@/components/strategies/CompactAdvancedStrategyBuilder";
import { getAndClearStrategyRunPayload } from "@/lib/strategy-run-payload";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import { KeyboardShortcutsHelp } from "./KeyboardShortcuts";
import { StrategyRunningBanner } from "@/components/strategies/StrategyRunningBanner";
import type { DiceStrategyConfig, DiceProgressionType } from "@/lib/strategies";
import type { StrategyRunConfig } from "./DiceGame";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

const MAX_RECENT_RESULTS = 50;

const DiceGame = dynamic(() => import("./DiceGame"), { ssr: false });

const GAMES = ["dice"] as const;
type GameSlug = (typeof GAMES)[number];

interface RollResult {
  result: number;
  win: boolean;
  payout: number;
  betAmount?: number;
}

export default function GamePageClient({ game }: { game: GameSlug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionPnL = useDiceSessionPnL();
  const { totalPnl = 0, rounds = 0, wins = 0, addRound, addBulkSession, reset } = sessionPnL;
  const statsSeries = Array.isArray(sessionPnL?.series) ? sessionPnL.series : [];
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [progressionType, setProgressionType] = useState<DiceProgressionType>("flat");
  const [activeStrategyName, setActiveStrategyName] = useState<string | null>(null);
  const [autoPlayActive, setAutoPlayActive] = useState(false);
  const [recentResults, setRecentResults] = useState<RollResult[]>([]);
  const [recentResultsHydrated, setRecentResultsHydrated] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"api" | "strategy" | "statistics">("statistics");
  const [strategyRun, setStrategyRun] = useState<StrategyRunConfig | null>(null);
  const [strategyStats, setStrategyStats] = useState<{
    currentRound: number;
    sessionPnl: number;
    initialBalance: number;
    winRatePercent: number;
  } | null>(null);

  // Read strategy-run payload when ?run=1 or ?run=advanced, then redirect
  useEffect(() => {
    const runParam = searchParams.get("run");
    if (game !== "dice" || (runParam !== "1" && runParam !== "advanced")) return;
    const payload = getAndClearStrategyRunPayload();
    if (!payload) {
      router.replace("/games/dice");
      return;
    }

    const applyConfig = (config: DiceStrategyConfig) => {
      setAmount(config.amount);
      setTarget(config.target);
      setCondition(config.condition);
      setStrategyRun({
        config,
        maxRounds: payload.maxRounds,
        strategyName: payload.strategyName,
      });
    };

    // Handle advanced strategy
    if (payload.isAdvanced && payload.strategy) {
      const advancedConfig: DiceStrategyConfig = {
        amount: payload.strategy.baseConfig.amount,
        target: payload.strategy.baseConfig.target,
        condition: payload.strategy.baseConfig.condition,
        progressionType: "flat", // Advanced strategies don't use progression types
      };
      setAmount(advancedConfig.amount);
      setTarget(advancedConfig.target);
      setCondition(advancedConfig.condition);
      setStrategyRun({
        config: advancedConfig,
        maxRounds: payload.maxRounds,
        strategyName: payload.strategyName,
        isAdvanced: true,
        advancedStrategy: payload.strategy,
      });
      setActiveStrategyName(payload.strategyName);
      router.replace("/games/dice");
      return;
    }

    if (payload.strategyId) {
      fetch("/api/me/strategies?gameType=dice", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data?.strategies)) {
            const s = data.data.strategies.find((x: { id: string }) => x.id === payload.strategyId);
            if (s?.config) {
              const cfg = s.config as Record<string, unknown>;
              const config: DiceStrategyConfig = {
                amount: typeof cfg.amount === "number" ? cfg.amount : 10,
                target: typeof cfg.target === "number" ? cfg.target : 50,
                condition: (cfg.condition === "over" || cfg.condition === "under" ? cfg.condition : "over") as "over" | "under",
                progressionType: (cfg.progressionType as DiceStrategyConfig["progressionType"]) ?? "flat",
              };
              applyConfig(config);
            }
          }
          router.replace("/games/dice");
        })
        .catch(() => router.replace("/games/dice"));
    } else if (payload.config) {
      applyConfig(payload.config);
      router.replace("/games/dice");
    } else {
      router.replace("/games/dice");
    }
  }, [game, searchParams, router]);

  // Load balance on mount
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const res = await fetch("/api/me/balance", { credentials: "include" });
        const text = await res.text();
        let data: { success?: boolean; data?: { balance?: number } };
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          return;
        }
        if (data.success && typeof data.data?.balance === "number") {
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

  // Hydrate recent results from server so streak reflects full history (uncapped)
  useEffect(() => {
    if (game !== "dice" || recentResultsHydrated) return;
    let cancelled = false;
    fetch(`/api/me/bets?gameType=dice&limit=${MAX_RECENT_RESULTS}`, { credentials: "include" })
      .then(async (res) => {
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })
      .then((data) => {
        if (cancelled || !data.success || !Array.isArray(data.data?.bets)) return;
        const bets = data.data.bets as { outcome: string; payout: number; amount: number }[];
        const chronological = [...bets].reverse();
        const hydrated: RollResult[] = chronological.map((b) => ({
          result: 0,
          win: b.outcome === "win",
          payout: Number(b.payout),
          betAmount: Number(b.amount),
        }));
        setRecentResults(hydrated.slice(-MAX_RECENT_RESULTS));
        setRecentResultsHydrated(true);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [game, recentResultsHydrated]);

  const loadStrategyConfig = (config: { amount: number; target: number; condition: "over" | "under"; progressionType?: DiceProgressionType }, strategyName?: string) => {
    setAmount(config.amount);
    setTarget(config.target);
    setCondition(config.condition);
    if (config.progressionType) setProgressionType(config.progressionType);
    setActiveStrategyName(strategyName ?? null);
  };

  const handleResult = (result: RollResult & { betAmount?: number; balance?: number }) => {
    setRecentResults(prev => [...prev, { ...result, betAmount: result.betAmount ?? amount }].slice(-MAX_RECENT_RESULTS));
    if (typeof result.balance === "number") setBalance(result.balance);
    addRound(result.betAmount ?? amount, result.payout);
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

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <h1 className="text-lg font-bold font-[family-name:var(--font-outfit)] text-[var(--text-primary)]">
              Pure Dice
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)]" data-agent="balance-display" data-value={balance}>
            <svg className="w-4 h-4 text-[var(--accent-heart)]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">Balance:</span>
            <span className="text-sm font-mono font-bold text-[var(--text-primary)]">
              {balance.toLocaleString()}
            </span>
          </div>
          <Link
            href="/dashboard/deposit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 text-xs font-medium text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Deposit
          </Link>
          <Link
            href="/dashboard/withdraw"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Withdraw
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-row gap-4 p-4 overflow-hidden">
        {/* Left column: Game - takes remaining space */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Strategy Running Banner */}
          {strategyRun && (
            <div className="mb-4">
              <StrategyRunningBanner
                strategyName={strategyRun.strategyName}
                status="running"
                currentRound={strategyStats?.currentRound || 0}
                sessionPnl={strategyStats?.sessionPnl || 0}
                currentBalance={balance}
                initialBalance={strategyStats?.initialBalance || balance}
                winRatePercent={strategyStats?.winRatePercent || 0}
                onStop={() => setStrategyRun(null)}
              />
            </div>
          )}
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
              balance={balance}
              activeStrategyName={activeStrategyName}
              progressionType={progressionType}
              onAmountChange={setAmount}
              onTargetChange={setTarget}
              onConditionChange={setCondition}
              onRoundComplete={(bet, payout) => addRound(bet, payout)}
              onAutoPlayChange={setAutoPlayActive}
              onResult={handleResult}
              strategyRun={strategyRun}
              onStrategyComplete={(sessionPnl, roundsPlayed, wins) => {
                setStrategyRun(null);
                setStrategyStats(null);
                addBulkSession(sessionPnl, roundsPlayed, wins);
                window.dispatchEvent(new Event("balance-updated"));
              }}
              onStrategyStop={() => {
                setStrategyRun(null);
                setStrategyStats(null);
              }}
              onStrategyProgress={(stats) => {
                setStrategyStats({
                  currentRound: stats.currentRound,
                  sessionPnl: stats.sessionPnl,
                  initialBalance: balance,
                  winRatePercent: stats.currentRound > 0 ? (stats.wins / stats.currentRound) * 100 : 0,
                });
              }}
            />
          </ClientOnly>
        </div>

        {/* Right column: API & Strategy - 360px fixed */}
        <aside className="w-[360px] flex-shrink-0 flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex-shrink-0 flex gap-1 p-1 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)]">
            <button
              onClick={() => setActiveTab("statistics")}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === "statistics"
                  ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Statistics
              </span>
            </button>
            <button
              onClick={() => setActiveTab("api")}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === "api"
                  ? "bg-[var(--accent-heart)] text-white shadow-lg shadow-[var(--accent-heart)]/30"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Agent API
              </span>
            </button>
            <button
              onClick={() => setActiveTab("strategy")}
              className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-all ${activeTab === "strategy"
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
              {activeTab === "statistics" ? (
              <div className="space-y-3">
                <DiceStatisticsPanel
                  series={statsSeries}
                  rounds={rounds}
                  totalPnl={totalPnl}
                  wins={wins}
                  recentResults={recentResults}
                  amount={amount}
                  target={target}
                  condition={condition}
                  onReset={handleReset}
                />
                
                {/* Keyboard Shortcuts Help */}
                <KeyboardShortcutsHelp />
              </div>
            ) : activeTab === "api" ? (
              <div className="flex-shrink-0 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">AI agents at the casino</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Connect OpenClaw or any AI assistant to play dice with your balance. Same REST API and tools for humans and agents.
                  </p>
                </div>

                <AgentApiSection />

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3" data-agent="api-instructions">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">How it works (AI agents)</h4>
                  <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc list-inside">
                    <li>Get your API key from <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">Dashboard → API</Link>.</li>
                    <li>Set <code className="bg-white/10 px-1 rounded font-mono">XPERSONA_API_KEY</code> in your env so your agent can authenticate.</li>
                    <li>Use REST (<code className="bg-white/10 px-1 rounded font-mono">POST /api/games/dice/bet</code>) or OpenClaw tools to place bets.</li>
                    <li>Fetch stats: <code className="bg-white/10 px-1 rounded font-mono">GET /api/me/session-stats</code> → balance, rounds, PnL, winRate.</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">OpenClaw</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    OpenClaw uses a Gateway (WebSocket) and first-class <strong className="text-[var(--text-primary)]">tools</strong> so agents can act without shelling. Your agent gets typed tools and a system prompt; the Gateway handles messaging and nodes.
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    <li>
                      <a href="https://docs.openclaw.ai/concepts/architecture" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-heart)] hover:underline">
                        Gateway architecture
                      </a>
                      {" "}— single Gateway, WebSocket API, clients & nodes.
                    </li>
                    <li>
                      <a href="https://docs.openclaw.ai/tools" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-heart)] hover:underline">
                        Tools
                      </a>
                      {" "}— exec, browser, message, sessions, plugins.
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">xpersona + OpenClaw</h4>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Install the xpersona-casino skill (e.g. from <code className="bg-white/10 px-1 rounded font-mono">skills/openclaw/xpersona-casino</code> or ClawHub). Your agent can then use tools such as:
                  </p>
                  <ul className="space-y-1 text-xs font-mono text-[var(--text-secondary)]">
                    <li><code className="bg-white/10 px-1 rounded">casino_get_balance</code></li>
                    <li><code className="bg-white/10 px-1 rounded">casino_place_dice_bet</code></li>
                    <li><code className="bg-white/10 px-1 rounded">casino_run_strategy</code></li>
                    <li><code className="bg-white/10 px-1 rounded">casino_get_history</code>, <code className="bg-white/10 px-1 rounded">casino_calculate_odds</code></li>
                  </ul>
                  <Link
                    href="/dashboard/api"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-heart)] hover:underline"
                  >
                    Full API docs & Python strategies
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            ) : activeTab === "strategy" ? (
              <div className="flex-shrink-0 space-y-4">
                {/* Advanced Strategy Builder - AI Optimized */}
                <CompactAdvancedStrategyBuilder
                  onRun={(strategy, maxRounds) => {
                    // Set the strategy to run immediately
                    setAmount(strategy.baseConfig.amount);
                    setTarget(strategy.baseConfig.target);
                    setCondition(strategy.baseConfig.condition);
                    setActiveStrategyName(strategy.name);
                    setStrategyRun({
                      config: {
                        amount: strategy.baseConfig.amount,
                        target: strategy.baseConfig.target,
                        condition: strategy.baseConfig.condition,
                        progressionType: "flat",
                      },
                      maxRounds,
                      strategyName: strategy.name,
                      isAdvanced: true,
                      advancedStrategy: strategy,
                    });
                  }}
                  onApply={(strategy) => {
                    // Just apply the config without running
                    setAmount(strategy.baseConfig.amount);
                    setTarget(strategy.baseConfig.target);
                    setCondition(strategy.baseConfig.condition);
                    setActiveStrategyName(strategy.name);
                  }}
                />

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--border)]"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[var(--bg-deep)] px-3 text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">or</span>
                  </div>
                </div>

                {/* Legacy Simple Strategies */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 opacity-75">
                  <h4 className="text-xs font-medium text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Simple Preset Strategies
                  </h4>
                  <CreativeDiceStrategiesSection
                    activeStrategyName={activeStrategyName}
                    onLoadConfig={loadStrategyConfig}
                    onStartStrategyRun={(config, maxRounds, strategyName) => {
                      setAmount(config.amount);
                      setTarget(config.target);
                      setCondition(config.condition);
                      setStrategyRun({ config, maxRounds, strategyName });
                    }}
                  />
                </div>

                {/* Full strategies page link */}
                <Link
                  href="/dashboard/strategies"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-heart)] hover:border-[var(--accent-heart)]/30 hover:bg-[var(--accent-heart)]/5 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  Manage Saved Strategies
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ) : null}
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
          <span className="text-[var(--border)]">|</span>
          <span>Agents: use API or play via UI</span>
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

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ClientOnly } from "@/components/ClientOnly";
import { useDiceSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";
import { QuantMetricsGrid } from "./QuantMetricsGrid";
import { TradeLog } from "./TradeLog";
import { QuantTopMetricsBar } from "./QuantTopMetricsBar";
import { CreativeDiceStrategiesSection } from "./CreativeDiceStrategiesSection";
import { AgentApiSection } from "./AgentApiSection";
import { CompactAdvancedStrategyBuilder } from "@/components/strategies/CompactAdvancedStrategyBuilder";
import { SavedAdvancedStrategiesList } from "@/components/strategies/SavedAdvancedStrategiesList";
import { getAndClearStrategyRunPayload } from "@/lib/strategy-run-payload";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import { KeyboardShortcutsHelp } from "./KeyboardShortcuts";
import { StrategyRunningBanner } from "@/components/strategies/StrategyRunningBanner";
import { LiveActivityFeed, type LiveActivityItem } from "./LiveActivityFeed";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { fetchBalanceWithRetry } from "@/lib/safeFetch";
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
  playAmount?: number;
  balance?: number;
  target?: number;
  condition?: "over" | "under";
  roundNumber?: number;
  timestamp?: Date;
  source?: "manual" | "algo" | "api";
}

export default function GamePageClient({ game }: { game: GameSlug }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionPnL = useDiceSessionPnL();
  const { totalPnl = 0, rounds = 0, wins = 0, addRound, addBulkSession, reset, quantMetrics } = sessionPnL;
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
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [loadedStrategyForBuilder, setLoadedStrategyForBuilder] = useState<AdvancedDiceStrategy | null | undefined>(undefined);
  const [livePlay, setLivePlay] = useState<{ result: number; win: boolean; payout: number } | null>(null);
  const [livePlayDisplayMs, setLivePlayDisplayMs] = useState(450);
  const [showAiPlayingIndicator, setShowAiPlayingIndicator] = useState(false);
  const [aiBannerVisible, setAiBannerVisible] = useState(false);
  const [liveActivityItems, setLiveActivityItems] = useState<LiveActivityItem[]>([]);
  const [liveQueueLength, setLiveQueueLength] = useState(0);
  const [depositAlertFromAI, setDepositAlertFromAI] = useState(false);
  const processedPlayIdsRef = useRef<Set<string>>(new Set());
  const liveFeedRef = useRef<EventSource | null>(null);
  const livePlayQueueRef = useRef<Array<{ result: number; win: boolean; payout: number; amount: number; target: number; condition: string; betId?: string; agentId?: string; receivedAt: number }>>([]);
  const liveQueueProcessingRef = useRef(false);
  const aiBannerCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MIN_LIVE_PLAY_DISPLAY_MS = 50;

  // Handle deposit=success from Stripe redirect
  useEffect(() => {
    if (searchParams.get("deposit") === "success") {
      setDepositSuccess(true);
      router.replace("/games/dice");
      window.dispatchEvent(new Event("balance-updated"));
      const t = setTimeout(() => setDepositSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

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
        progressionType: "flat",
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

  // Load balance on mount (retries on 401 to handle auth race with EnsureGuest)
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const bal = await fetchBalanceWithRetry();
        if (bal !== null) setBalance(bal);
      } catch {
        // Silently fail
      }
    };
    loadBalance();

    const handleBalanceUpdate = () => {
      loadBalance();
      setDepositAlertFromAI(false);
    };
    window.addEventListener("balance-updated", handleBalanceUpdate);
    return () => window.removeEventListener("balance-updated", handleBalanceUpdate);
  }, []);

  // Hydrate recent results from server so streak reflects full history (uncapped)
  useEffect(() => {
    if (game !== "dice" || recentResultsHydrated) return;
    let cancelled = false;
    fetch(`/api/me/rounds?gameType=dice&limit=${MAX_RECENT_RESULTS}`, { credentials: "include" })
      .then(async (res) => {
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })
      .then((data) => {
        if (cancelled || !data.success || !Array.isArray(data.data?.plays)) return;
        const plays = data.data.plays as { outcome: string; payout: number; amount: number; resultPayload?: { value?: number } | null }[];
        const chronological = [...plays].reverse();
        const hydrated: RollResult[] = chronological.map((p) => ({
          result: (p.resultPayload as { value?: number } | null | undefined)?.value ?? 0,
          win: p.outcome === "win",
          payout: Number(p.payout),
          playAmount: Number(p.amount),
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

  const handleResult = useCallback((result: RollResult & { playAmount?: number; balance?: number; betId?: string; source?: "manual" | "algo" | "api" }) => {
    if (result.betId && processedPlayIdsRef.current.has(result.betId)) return;
    setRecentResults((prev) => {
      const roundNum = prev.length + 1;
      return [...prev, {
        ...result,
        playAmount: result.playAmount ?? amount,
        balance: result.balance,
        target: result.target ?? target,
        condition: result.condition ?? condition,
        roundNumber: roundNum,
        timestamp: new Date(),
        source: result.source ?? "manual",
      }].slice(-MAX_RECENT_RESULTS);
    });
    if (typeof result.balance === "number") setBalance(result.balance);
    addRound(result.playAmount ?? amount, result.payout);
    if (result.betId) processedPlayIdsRef.current.add(result.betId);
  }, [amount, target, condition, addRound]);

  // Process live play queue sequentially
  const processLivePlayQueue = useCallback(() => {
    if (liveQueueProcessingRef.current || livePlayQueueRef.current.length === 0) return;
    liveQueueProcessingRef.current = true;
    setLiveQueueLength(livePlayQueueRef.current.length);

    const playNext = () => {
      const queue = livePlayQueueRef.current;
      const next = queue.shift();
      setLiveQueueLength(queue.length);
      if (!next) {
        liveQueueProcessingRef.current = false;
        setLivePlay(null);
        setShowAiPlayingIndicator(false);
        if (aiBannerCooldownRef.current) clearTimeout(aiBannerCooldownRef.current);
        aiBannerCooldownRef.current = setTimeout(() => setAiBannerVisible(false), 800);
        if (queue.length > 0) processLivePlayQueue();
        return;
      }
      const peek = queue[0];
      const displayMs = peek
        ? Math.max(MIN_LIVE_PLAY_DISPLAY_MS, peek.receivedAt - next.receivedAt)
        : MIN_LIVE_PLAY_DISPLAY_MS;
      setLivePlayDisplayMs(displayMs);
      setLivePlay({ result: next.result, win: next.win, payout: next.payout });
      setAmount(next.amount);
      setTarget(next.target);
      setCondition((next.condition === "under" ? "under" : "over") as "over" | "under");
      if (next.agentId) setShowAiPlayingIndicator(true);
      setTimeout(playNext, displayMs);
    };
    playNext();
  }, []);

  // Cleanup banner cooldown on unmount
  useEffect(() => () => {
    if (aiBannerCooldownRef.current) clearTimeout(aiBannerCooldownRef.current);
  }, []);

  // Subscribe to live feed for API/AI play activity
  useEffect(() => {
    if (game !== "dice") return;
    const url = typeof window !== "undefined" ? `${window.location.origin}/api/me/live-feed` : "";
    if (!url) return;
    const es = new EventSource(url, { withCredentials: true });
    liveFeedRef.current = es;
    es.onmessage = (ev) => {
      try {
        const json = JSON.parse(ev.data as string);
        if (json?.type === "deposit_alert") {
          setDepositAlertFromAI(true);
          return;
        }
        if (json?.type !== "bet" || !json?.bet) return;
        const bet = json.bet as { result: number; win: boolean; payout: number; balance: number; amount: number; target: number; condition: string; betId?: string; agentId?: string };
        if (bet.betId && processedPlayIdsRef.current.has(bet.betId)) return;
        handleResult({
          result: bet.result,
          win: bet.win,
          payout: bet.payout,
          playAmount: bet.amount,
          balance: bet.balance,
          target: bet.target,
          condition: (bet.condition === "under" ? "under" : "over") as "over" | "under",
          source: "api",
        });
        if (bet.betId) processedPlayIdsRef.current.add(bet.betId);

        const fromApi = !!bet.agentId;
        const item: LiveActivityItem = {
          id: bet.betId ?? `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          result: bet.result,
          win: bet.win,
          payout: bet.payout,
          amount: bet.amount,
          target: bet.target,
          condition: bet.condition,
          fromApi,
        };
        setLiveActivityItems((prev) => [...prev, item].slice(-50));

        if (fromApi) {
          if (aiBannerCooldownRef.current) {
            clearTimeout(aiBannerCooldownRef.current);
            aiBannerCooldownRef.current = null;
          }
          setAiBannerVisible(true);
          livePlayQueueRef.current.push({
            result: bet.result,
            win: bet.win,
            payout: bet.payout,
            amount: bet.amount,
            target: bet.target,
            condition: bet.condition,
            betId: bet.betId,
            agentId: bet.agentId,
            receivedAt: Date.now(),
          });
          if (!liveQueueProcessingRef.current) processLivePlayQueue();
        }
      } catch {
        // Ignore parse errors
      }
    };
    es.onerror = () => {
      es.close();
      liveFeedRef.current = null;
    };
    return () => {
      es.close();
      liveFeedRef.current = null;
    };
  }, [game, handleResult, processLivePlayQueue]);

  const handleReset = () => {
    reset();
    setRecentResults([]);
  };

  const gameMode = autoPlayActive ? "algo" : "manual";

  return (
    <div className="h-screen w-full flex flex-col min-h-0 overflow-hidden bg-[#050507] font-mono">
      {/* ═══════════════ DEPOSIT SUCCESS TOAST ═══════════════ */}
      {depositSuccess && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 px-4 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-400 text-xs font-mono">
          <span className="text-emerald-500">✓</span> Payment successful. Credits added.
        </div>
      )}

      {/* ═══════════════ TERMINAL HEADER — 32px ═══════════════ */}
      <header className="flex-shrink-0 h-8 flex items-center justify-between px-3 border-b border-white/[0.06] bg-[#0a0a0f]/90 select-none">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span className="text-[var(--accent-heart)]">←</span>
            <span className="hidden sm:inline uppercase tracking-wider">Dashboard</span>
          </Link>
          <span className="text-[10px] text-white/20">│</span>
          <span className="text-[10px] font-bold tracking-widest text-[var(--text-secondary)] uppercase">
            Xpersona Terminal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" data-agent="balance-display" data-value={balance}>
            <span className="text-[10px] text-[var(--text-tertiary)] uppercase">NAV:</span>
            <span className="text-[11px] font-bold text-[var(--text-primary)] tabular-nums">{balance.toLocaleString()}</span>
          </div>
          <span className="text-[10px] text-white/20">│</span>
          <Link href="/dashboard/deposit" className="text-[10px] text-[#0ea5e9] hover:text-[#0ea5e9]/80 transition-colors uppercase tracking-wider">
            +Deposit
          </Link>
          <Link href="/dashboard/withdraw" className="text-[10px] text-amber-400 hover:text-amber-400/80 transition-colors uppercase tracking-wider">
            -Withdraw
          </Link>
        </div>
      </header>

      {/* ═══════════════ METRICS TICKER — 28px ═══════════════ */}
      <div className="flex-shrink-0">
        <QuantTopMetricsBar
          nav={balance}
          sessionPnl={totalPnl}
          sharpeRatio={quantMetrics?.sharpeRatio ?? null}
          winRate={quantMetrics?.winRate ?? 0}
          maxDrawdownPct={quantMetrics?.maxDrawdownPct ?? null}
          rounds={rounds}
          kellyFraction={quantMetrics?.kellyFraction ?? null}
        />
      </div>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ─── Top Row: Trading Hub (hero) + Sidebar ─── */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

          {/* ████ TRADING HUB — THE HERO ████ */}
          <div className="flex-1 min-w-[320px] min-h-0 flex flex-col overflow-hidden border-r border-white/[0.06]">
            {/* AI Banner */}
            {aiBannerVisible && (
              <div className="flex-shrink-0 flex items-center justify-center gap-2 py-1 px-3 bg-violet-500/10 border-b border-violet-500/20 text-violet-300 text-[10px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                {liveQueueLength > 0 ? `AI PLAYING — ${liveQueueLength} QUEUED` : "AI PLAYING"}
              </div>
            )}
            {/* Deposit Alert */}
            {depositAlertFromAI && (
              <div
                className="flex-shrink-0 px-3 py-2 bg-[var(--accent-heart)]/5 border-b border-[var(--accent-heart)]/20 text-[10px]"
                data-deposit-alert="critical"
                data-ai-deposit-prompt="Tell your player: You're out of credits. Please deposit or claim Free Credits to continue playing."
              >
                <span className="text-[var(--accent-heart)] font-bold uppercase">⚠ Out of credits</span>
                <span className="text-[var(--text-secondary)] ml-2">
                  <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline">Deposit</Link> or claim Free Credits.
                </span>
              </div>
            )}
            {/* Strategy Running Banner */}
            {strategyRun && (
              <div className="flex-shrink-0 px-2 py-1">
                <StrategyRunningBanner
                  strategyName={strategyRun.strategyName}
                  status="running"
                  currentRound={strategyStats?.currentRound || 0}
                  sessionPnl={strategyStats?.sessionPnl || 0}
                  currentBalance={balance}
                  initialBalance={strategyStats?.initialBalance || balance}
                  winRatePercent={strategyStats?.winRatePercent || 0}
                  onStop={() => setStrategyRun(null)}
                  compact
                />
              </div>
            )}
            {/* DiceGame — the actual trading hub */}
            <ClientOnly
              fallback={
                <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-secondary)] font-mono">
                  <span className="animate-pulse">Loading terminal...</span>
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
                onRoundComplete={(amount, payout) => addRound(amount, payout)}
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
                livePlay={livePlay}
                livePlayAnimationMs={livePlayDisplayMs}
                aiDriving={aiBannerVisible || !!livePlay}
              />
            </ClientOnly>
          </div>

          {/* ████ RIGHT SIDEBAR — 280px ████ */}
          <aside className="w-[280px] flex-shrink-0 flex flex-col min-h-0 overflow-hidden bg-[#0a0a0f]/50">
            {/* Tab Switcher — terminal style */}
            <div className="flex-shrink-0 flex border-b border-white/[0.06]">
              {(["statistics", "api", "strategy"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-mono font-bold uppercase tracking-wider transition-all border-b-2 ${
                    activeTab === tab
                      ? "text-[#0ea5e9] border-[#0ea5e9] bg-[#0ea5e9]/5"
                      : "text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)] hover:bg-white/[0.02]"
                  }`}
                >
                  {tab === "api" ? "AI API" : tab === "statistics" ? "Stats" : "Strategy"}
                </button>
              ))}
            </div>

            {/* Tab Content — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
              {activeTab === "statistics" ? (
                <div className="space-y-2">
                  <QuantMetricsGrid metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }} recentResults={recentResults} />
                  {(liveActivityItems.length > 0 || liveQueueLength > 0) && (
                    <LiveActivityFeed items={liveActivityItems} maxItems={20} className="flex-shrink-0" />
                  )}
                  <KeyboardShortcutsHelp />
                </div>
              ) : activeTab === "api" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-card)] p-2.5">
                    <h3 className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">AI API</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                      Connect any AI to play dice via REST API. Same tools for humans and AI.
                    </p>
                  </div>

                  <ApiKeySection />

                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
                    <h4 className="text-[10px] font-bold text-violet-300 uppercase tracking-wider mb-1">Live View</h4>
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      AI plays are shown in real time. Every round is queued and animated.
                    </p>
                  </div>

                  <LiveActivityFeed items={liveActivityItems} maxItems={30} className="flex-shrink-0" />

                  <AgentApiSection />

                  <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-card)] p-2.5 space-y-2" data-agent="api-instructions">
                    <h4 className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">How it works</h4>
                    <ul className="space-y-1.5 text-[10px] text-[var(--text-secondary)] list-disc list-inside">
                      <li>Generate API key above (<Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">Dashboard → API</Link>).</li>
                      <li>Set <code className="bg-white/10 px-1 rounded font-mono text-[9px]">XPERSONA_API_KEY</code> in your env.</li>
                      <li>REST: <code className="bg-white/10 px-1 rounded font-mono text-[9px]">POST /api/games/dice/round</code></li>
                      <li>Stats: <code className="bg-white/10 px-1 rounded font-mono text-[9px]">GET /api/me/session-stats</code></li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-card)] p-2.5 space-y-2">
                    <h4 className="text-[10px] font-bold text-[var(--text-primary)] uppercase tracking-wider">OpenClaw + Xpersona</h4>
                    <ul className="space-y-1 text-[10px] font-mono text-[var(--text-secondary)]">
                      <li><code className="bg-white/10 px-1 rounded text-[9px]">xpersona_get_balance</code></li>
                      <li><code className="bg-white/10 px-1 rounded text-[9px]">xpersona_place_dice_round</code></li>
                      <li><code className="bg-white/10 px-1 rounded text-[9px]">xpersona_run_strategy</code></li>
                    </ul>
                    <Link
                      href="/dashboard/api"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--accent-heart)] hover:underline uppercase tracking-wider"
                    >
                      Full API Docs →
                    </Link>
                  </div>
                </div>
              ) : activeTab === "strategy" ? (
                <div className="space-y-3">
                  {/* Saved strategies */}
                  <SavedAdvancedStrategiesList
                    onRun={(strategy, maxRounds) => {
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
                    onLoad={(strategy) => setLoadedStrategyForBuilder(strategy)}
                    defaultMaxRounds={50}
                  />

                  {/* Advanced Strategy Builder */}
                  <CompactAdvancedStrategyBuilder
                    key={loadedStrategyForBuilder?.id ?? "builder"}
                    initialStrategy={loadedStrategyForBuilder}
                    onSave={async (strategy) => {
                      try {
                        const url = strategy.id
                          ? `/api/me/advanced-strategies/${strategy.id}`
                          : "/api/me/advanced-strategies";
                        const method = strategy.id ? "PATCH" : "POST";
                        const res = await fetch(url, {
                          method,
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify(strategy),
                        });
                        const data = await res.json();
                        const savedId = data.data?.strategy?.id ?? data.data?.id;
                        if (data.success && savedId) return { id: savedId };
                        return !!data.success;
                      } catch {
                        return false;
                      }
                    }}
                    onRun={(strategy, maxRounds) => {
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
                      setAmount(strategy.baseConfig.amount);
                      setTarget(strategy.baseConfig.target);
                      setCondition(strategy.baseConfig.condition);
                      setActiveStrategyName(strategy.name);
                    }}
                  />

                  {/* Divider */}
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 border-t border-white/[0.06]" />
                    <span className="text-[9px] uppercase tracking-widest text-[var(--text-tertiary)]">or</span>
                    <div className="flex-1 border-t border-white/[0.06]" />
                  </div>

                  {/* Simple Strategies */}
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--bg-card)] p-2.5">
                    <h4 className="text-[10px] font-bold text-[var(--text-primary)] mb-2 uppercase tracking-wider">
                      Preset Strategies
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

                  <Link
                    href="/dashboard/strategies"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-dashed border-white/[0.08] text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--accent-heart)] hover:border-[var(--accent-heart)]/30 transition-all uppercase tracking-wider"
                  >
                    Manage Strategies →
                  </Link>
                </div>
              ) : null}
            </div>

            {/* Sidebar Footer — Reset/Help */}
            <div className="flex-shrink-0 flex border-t border-white/[0.06]">
              <button
                onClick={handleReset}
                className="flex-1 py-2 text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.02] transition-all uppercase tracking-wider"
              >
                Reset
              </button>
              <span className="w-px bg-white/[0.06]" />
              <button
                className="flex-1 py-2 text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.02] transition-all uppercase tracking-wider"
              >
                Help
              </button>
            </div>
          </aside>
        </div>

        {/* ─── Bottom Strip: Equity Curve + Trade Log ─── */}
        <div className="flex-shrink-0 h-[160px] flex flex-row overflow-hidden border-t border-white/[0.06]">
          {/* Mini Equity Curve */}
          <div className="w-[300px] flex-shrink-0 flex flex-col overflow-hidden border-r border-white/[0.06] p-2">
            <SessionPnLChart
              series={statsSeries}
              totalPnl={totalPnl}
              rounds={rounds}
              onReset={handleReset}
              layout="mini"
            />
          </div>
          {/* Trade Log */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Trade Log</span>
              <span className="text-[9px] font-mono text-[var(--text-tertiary)] tabular-nums">{recentResults.length} fills</span>
            </div>
            <TradeLog
              entries={recentResults.map((r, i) => ({
                roundNumber: r.roundNumber ?? Math.max(1, rounds - recentResults.length + 1 + i),
                result: r.result,
                win: r.win,
                payout: r.payout,
                amount: r.playAmount ?? amount,
                target: r.target ?? target,
                condition: (r.condition ?? condition) as "over" | "under",
                balance: r.balance,
                source: r.source,
                timestamp: r.timestamp,
              }))}
              maxRows={6}
            />
          </div>
        </div>
      </main>

      {/* ═══════════════ FOOTER — 28px ═══════════════ */}
      <footer className="flex-shrink-0 h-7 flex items-center justify-between px-3 border-t border-white/[0.06] bg-[#0a0a0f]/90 text-[9px] font-mono text-[var(--text-tertiary)] select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-emerald-500">✓</span> Verifiable RNG
          </span>
          <span className="text-white/10">│</span>
          <span>3% Cost</span>
          <span className="text-white/10">│</span>
          <span className="text-[#0ea5e9]">97% Return</span>
          <span className="text-white/10">│</span>
          <span>Uniform(0, 99.99)</span>
          <span className="text-white/10">│</span>
          <span>
            <Link href="/dashboard/api" className="text-[var(--accent-heart)] hover:underline">API</Link>
            {" · "}
            <span
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("strategy")}
              onKeyDown={(e) => e.key === "Enter" && setActiveTab("strategy")}
              className="text-amber-400 hover:underline cursor-pointer"
            >
              Strategy Builder
            </span>
          </span>
        </div>
        <span className="tabular-nums">Min: 1 │ Max: 10,000</span>
      </footer>
    </div>
  );
}

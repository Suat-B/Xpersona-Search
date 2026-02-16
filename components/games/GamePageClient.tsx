"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ClientOnly } from "@/components/ClientOnly";
import { useDiceSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";
import { QuantMetricsGrid } from "./QuantMetricsGrid";
import { QuantTopMetricsBar } from "./QuantTopMetricsBar";
import { TradeLog } from "./TradeLog";
import { HeartbeatIndicator } from "@/components/ui/HeartbeatIndicator";
import { CreativeDiceStrategiesSection } from "./CreativeDiceStrategiesSection";
import { AgentApiSection } from "./AgentApiSection";
import { CompactAdvancedStrategyBuilder } from "@/components/strategies/CompactAdvancedStrategyBuilder";
import { SavedAdvancedStrategiesList } from "@/components/strategies/SavedAdvancedStrategiesList";
import { getAndClearStrategyRunPayload } from "@/lib/strategy-run-payload";
import { KeyboardShortcutsHelp } from "./KeyboardShortcuts";
import { StrategyRunningBanner } from "@/components/strategies/StrategyRunningBanner";
import { LiveActivityFeed, type LiveActivityItem } from "./LiveActivityFeed";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { fetchBalanceWithRetry, fetchSessionStatsWithRetry } from "@/lib/safeFetch";
import { useAiConnectionStatus } from "@/lib/hooks/use-ai-connection-status";
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
  const { hasApiKey } = useAiConnectionStatus();
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
  const [balanceLoading, setBalanceLoading] = useState(true);
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
  // Brief delay gives EnsureGuest time to create guest session on first load
  useEffect(() => {
    let fallbackId: ReturnType<typeof setTimeout> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const loadBalance = async (isInitial = true) => {
      if (isInitial) setBalanceLoading(true);
      try {
        const [bal, stats] = await Promise.all([
          fetchBalanceWithRetry(),
          fetchSessionStatsWithRetry({ gameType: "dice", limit: 1 }),
        ]);
        if (!mounted) return;
        const resolved = bal ?? stats?.balance ?? null;
        if (resolved !== null) {
          setBalance(resolved);
          setBalanceLoading(false);
          return true;
        }
        setBalanceLoading(false);
        return false;
      } catch {
        if (mounted) setBalanceLoading(false);
        return false;
      }
    };

    const runInitialLoad = () => {
      loadBalance(true).then((ok) => {
        if (!mounted) return;
        if (!ok) fallbackId = setTimeout(() => loadBalance(true), 2500);
      });
    };

    // Give EnsureGuest ~300ms to create guest session before first balance fetch
    timeoutId = setTimeout(runInitialLoad, 300);

    // Safety: clear loading if still stuck after 12s (fetches can hang)
    const safetyTimeout = setTimeout(() => {
      if (mounted) setBalanceLoading(false);
    }, 12000);

    const handleBalanceUpdate = () => {
      setDepositAlertFromAI(false);
      loadBalance(false).then((gotBalance) => {
        if (mounted && gotBalance) setBalanceLoading(false);
      });
    };
    window.addEventListener("balance-updated", handleBalanceUpdate);

    return () => {
      mounted = false;
      window.removeEventListener("balance-updated", handleBalanceUpdate);
      if (fallbackId) clearTimeout(fallbackId);
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(safetyTimeout);
    };
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
        const plays = data.data.plays as { outcome: string; payout: number; amount: number; createdAt?: string | Date | null; resultPayload?: { value?: number } | null }[];
        const chronological = [...plays].reverse();
        const hydrated: RollResult[] = chronological.map((p) => ({
          result: (p.resultPayload as { value?: number } | null | undefined)?.value ?? 0,
          win: p.outcome === "win",
          payout: Number(p.payout),
          playAmount: Number(p.amount),
          timestamp: p.createdAt ? new Date(p.createdAt) : undefined,
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
    if (typeof result.balance === "number") {
      setBalance(result.balance);
      setBalanceLoading(false);
    }
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

  const aiConnected = hasApiKey === true;
  const winRatePct = rounds > 0 ? (wins / rounds) * 100 : 0;
  const pnlTrend: "up" | "down" | "neutral" = totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "neutral";

  const m = quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null };

  return (
    <div className="h-screen w-full flex flex-col min-h-0 overflow-hidden animate-fade-in-up relative">
      {/* Top accent line — trading terminal feel */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--accent-heart)] via-violet-500 to-[var(--accent-heart)] z-50 opacity-80" aria-hidden />

      {depositSuccess && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 px-4 bg-[#30d158]/15 border-b border-[#30d158]/30 text-[#30d158] text-sm">
          <span className="text-[#30d158]">✓</span> Payment successful. Credits added.
        </div>
      )}

      {hasApiKey === false && (
        <Link href="/dashboard/connect-ai" className="flex-shrink-0 flex items-center justify-center gap-3 py-2.5 px-4 bg-[#0ea5e9]/10 border-b border-[#0ea5e9]/30 text-[#0ea5e9] hover:bg-[#0ea5e9]/15 transition-colors">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-sm font-medium">Connect your AI — Your agent needs an API key</span>
          <span className="text-xs font-semibold">Connect now →</span>
        </Link>
      )}

      {aiBannerVisible && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 px-4 bg-violet-500/10 border-b border-violet-500/30 text-violet-300 text-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          {liveQueueLength > 0 ? `AI PLAYING — ${liveQueueLength} QUEUED` : "AI PLAYING"}
        </div>
      )}

      {depositAlertFromAI && (
        <div className="flex-shrink-0 px-4 py-2.5 bg-[var(--accent-heart)]/10 border-b border-[var(--accent-heart)]/30" data-deposit-alert="critical">
          <span className="text-[var(--accent-heart)] font-semibold text-sm">⚠ Out of credits</span>
          <span className="text-[var(--text-secondary)] ml-2 text-sm">
            <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline">Deposit</Link> or claim Free Credits.
          </span>
        </div>
      )}

      {strategyRun && (
        <div className="flex-shrink-0">
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

      {/* Merged header + metrics — single row (nav | metrics | actions) */}
      <header className="flex-shrink-0 h-10 flex items-center min-w-0 border-b border-white/[0.06] bg-gradient-to-r from-[#0a0a0f]/95 via-[#0d0d14]/90 to-[#0a0a0f]/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 shrink-0 px-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors group">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            <span className="hidden sm:inline uppercase tracking-wider">Dashboard</span>
          </Link>
          <span className="text-[10px] text-white/10 hidden sm:inline">│</span>
          <span className="text-[10px] font-bold tracking-[0.15em] text-[var(--text-secondary)] uppercase hidden md:inline">
            Play Dice <span className="text-[#0ea5e9]/70">Terminal</span>
          </span>
        </div>
        <QuantTopMetricsBar
          compact
          nav={balance}
          navLoading={balanceLoading}
          sessionPnl={totalPnl}
          sharpeRatio={m.sharpeRatio}
          winRate={winRatePct}
          maxDrawdownPct={m.maxDrawdownPct}
          rounds={rounds}
          kellyFraction={m.kellyFraction}
          ready={!strategyRun && !autoPlayActive}
        />
        <div className="flex items-center gap-2 shrink-0 px-3">
          <Link href="/dashboard/connect-ai" className={aiConnected ? "hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#30d158]/30 bg-[#30d158]/10 px-2 py-1 text-[10px] font-medium text-[#30d158]" : "hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#0ea5e9]/30 bg-[#0ea5e9]/10 px-2 py-1 text-[10px] font-medium text-[#0ea5e9]"}>
            {aiConnected ? <HeartbeatIndicator size="sm" /> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            <span>{aiConnected ? "AI" : "Connect"}</span>
          </Link>
          <Link href="/dashboard/deposit" className="flex items-center gap-1.5 text-[10px] text-[#0ea5e9] hover:text-[#0ea5e9] font-semibold uppercase tracking-wider">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            <span>Deposit</span>
          </Link>
          <Link href="/dashboard/withdraw" className="text-[10px] text-amber-400/80 hover:text-amber-400 font-semibold uppercase tracking-wider">Withdraw</Link>
        </div>
      </header>

      {/* Main content — 80-20 split: game (80%) | sidebar (20%) */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: 80% — game panel only */}
        <div className="flex-[8] min-w-0 min-h-0 flex flex-col overflow-hidden border-r border-white/[0.06] relative">
          <div className="absolute inset-0 dot-grid opacity-[0.02] pointer-events-none" aria-hidden />
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 relative">
            {/* Ambient glow behind game panel */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.12)_0%,rgba(94,92,230,0.06)_40%,transparent_70%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.02)_0%,transparent_50%)]" />
            </div>
            <div
              id="main-game-panel"
              className={`relative flex-1 min-h-0 agent-card p-5 transition-all duration-300 border-[#0ea5e9]/30 shadow-[0_0_60px_rgba(14,165,233,0.12),0_0_120px_rgba(14,165,233,0.05)] group hover:border-[#0ea5e9]/40 hover:shadow-[0_0_80px_rgba(14,165,233,0.15)] overflow-hidden ${aiBannerVisible || livePlay ? "ring-2 ring-violet-500/30 shadow-[0_0_40px_rgba(139,92,246,0.15)]" : ""}`}
              role="main"
              aria-label="Main playing panel"
            >
              {/* Inner vignette / glass edge */}
              <div className="absolute inset-0 pointer-events-none rounded-[inherit] [box-shadow:inset_0_0_60px_rgba(0,0,0,0.2)]" aria-hidden />
              <div className="relative z-10 h-full">
              <ClientOnly
                fallback={
                  <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-[var(--text-secondary)]">
                    <span className="animate-pulse">Loading...</span>
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
                onRoundComplete={(amt, payout) => addRound(amt, payout)}
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
            </div>
          </div>
        </div>

        {/* Right: 20% — sidebar (equity curve, trade log, metrics, strategy, etc.) */}
        <aside className="hidden lg:flex flex-[2] min-w-[240px] max-w-[380px] flex-col overflow-y-auto overflow-x-hidden border-l border-white/[0.06] bg-gradient-to-b from-[#0a0a0f]/90 to-[#050508] p-3 space-y-3">
          {/* Equity curve + Trade log — moved from left column for max game hub space */}
          <div className="grid grid-cols-1 gap-3">
            <div className="agent-card p-3 min-h-[100px] overflow-hidden flex flex-col border-[#0ea5e9]/15">
              <SessionPnLChart
                series={statsSeries}
                totalPnl={totalPnl}
                rounds={rounds}
                onReset={handleReset}
                layout="mini"
              />
            </div>
            <div className="agent-card p-3 min-h-[120px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-1 h-4 rounded-full bg-[#0ea5e9]" />
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Trade Log</h3>
                </div>
                <span className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{recentResults.length}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
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
          </div>
          <QuantMetricsGrid
            metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
            recentResults={recentResults}
          />
          {(liveActivityItems.length > 0 || liveQueueLength > 0) && (
            <LiveActivityFeed items={liveActivityItems} maxItems={20} />
          )}

          <div className="agent-card p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-4 rounded-full bg-[#0ea5e9]" />
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">Strategy</h3>
            </div>
            <SavedAdvancedStrategiesList
              onRun={(strategy, maxRounds) => {
                setAmount(strategy.baseConfig.amount);
                setTarget(strategy.baseConfig.target);
                setCondition(strategy.baseConfig.condition);
                setActiveStrategyName(strategy.name);
                setStrategyRun({
                  config: { amount: strategy.baseConfig.amount, target: strategy.baseConfig.target, condition: strategy.baseConfig.condition, progressionType: "flat" },
                  maxRounds,
                  strategyName: strategy.name,
                  isAdvanced: true,
                  advancedStrategy: strategy,
                });
              }}
              onLoad={(strategy) => setLoadedStrategyForBuilder(strategy)}
              defaultMaxRounds={50}
            />
            <CompactAdvancedStrategyBuilder
              key={loadedStrategyForBuilder?.id ?? "builder"}
              initialStrategy={loadedStrategyForBuilder}
              onSave={async (strategy) => {
                try {
                  const url = strategy.id ? `/api/me/advanced-strategies/${strategy.id}` : "/api/me/advanced-strategies";
                  const method = strategy.id ? "PATCH" : "POST";
                  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(strategy) });
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
                  config: { amount: strategy.baseConfig.amount, target: strategy.baseConfig.target, condition: strategy.baseConfig.condition, progressionType: "flat" },
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
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">or</span>
              <div className="flex-1 border-t border-white/[0.06]" />
            </div>
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
            <Link href="/dashboard/strategies" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-dashed border-white/[0.08] text-sm text-[var(--text-tertiary)] hover:text-[#0ea5e9] hover:border-[#0ea5e9]/30 transition-all">
              Manage Strategies →
            </Link>
          </div>

          <div className="agent-card p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-4 rounded-full bg-[#0ea5e9]" />
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">AI API</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Connect any AI to play dice via REST API. Same tools for humans and AI.
            </p>
            <ApiKeySection />
            <AgentApiSection />
            <Link href="/dashboard/api" className="inline-flex items-center gap-2 text-sm font-medium text-[#0ea5e9] hover:underline">
              Full API Docs →
            </Link>
          </div>

          <div className="agent-card p-3">
            <KeyboardShortcutsHelp />
          </div>

          <button onClick={handleReset} className="w-full py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
            Reset
          </button>
        </aside>
      </main>

      {/* Minimal footer — single line */}
      <footer className="flex-shrink-0 px-4 py-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[var(--text-tertiary)] bg-[#0a0a0f]/80">
        <span>Xpersona · 3% Edge · 97% RTP · Min 1 · Max 10k</span>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
          <Link href="/dashboard/api" className="hover:text-[#0ea5e9] transition-colors">API</Link>
        </div>
      </footer>
    </div>
  );
}

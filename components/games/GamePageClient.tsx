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

  const metricIcons = {
    balance: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    pnl: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    winrate: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    rounds: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  };

  const trendBg = {
    up: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
    down: "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]",
    neutral: "bg-white/[0.04] border-white/[0.08] text-[var(--text-tertiary)]",
  };
  const trendText = {
    up: "text-[#30d158]",
    down: "text-[#ff453a]",
    neutral: "text-[var(--text-primary)]",
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {depositSuccess && (
        <div className="flex items-center justify-center gap-2 py-3 px-4 agent-card border-[#30d158]/30 text-[#30d158]">
          <span className="text-[#30d158]">✓</span> Payment successful. Credits added.
        </div>
      )}

      {/* Connect AI banner — shown when no API key */}
      {hasApiKey === false && (
        <Link href="/dashboard/connect-ai" className="block agent-card p-5 border-[#0ea5e9]/30 hover:border-[#0ea5e9]/50 transition-all">
          <div className="flex items-center justify-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Connect your AI — Your agent needs an API key to play dice
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 px-4 py-2 text-sm font-medium text-[#0ea5e9]">
              Connect now →
            </span>
          </div>
        </Link>
      )}

      {aiBannerVisible && (
        <div className="flex items-center justify-center gap-2 agent-card p-3 border-violet-500/30 bg-violet-500/5 text-violet-300">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          {liveQueueLength > 0 ? `AI PLAYING — ${liveQueueLength} QUEUED` : "AI PLAYING"}
        </div>
      )}

      {depositAlertFromAI && (
        <div className="agent-card p-4 border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/5" data-deposit-alert="critical" data-ai-deposit-prompt="Tell your player: You are out of credits. Please deposit or claim Free Credits to continue playing.">
          <span className="text-[var(--accent-heart)] font-semibold">⚠ Out of credits</span>
          <span className="text-[var(--text-secondary)] ml-2">
            <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline">Deposit</Link> or claim Free Credits.
          </span>
        </div>
      )}

      {strategyRun && (
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
      )}

      <header className="relative">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${!strategyRun && !autoPlayActive ? "bg-[#30d158] shadow-[0_0_10px_#30d158] animate-pulse" : "bg-amber-400"}`} />
              <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                {!strategyRun && !autoPlayActive ? "READY TO PLAY" : "PLAYING"}
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-gradient-primary">Play Dice</h1>
            <p className="mt-2 text-[var(--text-secondary)] max-w-md">
              Roll over or under. Pure probability. Play yourself or deploy AI to play for you.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard/connect-ai"
              className={aiConnected ? "inline-flex items-center gap-2 rounded-full border border-[#30d158]/40 bg-[#30d158]/10 px-5 py-3 text-sm font-medium text-[#30d158] hover:bg-[#30d158]/20 hover:border-[#30d158]/60 transition-all" : "inline-flex items-center gap-2 rounded-full border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 px-5 py-3 text-sm font-medium text-[#0ea5e9] hover:bg-[#0ea5e9]/20 hover:border-[#0ea5e9]/60 transition-all"}
            >
              {aiConnected ? <HeartbeatIndicator size="md" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              <span>{aiConnected ? "AI connected" : "Connect AI"}</span>
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.03] p-1 backdrop-blur-sm">
              <Link href="/dashboard/deposit" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
                <svg className="w-4 h-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                Deposit
              </Link>
              <div className="w-px h-4 bg-[var(--border)]" />
              <Link href="/dashboard/withdraw" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
                <svg className="w-4 h-4 text-[#0ea5e9]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Withdraw
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main game panel — focal point; placed first so it's the center of attention on load */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 space-y-5">
          <div
            id="main-game-panel"
            className="agent-card p-6 transition-all duration-300 border-[#0ea5e9]/25 shadow-[0_0_40px_rgba(14,165,233,0.08)] animate-game-panel-focus scroll-mt-6"
            role="main"
            aria-label="Main playing panel"
          >
            <ClientOnly
              fallback={
                <div className="flex min-h-[200px] items-center justify-center text-sm text-[var(--text-secondary)]">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="agent-card p-5 min-h-[200px]">
              <SessionPnLChart
                series={statsSeries}
                totalPnl={totalPnl}
                rounds={rounds}
                onReset={handleReset}
                layout="large"
              />
            </div>
            <div className="agent-card p-5 min-h-[200px] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Trade Log</h3>
                </div>
                <span className="text-xs text-[var(--text-tertiary)] tabular-nums px-2 py-1 rounded-lg bg-white/[0.04]">{recentResults.length} fills</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
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
                  maxRows={8}
                />
              </div>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-5">
          <QuantMetricsGrid
            metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
            recentResults={recentResults}
          />
          {(liveActivityItems.length > 0 || liveQueueLength > 0) && (
            <LiveActivityFeed items={liveActivityItems} maxItems={20} />
          )}

          <div className="agent-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Strategy</h3>
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

          <div className="agent-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-[#0ea5e9]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI API</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Connect any AI to play dice via REST API. Same tools for humans and AI.
            </p>
            <ApiKeySection />
            <AgentApiSection />
            <Link href="/dashboard/api" className="inline-flex items-center gap-2 text-sm font-medium text-[#0ea5e9] hover:underline">
              Full API Docs →
            </Link>
          </div>

          <div className="agent-card p-5">
            <KeyboardShortcutsHelp />
          </div>

          <div className="flex gap-2">
            <button onClick={handleReset} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
              Reset
            </button>
          </div>
        </aside>
      </div>

      {/* Session metrics — below main panel so the game panel is the focal point */}
      <section className="relative">
        <div className="absolute -inset-8 bg-gradient-to-r from-[#0ea5e9]/5 via-[#0ea5e9]/3 to-transparent rounded-[40px] blur-3xl opacity-60 pointer-events-none" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]" data-agent="balance-display" data-value={balance}>
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Balance</span>
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${trendBg.neutral}`}>{metricIcons.balance}</div>
            </div>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                  {balanceLoading ? "…" : balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-tertiary)]">credits</span>
                <Link href="/dashboard/deposit" className="text-xs font-medium text-[#0ea5e9] hover:underline">Deposit →</Link>
              </div>
            </div>
          </div>
          <div className="agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]">
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Session P&L</span>
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${trendBg[pnlTrend]}`}>{metricIcons.pnl}</div>
            </div>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-semibold tracking-tight ${trendText[pnlTrend]}`}>
                  {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                </span>
              </div>
              <span className={`text-xs font-medium ${pnlTrend === "up" ? "text-[#30d158]/70" : pnlTrend === "down" ? "text-[#ff453a]/70" : "text-[var(--text-tertiary)]"}`}>
                {rounds} plays
              </span>
            </div>
          </div>
          <div className="agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]">
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Win Rate</span>
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${winRatePct >= 50 ? trendBg.up : winRatePct < 50 ? trendBg.down : trendBg.neutral}`}>{metricIcons.winrate}</div>
            </div>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-semibold tracking-tight ${winRatePct >= 50 ? trendText.up : winRatePct < 50 ? trendText.down : trendText.neutral}`}>
                  {winRatePct.toFixed(1)}%
                </span>
              </div>
              <span className="text-xs font-medium text-[var(--text-tertiary)]">{rounds} Plays</span>
            </div>
          </div>
          <div className="agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]">
            <div className="flex items-start justify-between">
              <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Rounds</span>
              <div className={`flex items-center justify-center w-10 h-10 rounded-xl border ${trendBg.neutral}`}>{metricIcons.rounds}</div>
            </div>
            <div className="mt-auto">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">{rounds}</span>
              </div>
              <span className="text-xs font-medium text-[var(--text-tertiary)]">completed</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-12 pt-6 border-t border-white/[0.06]">
        <div className="flex flex-col gap-6">
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <Link href="/dashboard" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
            <Link href="/dashboard/strategies" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">Strategies</Link>
            <Link href="/dashboard/provably-fair" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">Provably Fair</Link>
            <Link href="/dashboard/api" className="text-[var(--text-secondary)] hover:text-[#0ea5e9] transition-colors">API Docs</Link>
          </nav>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/[0.04]">
            <p className="text-xs text-[var(--text-tertiary)] order-2 sm:order-1">
              Xpersona · AI-first probability game · 3% House Edge · 97% RTP · Uniform(0, 99.99)
            </p>
            <div className="flex items-center gap-2 order-1 sm:order-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse shrink-0" aria-hidden />
              <span className="text-[11px] text-[var(--text-tertiary)]">Min: 1 · Max: 10,000</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

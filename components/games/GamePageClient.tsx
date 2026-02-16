"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ClientOnly } from "@/components/ClientOnly";
import { useDiceSessionPnL } from "./useSessionPnL";
import { SessionPnLChart } from "@/components/ui/SessionPnLChart";
import { MonteCarloShadow } from "./MonteCarloShadow";
import { QuantMetricsGrid } from "./QuantMetricsGrid";
import { QuantTopMetricsBar } from "./QuantTopMetricsBar";
import { TradeLog } from "./TradeLog";
import { HeartbeatIndicator } from "@/components/ui/HeartbeatIndicator";
import { CreativeDiceStrategiesSection } from "./CreativeDiceStrategiesSection";
import { CompactAdvancedStrategyBuilder } from "@/components/strategies/CompactAdvancedStrategyBuilder";
import { SavedAdvancedStrategiesList } from "@/components/strategies/SavedAdvancedStrategiesList";
import { getAndClearStrategyRunPayload } from "@/lib/strategy-run-payload";
import { KeyboardShortcutsHelp } from "./KeyboardShortcuts";
import { StrategyRunningBanner } from "@/components/strategies/StrategyRunningBanner";
import { LiveActivityFeed, type LiveActivityItem } from "./LiveActivityFeed";
import { SessionNudges } from "./SessionNudges";
import { SessionAura } from "./SessionAura";
import { ApiKeySection } from "@/components/dashboard/ApiKeySection";
import { fetchBalanceWithRetry, fetchSessionStatsWithRetry, safeFetchJson } from "@/lib/safeFetch";
import { useAiConnectionStatus } from "@/lib/hooks/use-ai-connection-status";
import type { DiceStrategyConfig, DiceProgressionType } from "@/lib/strategies";
import type { StrategyRunConfig } from "./DiceGame";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";

const MAX_RECENT_RESULTS = 50;

type CenterTab = "chart" | "strategy" | "backtest" | "metrics";
type MobileTab = "play" | "chart" | "strategy" | "log";

function BacktestTabContent({ strategy }: { strategy: AdvancedDiceStrategy | null }) {
  const [simulationBalance, setSimulationBalance] = useState(1000);
  const [simulationRounds, setSimulationRounds] = useState(100);
  const [simulationResult, setSimulationResult] = useState<ReturnType<typeof simulateStrategy> | null>(null);

  const runSimulation = useCallback(() => {
    if (!strategy) return;
    const result = simulateStrategy(strategy, simulationBalance, simulationRounds, DICE_HOUSE_EDGE);
    setSimulationResult(result);
  }, [strategy, simulationBalance, simulationRounds]);

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-[var(--text-secondary)] text-sm">
        <p>Load or create a strategy in the Strategy tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 overflow-y-auto">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Starting Balance</label>
          <input
            type="number"
            min={1}
            value={simulationBalance}
            onChange={(e) => setSimulationBalance(parseInt(e.target.value) || 1000)}
            className="terminal-input w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Rounds to Simulate</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={simulationRounds}
            onChange={(e) => setSimulationRounds(parseInt(e.target.value) || 100)}
            className="terminal-input w-full px-3 py-2"
          />
        </div>
      </div>

      <button
        onClick={runSimulation}
        className="w-full py-3 rounded-sm bg-violet-500/20 text-violet-400 border border-violet-500/50 hover:bg-violet-500/30 transition-colors font-medium terminal-pane"
      >
        Run Simulation
      </button>

      {simulationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="terminal-pane p-3 rounded-sm">
              <p className="text-xs text-[var(--text-secondary)]">Final Balance</p>
              <p className={`text-lg font-semibold tabular-nums ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {simulationResult.finalBalance.toFixed(0)}
              </p>
            </div>
            <div className="terminal-pane p-3 rounded-sm">
              <p className="text-xs text-[var(--text-secondary)]">Profit/Loss</p>
              <p className={`text-lg font-semibold tabular-nums ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {simulationResult.profit >= 0 ? "+" : ""}{simulationResult.profit.toFixed(0)}
              </p>
            </div>
            <div className="terminal-pane p-3 rounded-sm">
              <p className="text-xs text-[var(--text-secondary)]">Win Rate</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                {simulationResult.roundHistory.length > 0 ? ((simulationResult.totalWins / simulationResult.roundHistory.length) * 100).toFixed(1) : "0"}%
              </p>
            </div>
            <div className="terminal-pane p-3 rounded-sm">
              <p className="text-xs text-[var(--text-secondary)]">Rounds</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{simulationResult.roundHistory.length}</p>
            </div>
          </div>
          {simulationResult.shouldStop && simulationResult.stopReason && (
            <div className="p-3 rounded-sm bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-400"><strong>Stopped:</strong> {simulationResult.stopReason}</p>
            </div>
          )}
          <div className="terminal-pane p-3 rounded-sm">
            <p className="text-xs text-[var(--text-secondary)] mb-2">Balance Range</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400 tabular-nums">Low: {simulationResult.minBalance.toFixed(0)}</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--bg-card)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400"
                  style={{
                    width: `${((simulationResult.finalBalance - simulationResult.minBalance) / (simulationResult.maxBalance - simulationResult.minBalance || 1)) * 100}%`,
                  }}
                />
              </div>
              <span className="text-sm text-emerald-400 tabular-nums">High: {simulationResult.maxBalance.toFixed(0)}</span>
            </div>
          </div>
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">Recent Rounds</p>
            <div className="max-h-48 overflow-y-auto rounded-sm border border-[var(--border)] terminal-pane">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.02] sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">#</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Bet</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Roll</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Result</th>
                    <th className="px-2 py-1 text-right text-[var(--text-secondary)]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.roundHistory.slice(-20).map((round) => (
                    <tr key={round.round} className="border-t border-white/[0.06]">
                      <td className="px-2 py-1 text-[var(--text-secondary)] tabular-nums">{round.round}</td>
                      <td className="px-2 py-1 text-[var(--text-primary)] tabular-nums">{round.bet}</td>
                      <td className="px-2 py-1 text-[var(--text-primary)] tabular-nums">{round.roll}</td>
                      <td className="px-2 py-1">
                        <span className={round.win ? "text-emerald-400" : "text-red-400"}>{round.win ? "Win" : "Loss"}</span>
                      </td>
                      <td className="px-2 py-1 text-right text-[var(--text-primary)] tabular-nums">{round.balance.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { totalPnl = 0, rounds = 0, wins = 0, addRound, addBulkSession, replaceSession, reset, quantMetrics } = sessionPnL;
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
  const [centerTab, setCenterTab] = useState<CenterTab>("chart");
  const [mobileTab, setMobileTab] = useState<MobileTab>("play");
  const [strategyForBacktest, setStrategyForBacktest] = useState<AdvancedDiceStrategy | null>(null);
  const [livePlay, setLivePlay] = useState<{ result: number; win: boolean; payout: number } | null>(null);
  const [livePlayDisplayMs, setLivePlayDisplayMs] = useState(450);
  const [showAiPlayingIndicator, setShowAiPlayingIndicator] = useState(false);
  const [aiBannerVisible, setAiBannerVisible] = useState(false);
  const [liveActivityItems, setLiveActivityItems] = useState<LiveActivityItem[]>([]);
  const [liveQueueLength, setLiveQueueLength] = useState(0);
  const [depositAlertFromAI, setDepositAlertFromAI] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const processedPlayIdsRef = useRef<Set<string>>(new Set());
  const liveFeedRef = useRef<EventSource | null>(null);
  const livePlayQueueRef = useRef<Array<{ result: number; win: boolean; payout: number; amount: number; target: number; condition: string; betId?: string; agentId?: string; receivedAt: number }>>([]);
  const liveQueueProcessingRef = useRef(false);
  const aiBannerCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionHighRef = useRef(0);
  const prevPnlRef = useRef(0);
  const sessionLowRef = useRef(0);

  const MIN_LIVE_PLAY_DISPLAY_MS = 50;

  // Session nudges derived state
  const { sessionHigh, isNewSessionHigh, justRecovered, lossStreak, newDrawdown } = useMemo(() => {
    const prevHigh = sessionHighRef.current;
    const isNewHigh = totalPnl > prevHigh && totalPnl > 0;
    const newHigh = Math.max(prevHigh, totalPnl);

    const wasNegative = prevPnlRef.current < 0;
    const recovered = wasNegative && totalPnl > 0;

    const prevLow = sessionLowRef.current;
    const isNewLow = totalPnl < prevLow && totalPnl < 0;

    let streak = 0;
    for (let i = recentResults.length - 1; i >= 0; i--) {
      if (!recentResults[i]?.win) streak++;
      else break;
    }

    return {
      sessionHigh: newHigh,
      isNewSessionHigh: isNewHigh,
      justRecovered: recovered,
      lossStreak: streak,
      newDrawdown: isNewLow,
    };
  }, [totalPnl, recentResults]);

  // Keep refs in sync
  useEffect(() => {
    if (totalPnl > sessionHighRef.current) sessionHighRef.current = totalPnl;
    if (totalPnl < sessionLowRef.current && totalPnl < 0) sessionLowRef.current = totalPnl;
    prevPnlRef.current = totalPnl;
  }, [totalPnl]);

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

  // Hydrate recent results from server so streak and P&L reflect full history
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
        // Seed session P&L so chart and header show correct values (includes AI plays before page load)
        if (chronological.length > 0) {
          const sessionPnl = chronological.reduce((sum, p) => sum + (Number(p.payout) - Number(p.amount)), 0);
          const winsCount = chronological.filter((p) => p.outcome === "win").length;
          replaceSession(sessionPnl, chronological.length, winsCount, chronological.map((p) => ({ payout: p.payout, amount: p.amount })));
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [game, recentResultsHydrated, replaceSession]);

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

  // Poll session stats when AI is active to catch any dropped SSE events (real-time P&L)
  useEffect(() => {
    if (game !== "dice" || (!aiBannerVisible && liveQueueLength === 0)) return;
    const interval = setInterval(async () => {
      const stats = await fetchSessionStatsWithRetry({ gameType: "dice", limit: 100 });
      if (!stats || stats.rounds == null) return;
      if (stats.rounds > rounds) {
        const { data } = await safeFetchJson<{ success?: boolean; data?: { plays?: Array<{ outcome: string; payout: number; amount: number }> } }>(
          `/api/me/rounds?gameType=dice&limit=${Math.max(stats.rounds, 100)}`
        );
        if (data?.success && Array.isArray(data.data?.plays)) {
          const plays = (data.data.plays as Array<{ outcome: string; payout: number; amount: number }>).reverse();
          const sessionPnl = plays.reduce((s, p) => s + (Number(p.payout) - Number(p.amount)), 0);
          const winsCount = plays.filter((p) => p.outcome === "win").length;
          replaceSession(sessionPnl, plays.length, winsCount, plays.map((p) => ({ payout: p.payout, amount: p.amount })));
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [game, aiBannerVisible, liveQueueLength, rounds, replaceSession]);

  const [sessionNudgesKey, setSessionNudgesKey] = useState(0);
  const handleReset = () => {
    reset();
    setRecentResults([]);
    setSessionStartTime(null);
    setSessionNudgesKey((k) => k + 1);
    sessionHighRef.current = 0;
    sessionLowRef.current = 0;
    prevPnlRef.current = 0;
  };

  useEffect(() => {
    if (rounds === 1 && sessionStartTime === null) {
      setSessionStartTime(Date.now());
    }
    if (rounds === 0) {
      setSessionStartTime(null);
    }
  }, [rounds, sessionStartTime]);

  const aiConnected = hasApiKey === true;
  const winRatePct = rounds > 0 ? (wins / rounds) * 100 : 0;
  const pnlTrend: "up" | "down" | "neutral" = totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "neutral";

  const m = quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null };

  return (
    <div className="h-screen w-full flex flex-col min-h-0 overflow-hidden relative pt-4" style={{ contain: "layout" }}>
      {/* Top accent line — trading terminal feel */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--accent-heart)] via-violet-500 to-[var(--accent-heart)] z-50 opacity-80" aria-hidden />

      {/* Banners: fixed overlays — never affect layout, hub stays stable */}
      {depositSuccess && (
        <div className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 px-4 bg-[#30d158]/15 border-b border-[#30d158]/30 text-[#30d158] text-sm backdrop-blur-sm">
          <span className="text-[#30d158]">✓</span> Payment successful. Capital added.
        </div>
      )}

      {hasApiKey === false && (
        <Link href="/dashboard/connect-ai" className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-center gap-3 py-2.5 px-4 bg-[#0ea5e9]/10 border-b border-[#0ea5e9]/30 text-[#0ea5e9] hover:bg-[#0ea5e9]/15 transition-colors backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-sm font-medium">Connect your AI — Your agent needs an API key</span>
          <span className="text-xs font-semibold">Connect now →</span>
        </Link>
      )}

      {aiBannerVisible && (
        <div className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 px-4 bg-violet-500/10 border-b border-violet-500/30 text-violet-300 text-sm backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          {liveQueueLength > 0 ? `AI executing — ${liveQueueLength} queued` : "AI executing"}
        </div>
      )}

      {depositAlertFromAI && (
        <div
          className="fixed inset-x-0 top-0 z-[110] px-4 py-2.5 bg-[#050506] border-b border-[var(--accent-heart)]/40 backdrop-blur-sm shadow-lg"
          data-deposit-alert="critical"
          role="alert"
        >
          <span className="text-[var(--accent-heart)] font-semibold text-sm">⚠ Insufficient balance</span>
          <span className="text-[var(--text-secondary)] ml-2 text-sm">
            <Link href="/dashboard/deposit" className="text-[var(--accent-heart)] hover:underline">Add capital</Link> or claim demo funds.
          </span>
        </div>
      )}

      {strategyRun && (
        <div className="fixed top-4 left-0 right-0 z-[60] backdrop-blur-sm">
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

      {/* Merged header + metrics — single row (nav | metrics | actions). Mobile: h-12, larger touch targets */}
      <header className="flex-shrink-0 h-12 lg:h-10 flex items-center min-w-0 border-b border-white/[0.06] bg-[#050506] backdrop-blur-sm">
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 px-2 lg:px-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-[11px] lg:text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors group min-h-[44px] lg:min-h-0 min-w-[44px] lg:min-w-0 justify-center lg:justify-start" aria-label="Back to Dashboard">
            <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline uppercase tracking-wider">Dashboard</span>
          </Link>
          <span className="text-[10px] text-white/10 hidden sm:inline">│</span>
          <span className="text-[10px] font-bold tracking-[0.15em] text-[var(--text-secondary)] uppercase hidden md:inline">
            Game <span className="text-[#0ea5e9]/70">Terminal</span>
          </span>
        </div>
        <QuantTopMetricsBar
          compact
          mobile
          nav={balance}
          navLoading={balanceLoading}
          sessionPnl={totalPnl}
          sharpeRatio={m.sharpeRatio}
          winRate={winRatePct}
          maxDrawdownPct={m.maxDrawdownPct}
          rounds={rounds}
          kellyFraction={m.kellyFraction}
          ready={!strategyRun && !autoPlayActive}
          live={aiConnected}
          sessionStartTime={sessionStartTime}
        />
        <div className="flex items-center gap-1 lg:gap-2 shrink-0 px-2 lg:px-3">
          <Link href="/dashboard/connect-ai" className={aiConnected ? "hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#30d158]/30 bg-[#30d158]/10 px-2.5 py-2 lg:py-1 text-[11px] lg:text-[10px] font-medium text-[#30d158] min-h-[40px] lg:min-h-0 justify-center" : "hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#0ea5e9]/30 bg-[#0ea5e9]/10 px-2.5 py-2 lg:py-1 text-[11px] lg:text-[10px] font-medium text-[#0ea5e9] min-h-[40px] lg:min-h-0 justify-center"}>
            {aiConnected ? <HeartbeatIndicator size="sm" /> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            <span>{aiConnected ? "AI" : "Connect"}</span>
          </Link>
          <Link href="/dashboard/deposit" className="flex items-center gap-1.5 text-[11px] lg:text-[10px] text-[#0ea5e9] hover:text-[#0ea5e9] font-semibold uppercase tracking-wider min-h-[40px] lg:min-h-0 px-3 lg:px-0 justify-center items-center">
            <svg className="w-4 h-4 lg:w-3.5 lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Deposit</span>
          </Link>
          <Link href="/dashboard/withdraw" className="hidden sm:inline text-[11px] lg:text-[10px] text-amber-400/80 hover:text-amber-400 font-semibold uppercase tracking-wider min-h-[40px] lg:min-h-0 flex items-center">Withdraw</Link>
        </div>
      </header>

      {/* Main content — 3-pane terminal layout */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr_minmax(220px,22%)] overflow-hidden">
        {/* Left pane — Order ticket (full length) */}
        <div className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-white/[0.06]">
          <div className="terminal-pane flex-1 min-h-0 flex flex-col overflow-hidden m-1.5 mr-0">
            <div className="terminal-header flex-shrink-0">
              <div className="terminal-header-accent" />
              <span>Order Ticket</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <div className="flex-shrink-0 min-h-[64px] px-4 pt-4 pb-2" key={sessionNudgesKey}>
                <SessionNudges
                  totalPnl={totalPnl}
                  rounds={rounds}
                  sessionHigh={sessionHigh}
                  isNewSessionHigh={isNewSessionHigh}
                  justRecovered={justRecovered}
                  lossStreak={lossStreak}
                  newDrawdown={newDrawdown}
                  hasPositiveEv={(m.expectedValuePerTrade ?? 0) > 0}
                />
              </div>
              <div className="flex-1 min-h-0 overflow-hidden p-3 pt-2">
              <ClientOnly
                fallback={
                  <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
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
                  recentResults={recentResults.map((r) => ({ win: r.win }))}
                  sessionStartTime={sessionStartTime}
                  rounds={rounds}
                />
              </ClientOnly>
              </div>
            </div>
          </div>
        </div>

        {/* Center pane — Tabbed: Chart | Strategy | Backtest */}
        <div className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="terminal-pane flex-1 min-h-0 flex flex-col overflow-hidden m-1.5 mx-1">
            <div className="terminal-header flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {(["chart", "strategy", "backtest", "metrics"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCenterTab(tab)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-sm transition-colors capitalize ${
                      centerTab === tab
                        ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >
                    {tab === "chart" ? "Chart" : tab === "strategy" ? "Strategy" : tab === "backtest" ? "Backtest" : "Metrics"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-[9px] text-[var(--text-tertiary)] hover:text-[#0ea5e9] transition-colors px-2 py-1 rounded"
              >
                Reset
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {centerTab === "chart" && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-shrink-0 p-2 pb-1">
                    <SessionPnLChart
                      series={statsSeries}
                      totalPnl={totalPnl}
                      rounds={rounds}
                      onReset={handleReset}
                      layout="hero"
                      sharpeRatio={m.sharpeRatio}
                      maxDrawdownPct={m.maxDrawdownPct}
                    />
                  </div>
                  <div className="flex-1 min-h-[100px] p-2 pt-1 overflow-hidden">
                    <MonteCarloShadow
                      series={statsSeries}
                      totalPnl={totalPnl}
                      rounds={rounds}
                    />
                  </div>
                </div>
              )}
              {centerTab === "strategy" && (
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 space-y-2 scrollbar-sidebar">
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
                    onStrategyChange={setStrategyForBacktest}
                    fullWidth
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
                  <div className="flex items-center gap-2 py-1">
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
                  <Link href="/dashboard/strategies" className="flex items-center justify-center gap-1.5 w-full py-2 rounded-sm border border-dashed border-white/[0.06] text-[11px] text-[var(--text-tertiary)] hover:text-[#0ea5e9] hover:border-[#0ea5e9]/30 transition-all">
                    Manage Strategies →
                  </Link>
                </div>
              )}
              {centerTab === "backtest" && (
                <BacktestTabContent strategy={strategyForBacktest} />
              )}
              {centerTab === "metrics" && (
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-sidebar">
                  <QuantMetricsGrid
                    metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
                    recentResults={recentResults}
                    compact={false}
                  />
                  <div className="pt-4 border-t border-white/[0.06]">
                    <SessionAura
                      series={statsSeries}
                      quantMetrics={quantMetrics ?? m}
                      rounds={rounds}
                      wins={wins}
                      totalPnl={totalPnl}
                      recentResults={recentResults}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right pane — Trade blotter + Strategy + AI API */}
        <aside className="hidden lg:flex flex-col min-w-[220px] max-w-[340px] overflow-y-auto overflow-x-hidden scrollbar-sidebar border-l border-white/[0.06]">
          <div className="terminal-pane flex-1 min-h-0 flex flex-col overflow-hidden m-1.5 ml-0">
            <div className="terminal-header flex-shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="terminal-header-accent" />
                <span>Trade Log</span>
              </div>
              <span className="text-[9px] text-[var(--text-tertiary)] tabular-nums">{recentResults.length} fills</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden p-2">
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
                maxRows={12}
              />
            </div>
          </div>

          {(liveActivityItems.length > 0 || liveQueueLength > 0) && (
            <div className="terminal-pane m-1.5 ml-0 flex-shrink-0">
              <LiveActivityFeed items={liveActivityItems} maxItems={20} />
            </div>
          )}

          <div className="terminal-pane m-1.5 ml-0 flex-shrink-0">
            <div className="terminal-header flex-shrink-0">
              <div className="terminal-header-accent" />
              <span>AI API</span>
            </div>
            <div className="p-2 space-y-1.5">
              <ApiKeySection compact />
              <Link href="/dashboard/api" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0ea5e9] hover:underline">
                Full API Docs →
              </Link>
            </div>
          </div>

          <div className="terminal-pane m-1.5 ml-0 flex-shrink-0">
            <KeyboardShortcutsHelp />
          </div>

          <div className="m-1.5 ml-0">
            <button onClick={handleReset} className="w-full py-1.5 rounded-sm border border-white/[0.06] text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all">
              Reset Session
            </button>
          </div>
        </aside>

        {/* Mobile: tabbed layout with bottom tab bar */}
        <div className="lg:hidden flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
            {mobileTab === "play" && (
              <div className="terminal-pane m-2 flex flex-col min-h-[200px]">
                <div className="terminal-header flex-shrink-0">
                  <div className="terminal-header-accent" />
                  <span>Order Ticket</span>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden p-3">
                  <ClientOnly fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]"><span className="animate-pulse">Loading...</span></div>}>
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
                      onStrategyStop={() => { setStrategyRun(null); setStrategyStats(null); }}
                      onStrategyProgress={(stats) => setStrategyStats({ currentRound: stats.currentRound, sessionPnl: stats.sessionPnl, initialBalance: balance, winRatePercent: stats.currentRound > 0 ? (stats.wins / stats.currentRound) * 100 : 0 })}
                      livePlay={livePlay}
                      livePlayAnimationMs={livePlayDisplayMs}
                      aiDriving={aiBannerVisible || !!livePlay}
                      recentResults={recentResults.map((r) => ({ win: r.win }))}
                      sessionStartTime={sessionStartTime}
                      rounds={rounds}
                    />
                  </ClientOnly>
                </div>
              </div>
            )}
            {mobileTab === "chart" && (
              <div className="space-y-2 m-2">
                <div className="terminal-pane">
                  <div className="terminal-header flex-shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="terminal-header-accent" />
                      <span>Equity Curve</span>
                    </div>
                    <button type="button" onClick={handleReset} className="text-[11px] text-[var(--text-tertiary)] hover:text-[#0ea5e9] min-h-[44px] min-w-[44px] flex items-center justify-center -m-1">Reset</button>
                  </div>
                  <div className="p-3">
                    <SessionPnLChart
                      series={statsSeries}
                      totalPnl={totalPnl}
                      rounds={rounds}
                      onReset={handleReset}
                      layout="large"
                      sharpeRatio={m.sharpeRatio}
                      maxDrawdownPct={m.maxDrawdownPct}
                    />
                  </div>
                </div>
                <div className="terminal-pane min-h-[120px]">
                  <div className="terminal-header flex-shrink-0">
                    <div className="terminal-header-accent" />
                    <span>Monte Carlo</span>
                  </div>
                  <div className="p-3 h-[120px]">
                    <MonteCarloShadow
                      series={statsSeries}
                      totalPnl={totalPnl}
                      rounds={rounds}
                    />
                  </div>
                </div>
              </div>
            )}
            {mobileTab === "strategy" && (
              <div className="m-2 space-y-2 overflow-y-auto">
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
                    setMobileTab("play");
                  }}
                  onLoad={(strategy) => setLoadedStrategyForBuilder(strategy)}
                  defaultMaxRounds={50}
                />
                <CompactAdvancedStrategyBuilder
                  key={loadedStrategyForBuilder?.id ?? "builder"}
                  initialStrategy={loadedStrategyForBuilder}
                  onStrategyChange={setStrategyForBacktest}
                  fullWidth
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
                    setMobileTab("play");
                  }}
                  onApply={(strategy) => {
                    setAmount(strategy.baseConfig.amount);
                    setTarget(strategy.baseConfig.target);
                    setCondition(strategy.baseConfig.condition);
                    setActiveStrategyName(strategy.name);
                    setMobileTab("play");
                  }}
                />
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t border-white/[0.06]" />
                  <span className="text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">or</span>
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
                    setMobileTab("play");
                  }}
                />
                <Link href="/dashboard/strategies" className="flex items-center justify-center gap-1.5 w-full py-3 min-h-[44px] rounded-sm border border-dashed border-white/[0.06] text-[11px] text-[var(--text-tertiary)] hover:text-[#0ea5e9] hover:border-[#0ea5e9]/30 transition-all">
                  Manage Strategies →
                </Link>
              </div>
            )}
            {mobileTab === "log" && (
              <div className="m-2 space-y-2">
                <div className="terminal-pane">
                  <div className="terminal-header flex-shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="terminal-header-accent" />
                      <span>Trade Log</span>
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{recentResults.length} fills</span>
                  </div>
                  <div className="p-2 max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-sidebar">
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
                      maxRows={20}
                    />
                  </div>
                </div>
                <div className="terminal-pane flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="terminal-header flex-shrink-0">
                    <div className="terminal-header-accent" />
                    <span>Metrics</span>
                  </div>
                  <div className="flex-1 min-h-0 p-3 overflow-y-auto scrollbar-sidebar">
                    <QuantMetricsGrid
                      metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
                      recentResults={recentResults}
                      compact
                    />
                  </div>
                </div>
                <div className="terminal-pane p-2">
                  <div className="terminal-header flex-shrink-0">
                    <div className="terminal-header-accent" />
                    <span>AI API</span>
                  </div>
                  <div className="p-2 space-y-1.5">
                    <ApiKeySection compact />
                    <Link href="/dashboard/api" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0ea5e9] hover:underline min-h-[44px] items-center">
                      Full API Docs →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Mobile footer — above tab bar */}
          <div className="lg:hidden flex-shrink-0 px-3 py-1.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-[var(--text-tertiary)] bg-[#050506]">
            <span className="truncate">3% Edge · 97% RTP · Min 1 · Max 10k</span>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/dashboard" className="hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
              <Link href="/dashboard/api" className="hover:text-[#0ea5e9] transition-colors">API</Link>
            </div>
          </div>
          {/* Mobile bottom tab bar — 44px + safe area */}
          <nav className="lg:hidden flex-shrink-0 flex items-center justify-around h-11 safe-area-bottom border-t border-white/[0.06] bg-[#050506] backdrop-blur-sm" aria-label="Mobile navigation">
            {(
              [
                { id: "play" as MobileTab, label: "Play", icon: "🎲" },
                { id: "chart" as MobileTab, label: "Chart", icon: "📈" },
                { id: "strategy" as MobileTab, label: "Strategy", icon: "⚙️" },
                { id: "log" as MobileTab, label: "Log", icon: "📋" },
              ] as const
            ).map(({ id, label, icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 gap-0.5 transition-colors ${
                  mobileTab === id ? "text-[#0ea5e9]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
                aria-current={mobileTab === id ? "page" : undefined}
              >
                <span className="text-base leading-none" aria-hidden>{icon}</span>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </main>

      {/* Minimal footer — single line (hidden on mobile; tab bar provides nav) */}
      <footer className="hidden lg:flex flex-shrink-0 px-4 py-2 border-t border-white/[0.06] items-center justify-between text-[10px] text-[var(--text-tertiary)] bg-[#050506] safe-area-bottom">
        <span>Xpersona · 3% Edge · 97% Return · Min 1 · Max 10k</span>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
          <Link href="/dashboard/api" className="hover:text-[#0ea5e9] transition-colors">API</Link>
        </div>
      </footer>
    </div>
  );
}

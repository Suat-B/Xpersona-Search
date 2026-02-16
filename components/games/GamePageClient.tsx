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

type DockTab = "chart" | "strategy" | "backtest" | "metrics" | "log";
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
            className="terminal-input w-full px-3 py-2 rounded-xl"
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
            className="terminal-input w-full px-3 py-2 rounded-xl"
          />
        </div>
      </div>

      <button
        onClick={runSimulation}
        className="w-full py-3 rounded-xl bg-violet-500/20 text-violet-400 border border-violet-500/50 hover:bg-violet-500/30 transition-colors font-medium"
      >
        Run Simulation
      </button>

      {simulationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="agent-card p-3">
              <p className="text-xs text-[var(--text-secondary)]">Final Balance</p>
              <p className={`text-lg font-semibold tabular-nums ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {simulationResult.finalBalance.toFixed(0)}
              </p>
            </div>
            <div className="agent-card p-3">
              <p className="text-xs text-[var(--text-secondary)]">Profit/Loss</p>
              <p className={`text-lg font-semibold tabular-nums ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {simulationResult.profit >= 0 ? "+" : ""}{simulationResult.profit.toFixed(0)}
              </p>
            </div>
            <div className="agent-card p-3">
              <p className="text-xs text-[var(--text-secondary)]">Win Rate</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">
                {simulationResult.roundHistory.length > 0 ? ((simulationResult.totalWins / simulationResult.roundHistory.length) * 100).toFixed(1) : "0"}%
              </p>
            </div>
            <div className="agent-card p-3">
              <p className="text-xs text-[var(--text-secondary)]">Rounds</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{simulationResult.roundHistory.length}</p>
            </div>
          </div>
          {simulationResult.shouldStop && simulationResult.stopReason && (
            <div className="p-3 rounded-xl bg-[#0ea5e9]/10 border border-[#0ea5e9]/30">
              <p className="text-sm text-[#0ea5e9]"><strong>Stopped:</strong> {simulationResult.stopReason}</p>
            </div>
          )}
          <div className="agent-card p-3">
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
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border)] bg-white/[0.02]">
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
  const [dockTab, setDockTab] = useState<DockTab>("chart");
  const [dockExpanded, setDockExpanded] = useState(true);
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

  useEffect(() => {
    if (totalPnl > sessionHighRef.current) sessionHighRef.current = totalPnl;
    if (totalPnl < sessionLowRef.current && totalPnl < 0) sessionLowRef.current = totalPnl;
    prevPnlRef.current = totalPnl;
  }, [totalPnl]);

  useEffect(() => {
    if (searchParams.get("deposit") === "success") {
      setDepositSuccess(true);
      router.replace("/games/dice");
      window.dispatchEvent(new Event("balance-updated"));
      const t = setTimeout(() => setDepositSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

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

    timeoutId = setTimeout(runInitialLoad, 300);

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

  useEffect(() => () => {
    if (aiBannerCooldownRef.current) clearTimeout(aiBannerCooldownRef.current);
  }, []);

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

  const m = quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null };

  /* Ambient background tint based on P&L */
  const ambientTint = totalPnl > 50
    ? "from-[#30d158]/[0.03] via-transparent to-transparent"
    : totalPnl < -50
      ? "from-[#ff453a]/[0.02] via-transparent to-transparent"
      : "from-transparent via-transparent to-transparent";

  return (
    <div className={`w-full flex-1 min-h-0 flex flex-col overflow-hidden relative bg-gradient-to-br ${ambientTint}`}>
      {/* Banners */}
      {depositSuccess && (
        <div className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-center gap-2 py-2 px-4 bg-[#30d158]/15 border-b border-[#30d158]/30 text-[#30d158] text-sm backdrop-blur-sm">
          <span className="text-[#30d158]">&#x2713;</span> Payment successful. Capital added.
        </div>
      )}

      {hasApiKey === false && (
        <Link href="/dashboard/connect-ai" className="fixed top-4 left-0 right-0 z-[60] flex items-center justify-center gap-3 py-2.5 px-4 bg-[#0ea5e9]/10 border-b border-[#0ea5e9]/30 text-[#0ea5e9] hover:bg-[#0ea5e9]/15 transition-colors backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-[#0ea5e9] animate-pulse shrink-0" />
          <span className="text-sm font-medium">Connect your AI &mdash; Your agent needs an API key</span>
          <span className="text-xs font-semibold">Connect now &rarr;</span>
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
          <span className="text-[var(--accent-heart)] font-semibold text-sm">&#x26A0; Insufficient balance</span>
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

      {/* ═══ Compact Header ═══ */}
      <header className="flex-shrink-0 flex items-center justify-between gap-4 py-2 px-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0" aria-label="Back to Dashboard">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs font-medium uppercase tracking-wider">Dashboard</span>
          </Link>
          <span className="text-white/20 shrink-0">/</span>
          <span className={`w-2 h-2 rounded-full shrink-0 ${strategyRun || autoPlayActive ? "bg-[#0ea5e9] animate-pulse" : "bg-[#30d158]"}`} aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight text-gradient-primary truncate">
            Dice Terminal
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/dashboard/connect-ai"
            className={
              aiConnected
                ? "inline-flex items-center gap-1.5 rounded-full border border-[#30d158]/40 bg-[#30d158]/10 px-3 py-2 text-xs font-medium text-[#30d158] hover:bg-[#30d158]/20 transition-all"
                : "inline-flex items-center gap-1.5 rounded-full border border-[#0ea5e9]/40 bg-[#0ea5e9]/10 px-3 py-2 text-xs font-medium text-[#0ea5e9] hover:bg-[#0ea5e9]/20 transition-all"
            }
          >
            {aiConnected ? (
              <>
                <HeartbeatIndicator size="sm" />
                <span>AI connected</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Connect AI</span>
              </>
            )}
          </Link>
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-white/[0.03] p-0.5">
            <Link href="/dashboard/deposit" className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
              <svg className="w-3.5 h-3.5 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Deposit
            </Link>
            <div className="w-px h-3 bg-[var(--border)]" />
            <Link href="/dashboard/withdraw" className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.06] transition-all">
              <svg className="w-3.5 h-3.5 text-[#0ea5e9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Withdraw
            </Link>
          </div>
        </div>
      </header>

      {/* ═══ Metrics Ribbon ═══ */}
      <section className="flex-shrink-0 px-2 py-1.5">
        <QuantTopMetricsBar
          cardLayout
          cardLayoutCompact
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
      </section>

      {/* ═══ DESKTOP: Main Stage + Bottom Analytics Dock ═══ */}
      <main className="hidden lg:flex flex-1 min-h-0 overflow-hidden flex-col">
        {/* Main hero area: order ticket with 3-zone cockpit */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="agent-card mx-2 flex-1 min-h-0 flex flex-col transition-all duration-300 hover:border-[var(--border-strong)] overflow-hidden">
            {/* Session nudges */}
            <div className="flex-shrink-0 px-4 pt-2" key={sessionNudgesKey}>
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
            {/* DiceGame (3-zone cockpit layout inside) */}
            <div className="flex-1 min-h-0 overflow-hidden">
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

        {/* ═══ Bottom Analytics Dock ═══ */}
        <div className={`flex-shrink-0 mx-2 mb-1 mt-1 transition-all duration-300 ${dockExpanded ? "max-h-[320px]" : "max-h-[40px]"}`}>
          <div className="agent-card flex flex-col h-full overflow-hidden transition-all duration-300 hover:border-[var(--border-strong)]">
            {/* Dock tab bar */}
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.06] flex-shrink-0">
              <div className="flex items-center gap-1">
                <div className="w-1 h-4 rounded-full bg-[#0ea5e9] mr-1" />
                {(["chart", "strategy", "backtest", "metrics", "log"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setDockTab(tab); if (!dockExpanded) setDockExpanded(true); }}
                    className={`px-3 py-1 text-[10px] font-semibold rounded-full transition-all duration-200 capitalize ${
                      dockTab === tab && dockExpanded
                        ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.06] border border-transparent"
                    }`}
                  >
                    {tab === "chart" ? "Chart" : tab === "strategy" ? "Strategy" : tab === "backtest" ? "Backtest" : tab === "metrics" ? "Metrics" : "Trade Log"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[10px] text-[var(--text-tertiary)] hover:text-[#0ea5e9] transition-colors px-2 py-1 rounded-lg hover:bg-white/[0.04]"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setDockExpanded(!dockExpanded)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-white/[0.04]"
                  aria-label={dockExpanded ? "Collapse dock" : "Expand dock"}
                >
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${dockExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dock content */}
            {dockExpanded && (
              <div className="flex-1 min-h-0 overflow-hidden animate-dock-slide-up">
                {dockTab === "chart" && (
                  <div className="flex h-full min-h-0 overflow-hidden">
                    <div className="flex-1 p-2 min-h-0">
                      <SessionPnLChart
                        series={statsSeries}
                        totalPnl={totalPnl}
                        rounds={rounds}
                        onReset={handleReset}
                        layout="default"
                        sharpeRatio={m.sharpeRatio}
                        maxDrawdownPct={m.maxDrawdownPct}
                      />
                    </div>
                    <div className="w-[200px] flex-shrink-0 p-2 min-h-0 border-l border-white/[0.04]">
                      <MonteCarloShadow
                        series={statsSeries}
                        totalPnl={totalPnl}
                        rounds={rounds}
                      />
                    </div>
                  </div>
                )}
                {dockTab === "strategy" && (
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 space-y-2 scrollbar-sidebar">
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
                      Manage Strategies &rarr;
                    </Link>
                  </div>
                )}
                {dockTab === "backtest" && (
                  <BacktestTabContent strategy={strategyForBacktest} />
                )}
                {dockTab === "metrics" && (
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 scrollbar-sidebar">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <QuantMetricsGrid
                          metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
                          recentResults={recentResults}
                          compact={false}
                        />
                      </div>
                      <div className="w-[240px] flex-shrink-0">
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
                  </div>
                )}
                {dockTab === "log" && (
                  <div className="flex-1 min-h-0 overflow-hidden p-3 flex gap-3">
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-sidebar">
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
                    {(liveActivityItems.length > 0 || liveQueueLength > 0) && (
                      <div className="w-[240px] flex-shrink-0 min-h-0 overflow-y-auto scrollbar-sidebar">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1 h-4 rounded-full bg-violet-500" />
                          <h3 className="text-xs font-semibold text-[var(--text-primary)]">Live Activity</h3>
                        </div>
                        <LiveActivityFeed items={liveActivityItems} maxItems={20} embedded />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ═══ MOBILE: Tabbed Layout ═══ */}
      <main className="lg:hidden flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 88px)" }}>
          {mobileTab === "play" && (
            <div className="agent-card p-5 m-3 flex flex-col min-h-[200px] transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Order Ticket</h2>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
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
            <div className="space-y-5 m-3">
              <div className="agent-card p-5 transition-all duration-300">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Equity Curve</h2>
                  </div>
                  <button type="button" onClick={handleReset} className="text-sm text-[var(--text-tertiary)] hover:text-[#0ea5e9] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-white/[0.04]">Reset</button>
                </div>
                <div>
                  <SessionPnLChart
                    series={statsSeries}
                    totalPnl={totalPnl}
                    rounds={rounds}
                    onReset={handleReset}
                    layout="default"
                    sharpeRatio={m.sharpeRatio}
                    maxDrawdownPct={m.maxDrawdownPct}
                  />
                </div>
              </div>
              <div className="agent-card p-5 min-h-[120px] transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Monte Carlo</h2>
                </div>
                <div className="h-[120px]">
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
            <div className="m-3 space-y-4 overflow-y-auto">
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
              <Link href="/dashboard/strategies" className="flex items-center justify-center gap-1.5 w-full py-3 min-h-[44px] rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--text-tertiary)] hover:text-[#0ea5e9] hover:border-[#0ea5e9]/30 transition-all">
                Manage Strategies &rarr;
              </Link>
            </div>
          )}
          {mobileTab === "log" && (
            <div className="m-3 space-y-4">
              <div className="agent-card p-5 transition-all duration-300">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trade Log</h2>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{recentResults.length} fills</span>
                </div>
                <div className="max-h-[200px] overflow-y-auto overflow-x-auto scrollbar-sidebar">
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
              <div className="agent-card p-5 flex flex-col overflow-hidden transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Metrics</h2>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-sidebar">
                  <QuantMetricsGrid
                    metrics={quantMetrics ?? { sharpeRatio: null, sortinoRatio: null, profitFactor: null, winRate: 0, avgWin: null, avgLoss: null, maxDrawdown: 0, maxDrawdownPct: null, recoveryFactor: null, kellyFraction: null, expectedValuePerTrade: null }}
                    recentResults={recentResults}
                    compact
                  />
                </div>
              </div>
              <div className="agent-card p-5 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-6 rounded-full bg-[#0ea5e9]" />
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI API</h2>
                </div>
                <div className="space-y-3">
                  <ApiKeySection compact />
                  <Link href="/dashboard/api" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0ea5e9] hover:underline min-h-[44px] items-center">
                    Full API Docs &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Mobile footer */}
        <div className="lg:hidden flex-shrink-0 px-4 py-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-[var(--text-tertiary)]">
          <span className="truncate">3% Edge &middot; 97% RTP &middot; Min 1 &middot; Max 10k</span>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/dashboard" className="hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
            <Link href="/dashboard/api" className="hover:text-[#0ea5e9] transition-colors">API</Link>
          </div>
        </div>
        {/* Mobile bottom tab bar */}
        <nav className="lg:hidden flex-shrink-0 flex items-center justify-around h-14 safe-area-bottom border-t border-white/[0.06] px-2 py-2 gap-1" aria-label="Mobile navigation">
          {(
            [
              { id: "play" as MobileTab, label: "Play", icon: "\uD83C\uDFB2" },
              { id: "chart" as MobileTab, label: "Chart", icon: "\uD83D\uDCC8" },
              { id: "strategy" as MobileTab, label: "Strategy", icon: "\u2699\uFE0F" },
              { id: "log" as MobileTab, label: "Log", icon: "\uD83D\uDCCB" },
            ] as const
          ).map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileTab(id)}
              className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-2 gap-1 rounded-xl transition-all duration-200 ${
                mobileTab === id
                  ? "bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/40"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]"
              }`}
              aria-current={mobileTab === id ? "page" : undefined}
            >
              <span className="text-base leading-none" aria-hidden>{icon}</span>
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </nav>
      </main>

      {/* Footer */}
      <footer className="hidden lg:flex flex-shrink-0 items-center justify-between py-1 px-3 border-t border-white/[0.06] text-[10px] text-[var(--text-tertiary)]">
        <span>3% Edge &middot; 97% RTP &middot; Min 1 &middot; Max 10k</span>
        <div className="flex items-center gap-3">
          <KeyboardShortcutsHelp />
          <Link href="/dashboard" className="hover:text-[#0ea5e9] transition-colors">Dashboard</Link>
          <Link href="/dashboard/api" className="hover:text-[#0ea5e9] transition-colors">API</Link>
        </div>
      </footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { safeFetchJson } from "@/lib/safeFetch";
import { extractClientErrorMessage } from "@/lib/api/client-response";
import { SessionPnLChart, type PnLPoint } from "@/components/ui/SessionPnLChart";
import { RecentResults } from "@/components/ui/RecentResults";
import { StatsSummary } from "@/components/ui/StatsSummary";
import { ProvablyFairBetHistory } from "@/components/dashboard/ProvablyFairBetHistory";

type EntryRole = "human" | "agent" | null;

type Viewer = {
  id: string;
  name: string | null;
  accountType: string;
  agentId: string | null;
  credits: number;
};

type SessionStatsPayload = {
  balance: number;
  rounds: number;
  sessionPnl: number;
  winRate: number;
  recentPlays: Array<{
    id?: string;
    amount: number;
    outcome: string;
    payout: number;
    pnl: number;
    createdAt?: string;
  }>;
};

type Round = {
  id: string;
  gameType: string;
  amount: number;
  outcome: string;
  payout: number;
  pnl: number;
  createdAt: string;
  resultPayload?: { value?: number; target?: number; condition?: string } | null;
  verification?: { serverSeedHash: string | null; clientSeed: string; nonce: number };
};

type DiceRoundResponse = {
  success?: boolean;
  data?: {
    betId?: string;
    balance?: number;
    result?: number;
    win?: boolean;
    payout?: number;
    verification?: {
      serverSeedHash?: string;
      clientSeed?: string;
      nonce?: number;
    };
  };
  error?: string;
  message?: string;
};

const ROLE_STORAGE_KEY = "xpersona:dice:entry-role";

function toCurrencyLabel(value: number): string {
  const rounded = Number.isFinite(value) ? value : 0;
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

export function AiDiceArenaPage() {
  const [role, setRole] = useState<EntryRole>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [viewerLoading, setViewerLoading] = useState(true);
  const [creatingAgentSession, setCreatingAgentSession] = useState(false);
  const [autoAgentAttempted, setAutoAgentAttempted] = useState(false);

  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");

  const [rolling, setRolling] = useState(false);
  const [claimingFaucet, setClaimingFaucet] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [lastRound, setLastRound] = useState<DiceRoundResponse["data"] | null>(null);

  const [sessionStats, setSessionStats] = useState<SessionStatsPayload | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const hydrateViewer = useCallback(async () => {
    setViewerLoading(true);
    try {
      const meResponse = await safeFetchJson<{ success?: boolean; data?: Viewer }>("/api/v1/me");
      if (meResponse.ok && meResponse.data?.success && meResponse.data?.data) {
        setViewer(meResponse.data.data);
      } else {
        setViewer(null);
      }
    } catch {
      setViewer(null);
    } finally {
      setViewerLoading(false);
    }
  }, []);

  const refreshConsoleData = useCallback(async () => {
    if (!viewer || viewer.accountType !== "agent") return;
    setLoadingData(true);
    try {
      const [statsRes, roundsRes] = await Promise.all([
        safeFetchJson<{ success?: boolean; data?: SessionStatsPayload }>(
          "/api/v1/me/session-stats?gameType=dice&limit=60"
        ),
        safeFetchJson<{ success?: boolean; data?: { plays?: Round[] } }>(
          "/api/v1/me/rounds?gameType=dice&limit=60"
        ),
      ]);

      if (statsRes.ok && statsRes.data?.success && statsRes.data?.data) {
        setSessionStats(statsRes.data.data);
      } else {
        setSessionStats(null);
      }

      if (roundsRes.ok && roundsRes.data?.success) {
        setRounds(roundsRes.data.data?.plays ?? []);
      } else {
        setRounds([]);
      }
    } finally {
      setLoadingData(false);
    }
  }, [viewer]);

  const activateAgentSession = useCallback(async () => {
    setUiMessage(null);
    setCreatingAgentSession(true);
    try {
      const playResponse = await safeFetchJson<{ success?: boolean; message?: string }>(
        "/api/v1/auth/play",
        { method: "POST" }
      );
      if (!playResponse.ok || !playResponse.data?.success) {
        setUiMessage(
          extractClientErrorMessage(playResponse.data, "Could not create an agent session.")
        );
        return;
      }
      await hydrateViewer();
      window.dispatchEvent(new Event("balance-updated"));
    } catch {
      setUiMessage("Could not create an agent session.");
    } finally {
      setCreatingAgentSession(false);
    }
  }, [hydrateViewer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedRole = sessionStorage.getItem(ROLE_STORAGE_KEY);
    if (storedRole === "human" || storedRole === "agent") {
      setRole(storedRole);
    }
    void hydrateViewer();
  }, [hydrateViewer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!role) {
      sessionStorage.removeItem(ROLE_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ROLE_STORAGE_KEY, role);
  }, [role]);

  useEffect(() => {
    if (role !== "agent") {
      setAutoAgentAttempted(false);
      return;
    }
    if (viewerLoading || creatingAgentSession || viewer || autoAgentAttempted) return;
    setAutoAgentAttempted(true);
    void activateAgentSession();
  }, [
    role,
    viewerLoading,
    creatingAgentSession,
    viewer,
    autoAgentAttempted,
    activateAgentSession,
  ]);

  useEffect(() => {
    if (!viewer || viewer.accountType !== "agent" || role !== "agent") return;
    void refreshConsoleData();
    const timer = setInterval(() => {
      void refreshConsoleData();
    }, 12000);
    return () => clearInterval(timer);
  }, [viewer, role, refreshConsoleData]);

  const handleRoll = useCallback(async () => {
    if (!viewer || viewer.accountType !== "agent") return;
    setUiMessage(null);
    setRolling(true);
    try {
      const response = await safeFetchJson<DiceRoundResponse>("/api/v1/games/dice/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, target, condition }),
      });
      if (!response.ok || !response.data?.success || !response.data?.data) {
        setUiMessage(extractClientErrorMessage(response.data, "Roll failed."));
        return;
      }

      setLastRound(response.data.data);
      if (typeof response.data.data.balance === "number") {
        window.dispatchEvent(
          new CustomEvent("balance-updated", { detail: { balance: response.data.data.balance } })
        );
      } else {
        window.dispatchEvent(new Event("balance-updated"));
      }
      await refreshConsoleData();
    } catch {
      setUiMessage("Roll failed.");
    } finally {
      setRolling(false);
    }
  }, [viewer, amount, target, condition, refreshConsoleData]);

  const handleClaimFaucet = useCallback(async () => {
    if (!viewer || viewer.accountType !== "agent") return;
    setUiMessage(null);
    setClaimingFaucet(true);
    try {
      const response = await safeFetchJson<{
        success?: boolean;
        data?: { balance?: number };
      }>("/api/v1/faucet", { method: "POST" });

      if (!response.ok || !response.data?.success) {
        setUiMessage(extractClientErrorMessage(response.data, "Faucet claim failed."));
        return;
      }

      if (typeof response.data.data?.balance === "number") {
        window.dispatchEvent(
          new CustomEvent("balance-updated", { detail: { balance: response.data.data.balance } })
        );
      } else {
        window.dispatchEvent(new Event("balance-updated"));
      }
      setUiMessage("Faucet claimed.");
      await refreshConsoleData();
    } catch {
      setUiMessage("Faucet claim failed.");
    } finally {
      setClaimingFaucet(false);
    }
  }, [viewer, refreshConsoleData]);

  const recentRollsForCards = useMemo(() => {
    const chronological = [...rounds].reverse();
    return chronological.map((round) => ({
      result: Number(round.resultPayload?.value ?? 0),
      win: round.outcome === "win",
      payout: Number(round.payout ?? 0),
      betAmount: Number(round.amount ?? 0),
    }));
  }, [rounds]);

  const pnlSeries = useMemo<PnLPoint[]>(() => {
    const chronological = [...rounds].reverse();
    let cumulative = 0;
    return chronological.map((round, index) => {
      cumulative += Number(round.pnl ?? 0);
      return {
        round: index + 1,
        pnl: cumulative,
      };
    });
  }, [rounds]);

  const canPlay = role === "agent" && viewer?.accountType === "agent";
  const isBlockedNonAgent = role === "agent" && viewer && viewer.accountType !== "agent";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-36 top-[-8rem] h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-[110px]" />
        <div className="absolute right-[-10rem] top-[8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-400/10 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.12),transparent_45%)]" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-12">
        <section className="rounded-3xl border border-white/10 bg-[#0b111b]/85 p-6 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8">
          <p className="inline-flex items-center rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-cyan-300">
            AGENT ONLY GAME FLOOR
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
            Dice Arena
            <span className="ml-3 bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
              for AI Agents
            </span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            A provably fair dice lane designed for autonomous agents. Humans can observe, learn the
            API workflow, and hand execution to their agent.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setRole("human")}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                role === "human"
                  ? "border-orange-300/70 bg-orange-400/20 text-orange-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:border-white/35"
              }`}
            >
              I&apos;m a Human
            </button>
            <button
              type="button"
              onClick={() => setRole("agent")}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                role === "agent"
                  ? "border-emerald-300/70 bg-emerald-400/20 text-emerald-100"
                  : "border-white/15 bg-white/5 text-slate-200 hover:border-white/35"
              }`}
            >
              I&apos;m an Agent
            </button>
          </div>
        </section>

        {!role && (
          <section className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-slate-300">
            Pick your entry role above to continue. Agent mode enables live gameplay. Human mode is
            observer-only with setup instructions.
          </section>
        )}

        {role === "human" && (
          <section className="rounded-2xl border border-orange-300/30 bg-[linear-gradient(135deg,rgba(249,115,22,0.13),rgba(10,10,10,0.86))] p-6">
            <h2 className="text-xl font-bold text-orange-100">Observer Mode</h2>
            <p className="mt-2 max-w-3xl text-sm text-orange-100/85">
              This game lane is strictly for agent execution. Humans can observe outcomes and set up
              their agent pipeline, but play controls remain locked.
            </p>
            <div className="mt-4 rounded-xl border border-orange-200/25 bg-black/40 p-4 text-xs text-orange-50/90">
              <p className="font-semibold">Quick setup</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Create or switch to an agent session.</li>
                <li>Use your API key from Dashboard -&gt; Connect AI.</li>
                <li>Call <code className="rounded bg-black/40 px-1 py-0.5">POST /api/v1/games/dice/round</code>.</li>
              </ol>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <Link
                href="/dashboard/connect-ai"
                className="rounded-lg border border-orange-200/40 bg-orange-500/15 px-3 py-2 font-semibold text-orange-100 hover:bg-orange-500/25"
              >
                Open Connect AI
              </Link>
              <Link
                href="/docs"
                className="rounded-lg border border-white/25 bg-white/5 px-3 py-2 font-semibold text-slate-200 hover:border-white/40"
              >
                Open Docs
              </Link>
            </div>
          </section>
        )}

        {role === "agent" && (
          <>
            {(viewerLoading || creatingAgentSession) && (
              <section className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
                Initializing agent session...
              </section>
            )}

            {isBlockedNonAgent && (
              <section className="rounded-2xl border border-red-300/35 bg-red-500/10 p-6">
                <h2 className="text-lg font-bold text-red-100">Agent Session Required</h2>
                <p className="mt-2 text-sm text-red-100/85">
                  You are signed in as <strong>{viewer?.accountType}</strong>. Dice execution is
                  restricted to agent accounts.
                </p>
                <button
                  type="button"
                  onClick={() => void activateAgentSession()}
                  disabled={creatingAgentSession}
                  className="mt-4 rounded-lg border border-red-200/40 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-50 hover:bg-red-500/30 disabled:opacity-60"
                >
                  {creatingAgentSession ? "Switching..." : "Switch to Agent Session"}
                </button>
              </section>
            )}

            {canPlay && (
              <>
                <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <article className="rounded-2xl border border-white/10 bg-[#0c1522]/90 p-5">
                    <h2 className="text-xl font-bold text-white">Execute Dice Round</h2>
                    <p className="mt-1 text-xs text-slate-300">
                      Direct path: <code className="rounded bg-black/30 px-1 py-0.5">POST /api/v1/games/dice/round</code>
                    </p>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs">
                        <span className="mb-1 block text-slate-300">Bet Amount</span>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={amount}
                          onChange={(event) =>
                            setAmount(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))
                          }
                          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-300/70 focus:outline-none"
                        />
                      </label>

                      <label className="text-xs">
                        <span className="mb-1 block text-slate-300">Target</span>
                        <input
                          type="number"
                          min={0}
                          max={99.99}
                          step={0.01}
                          value={target}
                          onChange={(event) =>
                            setTarget(Math.max(0, Math.min(99.99, Number(event.target.value) || 0)))
                          }
                          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white focus:border-cyan-300/70 focus:outline-none"
                        />
                      </label>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={99}
                      value={target}
                      onChange={(event) => setTarget(Number(event.target.value))}
                      className="mt-3 w-full accent-cyan-400"
                    />

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCondition("over")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          condition === "over"
                            ? "border-cyan-200/70 bg-cyan-400/20 text-cyan-100"
                            : "border-white/15 bg-white/5 text-slate-300"
                        }`}
                      >
                        Over
                      </button>
                      <button
                        type="button"
                        onClick={() => setCondition("under")}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          condition === "under"
                            ? "border-cyan-200/70 bg-cyan-400/20 text-cyan-100"
                            : "border-white/15 bg-white/5 text-slate-300"
                        }`}
                      >
                        Under
                      </button>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRoll()}
                        disabled={rolling}
                        className="rounded-lg border border-emerald-200/55 bg-emerald-400/20 px-4 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-60"
                      >
                        {rolling ? "Rolling..." : "Roll Dice"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClaimFaucet()}
                        disabled={claimingFaucet}
                        className="rounded-lg border border-cyan-200/45 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-60"
                      >
                        {claimingFaucet ? "Claiming..." : "Claim Faucet"}
                      </button>
                    </div>

                    {uiMessage && (
                      <p className="mt-3 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-slate-200">
                        {uiMessage}
                      </p>
                    )}

                    <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                        Last Round
                      </p>
                      {lastRound ? (
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            Result:{" "}
                            <span className="font-bold text-cyan-200">
                              {Number(lastRound.result ?? 0).toFixed(2)}
                            </span>
                          </p>
                          <p>
                            Outcome:{" "}
                            <span className={lastRound.win ? "text-emerald-300" : "text-red-300"}>
                              {lastRound.win ? "WIN" : "LOSS"}
                            </span>
                          </p>
                          <p>Payout: {Number(lastRound.payout ?? 0)}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400">No rounds yet.</p>
                      )}
                    </div>
                  </article>

                  <article className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-[#0d1119] p-4">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Balance</p>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {sessionStats?.balance ?? viewer.credits}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0d1119] p-4">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Session PnL</p>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {toCurrencyLabel(sessionStats?.sessionPnl ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0d1119] p-4">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Win Rate</p>
                        <p className="mt-1 text-2xl font-bold text-white">
                          {(sessionStats?.winRate ?? 0).toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-[#0d1119] p-4">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Rounds</p>
                        <p className="mt-1 text-2xl font-bold text-white">{sessionStats?.rounds ?? 0}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0d1119] p-3">
                      <SessionPnLChart
                        series={pnlSeries}
                        totalPnl={sessionStats?.sessionPnl ?? 0}
                        rounds={sessionStats?.rounds ?? 0}
                        onReset={() => setLastRound(null)}
                        layout="mini"
                      />
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0d1119] p-3">
                      <RecentResults results={recentRollsForCards} />
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0d1119] p-3">
                      <StatsSummary results={recentRollsForCards} />
                    </div>
                  </article>
                </section>

                <section className="rounded-2xl border border-white/10 bg-[#0b111b]/85 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-white">Provably Fair Audit Trail</h2>
                    <button
                      type="button"
                      onClick={() => void refreshConsoleData()}
                      disabled={loadingData}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/35 disabled:opacity-60"
                    >
                      {loadingData ? "Refreshing..." : "Refresh Data"}
                    </button>
                  </div>
                  <ProvablyFairBetHistory />
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

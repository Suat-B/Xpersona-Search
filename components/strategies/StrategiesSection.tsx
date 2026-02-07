"use client";

import { useState, useEffect, useCallback } from "react";
import type { GameType } from "@/lib/strategies";
import { GlassCard } from "@/components/ui/GlassCard";

type StrategyRow = {
  id: string;
  gameType: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
};

const GAMES_WITH_RUN: GameType[] = ["dice", "plinko", "slots"];

function configSummary(gameType: string, config: Record<string, unknown>): string {
  if (gameType === "dice") {
    const amount = config.amount ?? "?";
    const target = config.target ?? "?";
    const cond = config.condition ?? "?";
    return `Bet ${amount} @ ${cond} ${target}`;
  }
  if (gameType === "plinko") {
    const amount = config.amount ?? "?";
    const risk = config.risk ?? "?";
    return `Bet ${amount} (${risk})`;
  }
  if (gameType === "slots") {
    const amount = config.amount ?? "?";
    return `Spin ${amount}`;
  }
  return JSON.stringify(config).slice(0, 40);
}

export function StrategiesSection() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [runResult, setRunResult] = useState<{
    strategyId: string;
    sessionPnl: number;
    roundsPlayed: number;
    finalBalance: number;
    stoppedReason: string;
  } | null>(null);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/strategies");
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.strategies)) {
        setStrategies(data.data.strategies);
      } else {
        setStrategies([]);
      }
    } catch (e) {
      setError("Failed to load strategies");
      setStrategies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this strategy?")) return;
    try {
      const res = await fetch(`/api/me/strategies/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setStrategies((prev) => prev.filter((s) => s.id !== id));
        setRunResult((prev) => (prev?.strategyId === id ? null : prev));
      } else {
        setError(data.error ?? "Delete failed");
      }
    } catch {
      setError("Delete failed");
    }
  };

  const handleRun = async (id: string, gameType: string) => {
    if (!GAMES_WITH_RUN.includes(gameType as GameType)) return;
    setError(null);
    setRunResult(null);
    try {
      const res = await fetch(`/api/games/${gameType}/run-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: id, maxRounds: 20 }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRunResult({
          strategyId: id,
          sessionPnl: data.data.sessionPnl ?? 0,
          roundsPlayed: data.data.roundsPlayed ?? 0,
          finalBalance: data.data.finalBalance ?? 0,
          stoppedReason: data.data.stoppedReason ?? "—",
        });
        window.dispatchEvent(new Event("balance-updated"));
      } else {
        setError(data.error ?? data.message ?? "Run failed");
      }
    } catch {
      setError("Run failed");
    }
  };

  const list = strategies;
  const runnable = list.filter((s) => GAMES_WITH_RUN.includes(s.gameType as GameType));

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">My strategies</h2>
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {createOpen ? "Cancel" : "Create strategy"}
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {createOpen && (
        <CreateStrategyForm
          onCreated={() => {
            setCreateOpen(false);
            fetchStrategies();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {runResult && (
        <div className="mb-4 rounded border border-white/10 bg-white/5 p-4 text-sm">
          <p className="font-medium text-[var(--text-primary)]">Last run result</p>
          <p>Session PnL: <span className={runResult.sessionPnl >= 0 ? "text-green-400" : "text-red-400"}>{runResult.sessionPnl}</span> · Rounds: {runResult.roundsPlayed} · Balance: {runResult.finalBalance} · Stopped: {runResult.stoppedReason}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading strategies…</p>
      ) : runnable.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No strategies yet. Create one or save from a game (e.g. Dice).</p>
      ) : (
        <div className="space-y-2">
          {runnable.map((s) => (
            <GlassCard key={s.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{s.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {s.gameType} — {configSummary(s.gameType, s.config)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRun(s.id, s.gameType)}
                  className="rounded border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-sm text-green-400 hover:bg-green-500/20"
                >
                  Run (20)
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20"
                >
                  Delete
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </section>
  );
}

function CreateStrategyForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [gameType, setGameType] = useState<GameType>("dice");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [stopAfterRounds, setStopAfterRounds] = useState("");
  const [stopIfBalanceBelow, setStopIfBalanceBelow] = useState("");
  const [stopIfBalanceAbove, setStopIfBalanceAbove] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const buildConfig = (): Record<string, unknown> => {
    const base: Record<string, unknown> = { amount };
    if (gameType === "dice") {
      base.target = target;
      base.condition = condition;
    }
    if (gameType === "plinko") {
      base.risk = risk;
    }
    const stopR = parseInt(stopAfterRounds, 10);
    if (!Number.isNaN(stopR) && stopR > 0) base.stopAfterRounds = stopR;
    const stopB = parseFloat(stopIfBalanceBelow);
    if (!Number.isNaN(stopB)) base.stopIfBalanceBelow = stopB;
    const stopA = parseFloat(stopIfBalanceAbove);
    if (!Number.isNaN(stopA)) base.stopIfBalanceAbove = stopA;
    return base;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType, name: trimmed, config: buildConfig() }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setErr(data.message ?? data.error ?? "Create failed");
      }
    } catch {
      setErr("Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassCard className="mb-6 p-6">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="font-semibold text-[var(--text-primary)]">New strategy</h3>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Game</label>
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value as GameType)}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          >
            <option value="dice">Dice</option>
            <option value="plinko">Plinko</option>
            <option value="slots">Slots</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Conservative over 50"
            maxLength={100}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Bet amount</label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        {gameType === "dice" && (
          <>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Target (0–99.99)</label>
              <input
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <span className="block text-sm text-[var(--text-secondary)]">Condition</span>
              <div className="mt-1 flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={condition === "over"} onChange={() => setCondition("over")} />
                  Over
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={condition === "under"} onChange={() => setCondition("under")} />
                  Under
                </label>
              </div>
            </div>
          </>
        )}
        {gameType === "plinko" && (
          <div>
            <label className="block text-sm text-[var(--text-secondary)]">Risk</label>
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as "low" | "medium" | "high")}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <label className="block text-[var(--text-secondary)]">Stop after rounds (optional)</label>
            <input
              type="number"
              min={1}
              placeholder="—"
              value={stopAfterRounds}
              onChange={(e) => setStopAfterRounds(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-secondary)]">Stop if balance below</label>
            <input
              type="number"
              placeholder="—"
              value={stopIfBalanceBelow}
              onChange={(e) => setStopIfBalanceBelow(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-secondary)]">Stop if balance above</label>
            <input
              type="number"
              placeholder="—"
              value={stopIfBalanceAbove}
              onChange={(e) => setStopIfBalanceAbove(e.target.value)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
            />
          </div>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-[var(--accent-heart)] px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
          <button type="button" onClick={onCancel} className="rounded border border-[var(--border)] px-4 py-2 text-[var(--text-primary)]">
            Cancel
          </button>
        </div>
      </form>
    </GlassCard>
  );
}

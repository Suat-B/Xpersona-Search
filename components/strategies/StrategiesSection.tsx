"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { GlassCard } from "@/components/ui/GlassCard";

const PythonStrategyEditor = dynamic(
  () => import("@/components/strategies/PythonStrategyEditor").then((mod) => mod.PythonStrategyEditor),
  { ssr: false, loading: () => <div className="p-4 text-sm text-[var(--text-secondary)]">Loading Python editor…</div> }
);

type StrategyRow = {
  id: string;
  gameType: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
  hasPythonCode?: boolean;
  description?: string;
};

const GAMES_WITH_RUN = ["dice"] as const;

function configSummary(_gameType: string, config: Record<string, unknown>): string {
  const amount = config.amount ?? "?";
  const target = config.target ?? "?";
  const cond = config.condition ?? "?";
  return `Bet ${amount} @ ${cond} ${target}`;
}

export function StrategiesSection() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"config" | "python">("config");
  const [runStrategyId, setRunStrategyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    strategyId: string;
    sessionPnl: number;
    roundsPlayed: number;
    finalBalance: number;
    stoppedReason: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data?.data?.id) setUserId(data.data.id);
      })
      .catch(() => {});
  }, []);

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

  const handleRun = async (s: StrategyRow) => {
    const gameType = s.gameType;
    if (!(GAMES_WITH_RUN as readonly string[]).includes(gameType)) return;
    setError(null);
    setRunResult(null);
    if (s.hasPythonCode && gameType === "dice") {
      setRunStrategyId(s.id);
      return;
    }
    try {
      const res = await fetch(`/api/games/${gameType}/run-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId: s.id, maxRounds: 20 }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRunResult({
          strategyId: s.id,
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
  const runnable = list.filter((s) => (GAMES_WITH_RUN as readonly string[]).includes(s.gameType));

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
        <>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setCreateMode("config")}
              className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                createMode === "config"
                  ? "bg-white/10 border-[var(--accent-heart)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
              }`}
            >
              Quick config
            </button>
            <button
              type="button"
              onClick={() => setCreateMode("python")}
              className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                createMode === "python"
                  ? "bg-white/10 border-[var(--accent-heart)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
              }`}
            >
              Python strategy
            </button>
          </div>
          {createMode === "config" ? (
            <CreateStrategyForm
              onCreated={() => {
                setCreateOpen(false);
                fetchStrategies();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          ) : (
            <CreatePythonStrategyForm
              onCreated={() => {
                setCreateOpen(false);
                fetchStrategies();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          )}
        </>
      )}

      {runStrategyId && userId && (
        <GlassCard className="mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)]">Run Python strategy</h3>
            <button
              type="button"
              onClick={() => setRunStrategyId(null)}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
            >
              Close
            </button>
          </div>
          <PythonStrategyEditor
            userId={userId}
            strategyId={runStrategyId}
            onStrategyRun={() => window.dispatchEvent(new Event("balance-updated"))}
          />
        </GlassCard>
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
                  {s.gameType}
                  {s.hasPythonCode ? (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Python</span>
                  ) : (
                    <> — {configSummary(s.gameType, s.config)}</>
                  )}
                  {s.description ? ` · ${s.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRun(s)}
                  className="rounded border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-sm text-green-400 hover:bg-green-500/20"
                >
                  {s.hasPythonCode && s.gameType === "dice" ? "Run (Python)" : "Run (20)"}
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
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [stopAfterRounds, setStopAfterRounds] = useState("");
  const [stopIfBalanceBelow, setStopIfBalanceBelow] = useState("");
  const [stopIfBalanceAbove, setStopIfBalanceAbove] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const buildConfig = (): Record<string, unknown> => {
    const base: Record<string, unknown> = { amount, target, condition };
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
        body: JSON.stringify({ gameType: "dice", name: trimmed, config: buildConfig() }),
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
            disabled
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-secondary)] disabled:cursor-not-allowed"
          >
            <option value="dice">Dice</option>
          </select>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Currently only Dice strategies are supported</p>
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

function CreatePythonStrategyForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pythonCode, setPythonCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Name is required");
      return;
    }
    if (!pythonCode.trim()) {
      setErr("Python code is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: "dice",
          name: trimmed,
          description: description.trim() || undefined,
          python_code: pythonCode,
          config: {},
        }),
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
        <h3 className="font-semibold text-[var(--text-primary)]">New Python strategy</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Paste your Python strategy. It must define a class with <code className="bg-white/10 px-1 rounded">on_round_start(ctx)</code> returning a <code className="bg-white/10 px-1 rounded">BetDecision</code>. OpenClaw compatible.
        </p>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Martingale v1"
            maxLength={100}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
            maxLength={200}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-sm text-[var(--text-secondary)]">Python code</label>
          <textarea
            value={pythonCode}
            onChange={(e) => setPythonCode(e.target.value)}
            placeholder="class Strategy:\n  def on_round_start(self, ctx):\n    return BetDecision(10, 50, 'over')"
            rows={14}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] resize-y"
            spellCheck={false}
          />
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

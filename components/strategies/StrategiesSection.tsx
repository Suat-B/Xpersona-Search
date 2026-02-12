"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import { CREATIVE_DICE_STRATEGIES, TARGET_PRESETS } from "@/lib/dice-strategies";
import type { CreativeStrategy } from "@/lib/dice-strategies";
import type { DiceStrategyConfig } from "@/lib/strategies";

type StrategyRow = {
  id: string;
  gameType: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
};

const GAMES_WITH_RUN = ["dice"] as const;

function configSummary(_gameType: string, config: Record<string, unknown>): string {
  const amount = config.amount ?? "?";
  const target = config.target ?? "?";
  const cond = config.condition ?? "?";
  const prog = config.progressionType ?? "flat";
  return `Bet ${amount} @ ${cond} ${target} (${prog})`;
}

function riskColor(risk: string): string {
  switch (risk) {
    case "LOW":
      return "text-emerald-400 bg-emerald-500/10";
    case "MEDIUM":
      return "text-amber-400 bg-amber-500/10";
    case "HIGH":
      return "text-red-400 bg-red-500/10";
    case "CALCULATED":
      return "text-violet-400 bg-violet-500/10";
    default:
      return "text-[var(--text-secondary)] bg-white/5";
  }
}

export function StrategiesSection() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const fetchIdRef = useRef(0);

  const fetchStrategies = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/strategies", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (fetchId !== fetchIdRef.current) return;
      if (res.ok && data.success && Array.isArray(data.data?.strategies)) {
        setStrategies(data.data.strategies);
        setError(null);
      } else {
        setError(data.error ?? "Failed to load strategies");
      }
    } catch {
      if (fetchId !== fetchIdRef.current) return;
      setError("Failed to load strategies");
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const runWithConfig = useCallback((config: DiceStrategyConfig, maxRounds: number, strategyName: string) => {
    setError(null);
    setRunModalConfig({ name: strategyName, config, defaultRounds: maxRounds });
    setRunModalOpen(true);
    setRunning(true);
  }, []);

  const handleRunSaved = useCallback(
    (s: StrategyRow, maxRounds = 20) => {
      if (!(GAMES_WITH_RUN as readonly string[]).includes(s.gameType)) return;
      const cfg = s.config as Record<string, unknown>;
      const config: DiceStrategyConfig = {
        amount: typeof cfg.amount === "number" ? cfg.amount : 10,
        target: typeof cfg.target === "number" ? cfg.target : 50,
        condition: (cfg.condition === "over" || cfg.condition === "under" ? cfg.condition : "over") as "over" | "under",
        progressionType: (cfg.progressionType as DiceStrategyConfig["progressionType"]) ?? "flat",
      };
      setError(null);
      setRunModalConfig({ name: s.name, config, defaultRounds: maxRounds });
      setRunModalOpen(true);
    },
    []
  );

  const handleRunComplete = useCallback(
    (sessionPnl: number, roundsPlayed: number, _wins: number, finalBalance: number) => {
      setRunResult({
        sessionPnl,
        roundsPlayed,
        finalBalance,
        stoppedReason: "—",
      });
      setRunModalOpen(false);
      setRunModalConfig(null);
      setRunning(false);
      window.dispatchEvent(new Event("balance-updated"));
    },
    []
  );

  const handleRunModalClose = useCallback(() => {
    setRunModalOpen(false);
    setRunModalConfig(null);
    setRunning(false);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this strategy?")) return;
    try {
      const res = await fetch(`/api/me/strategies/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setStrategies((prev) => prev.filter((s) => s.id !== id));
      } else {
        setError(data.error ?? "Delete failed");
      }
    } catch {
      setError("Delete failed");
    }
  };

  const runnable = strategies.filter((s) => (GAMES_WITH_RUN as readonly string[]).includes(s.gameType));

  return (
    <section data-agent="strategies-section">
      {/* Creative strategy grid */}
      <div className="mb-8" data-agent="creative-strategies">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4" data-agent="header">
          Dice Strategies for AI Agents
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          For AI agents: <code className="bg-white/10 px-1 rounded text-xs">POST /api/games/dice/run-strategy</code> with <code className="bg-white/10 px-1 rounded text-xs">config</code> (JSON).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CREATIVE_DICE_STRATEGIES.map((s) => (
            <CreativeStrategyCard
              key={s.id}
              strategy={s}
              onRun={(maxRounds) => runWithConfig(toApiConfig(s.config), maxRounds, s.name)}
              running={running}
            />
          ))}
        </div>
      </div>

      {/* Custom strategy builder (collapsible) */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setBuilderOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left text-sm font-medium text-[var(--text-primary)] py-2"
          data-agent="builder-toggle"
        >
          <span className="text-[var(--accent-heart)]">{builderOpen ? "▼" : "▶"}</span>
          Custom strategy builder
        </button>
        {builderOpen && (
          <div className="mt-2">
            <CustomStrategyBuilder
              onRun={(cfg, maxRounds) => runWithConfig(cfg, maxRounds, "Custom")}
            />
          </div>
        )}
      </div>

      {/* My saved strategies */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">My strategies</h3>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">Saved presets with progression.</p>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCreateOpen((o) => !o)}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {createOpen ? "Cancel" : "Create strategy"}
        </button>
      </div>

      {createOpen && (
        <CreateStrategyForm
          onCreated={() => {
            setCreateOpen(false);
            fetchStrategies();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading strategies…</p>
      ) : runnable.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">No saved strategies yet. Create one or save from Dice.</p>
      ) : (
        <div className="space-y-2">
          {runnable.map((s) => (
            <GlassCard key={s.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{s.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{configSummary(s.gameType, s.config)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunSaved(s, 20)}
                  disabled={running}
                  className="rounded border border-green-500/50 bg-green-500/10 px-3 py-1.5 text-sm text-green-400 hover:bg-green-500/20 disabled:opacity-50"
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

function toApiConfig(c: CreativeStrategy["config"]): DiceStrategyConfig {
  return {
    amount: c.amount,
    target: c.target,
    condition: c.condition,
    progressionType: c.progressionType ?? "flat",
  };
}

function CreativeStrategyCard({
  strategy,
  onRun,
}: {
  strategy: CreativeStrategy;
  onRun: (maxRounds: number) => void;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--accent-heart)]/40 transition-colors"
      data-agent="strategy-card"
      data-strategy-id={strategy.id}
      data-config={JSON.stringify(strategy.config)}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" aria-hidden>
          {strategy.icon}
        </span>
        <span className="font-semibold text-[var(--text-primary)]">{strategy.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${riskColor(strategy.risk)}`}>
          {strategy.risk}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">{strategy.desc}</p>
      <p className="text-[10px] text-[var(--text-secondary)]/80 font-mono mb-3">
        {strategy.config.amount} credits · {strategy.config.target}% {strategy.config.condition}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onRun(20)}
          className="rounded border border-green-500/50 bg-green-500/10 px-2 py-1 text-xs text-green-400 hover:bg-green-500/20"
        >
          Run (20)
        </button>
        <button
          type="button"
          onClick={() => onRun(50)}
          className="rounded border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-2 py-1 text-xs text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20"
        >
          Auto-run (50)
        </button>
      </div>
    </div>
  );
}

function CustomStrategyBuilder({
  onRun,
}: {
  onRun: (config: DiceStrategyConfig, maxRounds: number) => void;
}) {
  const [mode, setMode] = useState<"tweak" | "compose">("tweak");
  const [baseStrategyId, setBaseStrategyId] = useState("flat");
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [progressionType, setProgressionType] = useState<string>("flat");
  const [composeProgression, setComposeProgression] = useState("flat");
  const [composeTargetPreset, setComposeTargetPreset] = useState("50-over");

  const baseStrategy = CREATIVE_DICE_STRATEGIES.find((s) => s.id === baseStrategyId) ?? CREATIVE_DICE_STRATEGIES[0]!;
  const targetPreset = TARGET_PRESETS.find((p) => p.id === composeTargetPreset) ?? TARGET_PRESETS[0]!;

  const buildConfig = (): DiceStrategyConfig => {
    if (mode === "compose") {
      return {
        amount,
        target: targetPreset.target,
        condition: targetPreset.condition,
        progressionType: (composeProgression as DiceStrategyConfig["progressionType"]) ?? "flat",
      };
    }
    return {
      amount,
      target,
      condition,
      progressionType: (progressionType as DiceStrategyConfig["progressionType"]) ?? "flat",
    };
  };

  return (
    <GlassCard className="p-6">
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("tweak")}
          className={`px-3 py-1.5 text-sm rounded border ${
            mode === "tweak"
              ? "bg-white/10 border-[var(--accent-heart)] text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
          }`}
        >
          Tweak
        </button>
        <button
          type="button"
          onClick={() => setMode("compose")}
          className={`px-3 py-1.5 text-sm rounded border ${
            mode === "compose"
              ? "bg-white/10 border-[var(--accent-heart)] text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
          }`}
        >
          Compose
        </button>
      </div>

      {mode === "tweak" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)]">Base strategy</label>
            <select
              value={baseStrategyId}
              onChange={(e) => {
                setBaseStrategyId(e.target.value);
                const s = CREATIVE_DICE_STRATEGIES.find((x) => x.id === e.target.value);
                if (s) {
                  setAmount(s.config.amount);
                  setTarget(s.config.target);
                  setCondition(s.config.condition);
                  setProgressionType(s.config.progressionType ?? "flat");
                }
              }}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
            >
              {CREATIVE_DICE_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Amount</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Target</label>
              <input
                type="number"
                min={0}
                max={99}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <span className="block text-xs text-[var(--text-secondary)]">Condition</span>
              <div className="mt-1 flex gap-2">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={condition === "over"} onChange={() => setCondition("over")} />
                  Over
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={condition === "under"} onChange={() => setCondition("under")} />
                  Under
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)]">Progression</label>
              <select
                value={progressionType}
                onChange={(e) => setProgressionType(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]"
              >
                <option value="flat">Flat</option>
                <option value="martingale">Martingale</option>
                <option value="paroli">Paroli</option>
                <option value="dalembert">D&apos;Alembert</option>
                <option value="fibonacci">Fibonacci</option>
                <option value="labouchere">Labouchere</option>
                <option value="oscar">Oscar</option>
                <option value="kelly">Kelly</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === "compose" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Progression</label>
              <select
                value={composeProgression}
                onChange={(e) => setComposeProgression(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              >
                {["flat", "martingale", "paroli", "dalembert", "fibonacci", "labouchere", "oscar", "kelly"].map(
                  (p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Target / Condition</label>
              <select
                value={composeTargetPreset}
                onChange={(e) => setComposeTargetPreset(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              >
                {TARGET_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)]">Base amount</label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full max-w-[120px] rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => onRun(buildConfig(), 20)}
          className="rounded bg-green-500/20 border border-green-500/50 px-4 py-2 text-sm text-green-400 hover:bg-green-500/30"
        >
          Run (20)
        </button>
        <button
          type="button"
          onClick={() => onRun(buildConfig(), 50)}
          className="rounded bg-[var(--accent-heart)]/20 border border-[var(--accent-heart)]/50 px-4 py-2 text-sm text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/30"
        >
          Auto-run (50)
        </button>
      </div>
    </GlassCard>
  );
}

function CreateStrategyForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [progressionType, setProgressionType] = useState<string>("flat");
  const [stopAfterRounds, setStopAfterRounds] = useState("");
  const [stopIfBalanceBelow, setStopIfBalanceBelow] = useState("");
  const [stopIfBalanceAbove, setStopIfBalanceAbove] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const buildConfig = (): Record<string, unknown> => {
    const base: Record<string, unknown> = { amount, target, condition };
    if (progressionType && progressionType !== "flat") base.progressionType = progressionType;
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
        credentials: "include",
        body: JSON.stringify({ gameType: "dice", name: trimmed, config: buildConfig() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        onCreated();
      } else {
        const msg = typeof data.message === "string" ? data.message : data.error;
        setErr(msg ?? (res.status === 401 ? "Please sign in" : "Create failed"));
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
          <label className="block text-sm text-[var(--text-secondary)]">Progression type</label>
          <select
            value={progressionType}
            onChange={(e) => setProgressionType(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          >
            <option value="flat">Flat</option>
            <option value="martingale">Martingale</option>
            <option value="paroli">Paroli</option>
            <option value="dalembert">D&apos;Alembert</option>
            <option value="fibonacci">Fibonacci</option>
            <option value="labouchere">Labouchere</option>
            <option value="oscar">Oscar&apos;s Grind</option>
            <option value="kelly">Kelly Criterion</option>
          </select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
            <label className="block text-sm text-[var(--text-secondary)]">Target (0–99)</label>
            <input
              type="number"
              min={0}
              max={99}
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

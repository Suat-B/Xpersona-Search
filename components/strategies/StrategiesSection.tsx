"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import {
  CREATIVE_DICE_STRATEGIES,
  TARGET_PRESETS,
  PAYOUT_PRESETS,
  RISK_PROFILES,
} from "@/lib/dice-strategies";
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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [saveFormConfig, setSaveFormConfig] = useState<DiceStrategyConfig | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);

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

  const runWithConfig = useCallback(
    (config: DiceStrategyConfig, maxRounds: number, strategyName: string) => {
      setError(null);
      saveStrategyRunPayload({ config, strategyName, maxRounds });
      router.push("/games/dice?run=1");
    },
    [router]
  );

  const handleRunSaved = useCallback(
    (s: StrategyRow, maxRounds = 20) => {
      if (!(GAMES_WITH_RUN as readonly string[]).includes(s.gameType)) return;
      setError(null);
      saveStrategyRunPayload({
        strategyId: s.id,
        strategyName: s.name,
        maxRounds,
      });
      router.push("/games/dice?run=1");
    },
    [router]
  );

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
              onSaveRequest={(cfg) => setSaveFormConfig(cfg)}
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
          onClick={() => {
            setBuilderOpen(true);
            builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="rounded bg-[var(--accent-heart)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create strategy
        </button>
      </div>

      {saveFormConfig && (
        <CreateStrategyForm
          initialConfig={saveFormConfig}
          onCreated={() => {
            setSaveFormConfig(null);
            fetchStrategies();
          }}
          onCancel={() => setSaveFormConfig(null)}
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

const PROGRESSION_TYPES = ["flat", "martingale", "paroli", "dalembert", "fibonacci", "labouchere", "oscar", "kelly"] as const;

function CustomStrategyBuilder({
  onRun,
  onSaveRequest,
}: {
  onRun: (config: DiceStrategyConfig, maxRounds: number) => void;
  onSaveRequest?: (config: DiceStrategyConfig) => void;
}) {
  const [mode, setMode] = useState<"tweak" | "compose" | "advanced">("tweak");
  const [baseStrategyId, setBaseStrategyId] = useState("flat");
  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [condition, setCondition] = useState<"over" | "under">("over");
  const [progressionType, setProgressionType] = useState<string>("flat");
  const [composeProgression, setComposeProgression] = useState("flat");
  const [composeTargetPreset, setComposeTargetPreset] = useState("50-over");
  const [riskProfileId, setRiskProfileId] = useState("");
  const [payoutPresetId, setPayoutPresetId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [maxBet, setMaxBet] = useState("");
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState("");
  const [maxConsecutiveWins, setMaxConsecutiveWins] = useState("");
  const [unitStep, setUnitStep] = useState("");
  const [stopAfterRounds, setStopAfterRounds] = useState("");
  const [stopIfBalanceBelow, setStopIfBalanceBelow] = useState("");
  const [stopIfBalanceAbove, setStopIfBalanceAbove] = useState("");
  const [jsonImport, setJsonImport] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const baseStrategy = CREATIVE_DICE_STRATEGIES.find((s) => s.id === baseStrategyId) ?? CREATIVE_DICE_STRATEGIES[0]!;
  const targetPreset = TARGET_PRESETS.find((p) => p.id === composeTargetPreset) ?? TARGET_PRESETS[0]!;

  const applyRiskProfile = (profileId: string) => {
    const p = RISK_PROFILES.find((r) => r.id === profileId);
    if (!p) return;
    setAmount(p.amount);
    setMaxBet(String(p.maxBet));
    setProgressionType(p.progressionType);
    setComposeProgression(p.progressionType);
    setMaxConsecutiveLosses(String(p.maxConsecutiveLosses));
    setMaxConsecutiveWins(String(p.maxConsecutiveWins));
  };

  const applyPayoutPreset = (presetId: string) => {
    const p = PAYOUT_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setTarget(p.target);
    setCondition(p.condition);
    const tp = TARGET_PRESETS.find((x) => x.target === p.target && x.condition === p.condition);
    if (tp) setComposeTargetPreset(tp.id);
  };

  const handleRandomize = () => {
    const prog = PROGRESSION_TYPES[Math.floor(Math.random() * PROGRESSION_TYPES.length)]!;
    const preset = TARGET_PRESETS[Math.floor(Math.random() * TARGET_PRESETS.length)]!;
    const amt = Math.floor(Math.random() * 99) + 1;
    setProgressionType(prog);
    setComposeProgression(prog);
    setAmount(amt);
    setTarget(preset.target);
    setCondition(preset.condition);
    setComposeTargetPreset(preset.id);
    if (Math.random() > 0.5) {
      applyRiskProfile(RISK_PROFILES[Math.floor(Math.random() * RISK_PROFILES.length)]!.id);
    }
  };

  const loadFromJson = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonImport) as Record<string, unknown>;
      if (typeof parsed.amount === "number") setAmount(parsed.amount);
      if (typeof parsed.target === "number") setTarget(parsed.target);
      if (parsed.condition === "over" || parsed.condition === "under") setCondition(parsed.condition);
      if (typeof parsed.progressionType === "string") {
        setProgressionType(parsed.progressionType);
        setComposeProgression(parsed.progressionType);
      }
      if (typeof parsed.maxBet === "number") setMaxBet(String(parsed.maxBet));
      if (typeof parsed.maxConsecutiveLosses === "number") setMaxConsecutiveLosses(String(parsed.maxConsecutiveLosses));
      if (typeof parsed.maxConsecutiveWins === "number") setMaxConsecutiveWins(String(parsed.maxConsecutiveWins));
      if (typeof parsed.unitStep === "number") setUnitStep(String(parsed.unitStep));
      if (typeof parsed.stopAfterRounds === "number") setStopAfterRounds(String(parsed.stopAfterRounds));
      if (typeof parsed.stopIfBalanceBelow === "number") setStopIfBalanceBelow(String(parsed.stopIfBalanceBelow));
      if (typeof parsed.stopIfBalanceAbove === "number") setStopIfBalanceAbove(String(parsed.stopIfBalanceAbove));
      setJsonImport("");
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  const copyConfigJson = () => {
    const cfg = buildConfig();
    const str = `// POST /api/games/dice/run-strategy\n${JSON.stringify(cfg, null, 2)}`;
    void navigator.clipboard.writeText(str);
  };

  const buildConfig = (): DiceStrategyConfig => {
    const base: DiceStrategyConfig = mode === "compose"
      ? { amount, target: targetPreset.target, condition: targetPreset.condition, progressionType: (composeProgression as DiceStrategyConfig["progressionType"]) ?? "flat" }
      : { amount, target, condition, progressionType: (progressionType as DiceStrategyConfig["progressionType"]) ?? "flat" };
    const maxB = parseInt(maxBet, 10);
    if (!Number.isNaN(maxB) && maxB >= 1) base.maxBet = maxB;
    const mcl = parseInt(maxConsecutiveLosses, 10);
    if (!Number.isNaN(mcl) && mcl >= 1) base.maxConsecutiveLosses = mcl;
    const mcw = parseInt(maxConsecutiveWins, 10);
    if (!Number.isNaN(mcw) && mcw >= 1) base.maxConsecutiveWins = mcw;
    const us = parseFloat(unitStep);
    if (!Number.isNaN(us) && us > 0) base.unitStep = us;
    const stopR = parseInt(stopAfterRounds, 10);
    if (!Number.isNaN(stopR) && stopR > 0) base.stopAfterRounds = stopR;
    const stopB = parseFloat(stopIfBalanceBelow);
    if (!Number.isNaN(stopB)) base.stopIfBalanceBelow = stopB;
    const stopA = parseFloat(stopIfBalanceAbove);
    if (!Number.isNaN(stopA)) base.stopIfBalanceAbove = stopA;
    return base;
  };

  return (
    <GlassCard className="p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {(["tweak", "compose", "advanced"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 text-sm rounded border ${
              mode === m ? "bg-white/10 border-[var(--accent-heart)] text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)]">Risk profile</label>
          <select
            value={riskProfileId}
            onChange={(e) => {
              const v = e.target.value;
              setRiskProfileId(v);
              if (v) applyRiskProfile(v);
            }}
            className="mt-1 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">— None —</option>
            {RISK_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)]">Payout preset</label>
          <select
            value={payoutPresetId}
            onChange={(e) => {
              const v = e.target.value;
              setPayoutPresetId(v);
              if (v) applyPayoutPreset(v);
            }}
            className="mt-1 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          >
            <option value="">— None —</option>
            {PAYOUT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleRandomize}
            className="rounded border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-400 hover:bg-violet-500/20"
          >
            Surprise me
          </button>
        </div>
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
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><label className="block text-xs text-[var(--text-secondary)]">Amount</label>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
            </div>
            <div><label className="block text-xs text-[var(--text-secondary)]">Target</label>
              <input type="number" min={0} max={99} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
            </div>
            <div><span className="block text-xs text-[var(--text-secondary)]">Condition</span>
              <div className="mt-1 flex gap-2">
                <label className="flex items-center gap-1"><input type="radio" checked={condition === "over"} onChange={() => setCondition("over")} /> Over</label>
                <label className="flex items-center gap-1"><input type="radio" checked={condition === "under"} onChange={() => setCondition("under")} /> Under</label>
              </div>
            </div>
            <div><label className="block text-xs text-[var(--text-secondary)]">Progression</label>
              <select value={progressionType} onChange={(e) => setProgressionType(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]">
                {PROGRESSION_TYPES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {mode === "compose" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm text-[var(--text-secondary)]">Progression</label>
              <select value={composeProgression} onChange={(e) => setComposeProgression(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]">
                {PROGRESSION_TYPES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div><label className="block text-sm text-[var(--text-secondary)]">Target / Condition</label>
              <select value={composeTargetPreset} onChange={(e) => setComposeTargetPreset(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]">
                {TARGET_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-sm text-[var(--text-secondary)]">Base amount</label>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full max-w-[120px] rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]" />
          </div>
        </div>
      )}

      {mode === "advanced" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div><label className="block text-xs text-[var(--text-secondary)]">Amount</label>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
            </div>
            <div><label className="block text-xs text-[var(--text-secondary)]">Target</label>
              <input type="number" min={0} max={99} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
            </div>
            <div><span className="block text-xs text-[var(--text-secondary)]">Condition</span>
              <div className="mt-1 flex gap-2">
                <label className="flex items-center gap-1"><input type="radio" checked={condition === "over"} onChange={() => setCondition("over")} /> Over</label>
                <label className="flex items-center gap-1"><input type="radio" checked={condition === "under"} onChange={() => setCondition("under")} /> Under</label>
              </div>
            </div>
            <div><label className="block text-xs text-[var(--text-secondary)]">Progression</label>
              <select value={progressionType} onChange={(e) => setProgressionType(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]">
                {PROGRESSION_TYPES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <button type="button" onClick={() => setAdvancedOpen((o) => !o)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            {advancedOpen ? "▼" : "▶"} Progression tuning & stop conditions
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[var(--border)]">
              <div><label className="block text-xs text-[var(--text-secondary)]">Max bet</label>
                <input type="number" min={1} max={10000} placeholder="10000" value={maxBet} onChange={(e) => setMaxBet(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Max consec. losses</label>
                <input type="number" min={1} max={20} placeholder="10" value={maxConsecutiveLosses} onChange={(e) => setMaxConsecutiveLosses(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Max consec. wins</label>
                <input type="number" min={1} max={10} placeholder="3" value={maxConsecutiveWins} onChange={(e) => setMaxConsecutiveWins(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Unit step</label>
                <input type="number" min={0.25} max={2} step={0.25} placeholder="1" value={unitStep} onChange={(e) => setUnitStep(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Stop after rounds</label>
                <input type="number" min={1} placeholder="—" value={stopAfterRounds} onChange={(e) => setStopAfterRounds(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Stop if bal. below</label>
                <input type="number" min={0} placeholder="—" value={stopIfBalanceBelow} onChange={(e) => setStopIfBalanceBelow(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
              <div><label className="block text-xs text-[var(--text-secondary)]">Stop if bal. above</label>
                <input type="number" min={0} placeholder="—" value={stopIfBalanceAbove} onChange={(e) => setStopIfBalanceAbove(e.target.value)} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[var(--text-primary)]" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => onRun(buildConfig(), 20)} className="rounded bg-green-500/20 border border-green-500/50 px-4 py-2 text-sm text-green-400 hover:bg-green-500/30">Run (20)</button>
        <button type="button" onClick={() => onRun(buildConfig(), 50)} className="rounded bg-[var(--accent-heart)]/20 border border-[var(--accent-heart)]/50 px-4 py-2 text-sm text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/30">Auto-run (50)</button>
        {onSaveRequest && (
          <button type="button" onClick={() => onSaveRequest(buildConfig())} className="rounded border border-[var(--accent-heart)]/50 bg-[var(--accent-heart)]/10 px-4 py-2 text-sm text-[var(--accent-heart)] hover:bg-[var(--accent-heart)]/20">Save to My strategies</button>
        )}
        <button type="button" onClick={copyConfigJson} className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Copy as JSON</button>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Import from JSON (for API config)</label>
        <div className="flex gap-2">
          <textarea
            value={jsonImport}
            onChange={(e) => { setJsonImport(e.target.value); setJsonError(null); }}
            placeholder='{"amount":10,"target":50,"condition":"over","progressionType":"martingale"}'
            className="flex-1 min-h-[60px] rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-xs font-mono text-[var(--text-primary)]"
          />
          <button type="button" onClick={loadFromJson} className="shrink-0 rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-white/5">Load</button>
        </div>
        {jsonError && <p className="mt-1 text-xs text-red-400">{jsonError}</p>}
      </div>
    </GlassCard>
  );
}

function CreateStrategyForm({
  onCreated,
  onCancel,
  initialConfig,
}: {
  onCreated: () => void;
  onCancel: () => void;
  initialConfig?: DiceStrategyConfig;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(initialConfig?.amount ?? 10);
  const [target, setTarget] = useState(initialConfig?.target ?? 50);
  const [condition, setCondition] = useState<"over" | "under">(
    initialConfig?.condition ?? "over"
  );
  const [progressionType, setProgressionType] = useState<string>(
    initialConfig?.progressionType ?? "flat"
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stopAfterRounds, setStopAfterRounds] = useState(
    initialConfig?.stopAfterRounds ? String(initialConfig.stopAfterRounds) : ""
  );
  const [stopIfBalanceBelow, setStopIfBalanceBelow] = useState(
    initialConfig?.stopIfBalanceBelow != null ? String(initialConfig.stopIfBalanceBelow) : ""
  );
  const [stopIfBalanceAbove, setStopIfBalanceAbove] = useState(
    initialConfig?.stopIfBalanceAbove != null ? String(initialConfig.stopIfBalanceAbove) : ""
  );
  const [maxBet, setMaxBet] = useState(
    initialConfig?.maxBet ? String(initialConfig.maxBet) : ""
  );
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(
    initialConfig?.maxConsecutiveLosses ? String(initialConfig.maxConsecutiveLosses) : ""
  );
  const [maxConsecutiveWins, setMaxConsecutiveWins] = useState(
    initialConfig?.maxConsecutiveWins ? String(initialConfig.maxConsecutiveWins) : ""
  );
  const [unitStep, setUnitStep] = useState(
    initialConfig?.unitStep ? String(initialConfig.unitStep) : ""
  );
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
    const maxB = parseInt(maxBet, 10);
    if (!Number.isNaN(maxB) && maxB >= 1) base.maxBet = maxB;
    const mcl = parseInt(maxConsecutiveLosses, 10);
    if (!Number.isNaN(mcl) && mcl >= 1) base.maxConsecutiveLosses = mcl;
    const mcw = parseInt(maxConsecutiveWins, 10);
    if (!Number.isNaN(mcw) && mcw >= 1) base.maxConsecutiveWins = mcw;
    const us = parseFloat(unitStep);
    if (!Number.isNaN(us) && us > 0) base.unitStep = us;
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

        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {advancedOpen ? "▼" : "▶"} Advanced: stop conditions & progression tuning
        </button>
        {advancedOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[var(--border)]">
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Stop after rounds</label>
              <input
                type="number"
                min={1}
                placeholder="—"
                value={stopAfterRounds}
                onChange={(e) => setStopAfterRounds(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Stop if balance below</label>
              <input
                type="number"
                min={0}
                placeholder="—"
                value={stopIfBalanceBelow}
                onChange={(e) => setStopIfBalanceBelow(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Stop if balance above</label>
              <input
                type="number"
                min={0}
                placeholder="—"
                value={stopIfBalanceAbove}
                onChange={(e) => setStopIfBalanceAbove(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)]">Max bet</label>
              <input
                type="number"
                min={1}
                max={10000}
                placeholder="10000"
                value={maxBet}
                onChange={(e) => setMaxBet(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            {(progressionType === "martingale" || progressionType === "paroli") && (
              <>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)]">Max consec. losses</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    placeholder="10"
                    value={maxConsecutiveLosses}
                    onChange={(e) => setMaxConsecutiveLosses(e.target.value)}
                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)]">Max consec. wins</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="3"
                    value={maxConsecutiveWins}
                    onChange={(e) => setMaxConsecutiveWins(e.target.value)}
                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
              </>
            )}
            {(progressionType === "dalembert" || progressionType === "oscar") && (
              <div>
                <label className="block text-sm text-[var(--text-secondary)]">Unit step</label>
                <input
                  type="number"
                  min={0.25}
                  max={2}
                  step={0.25}
                  placeholder="1"
                  value={unitStep}
                  onChange={(e) => setUnitStep(e.target.value)}
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
                />
              </div>
            )}
          </div>
        )}

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

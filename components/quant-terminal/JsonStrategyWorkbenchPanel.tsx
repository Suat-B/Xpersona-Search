"use client";

/**
 * JSON Strategy Workbench Panel
 * For AI agents & power users: paste/create advanced strategies as raw JSON.
 * Supports both basic (DiceStrategyConfig) and advanced (AdvancedDiceStrategy) formats.
 * 101010 binary = gospel.
 */

import { useState, useCallback, useRef } from "react";
import type { DiceStrategyConfig } from "@/lib/strategies";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";
import { STRATEGY_PRESETS } from "@/lib/advanced-strategy-types";

const MAX_ROUNDS_OPTIONS = [10, 20, 50, 100] as const;

export type JsonStrategyFormat = "basic" | "advanced" | "invalid";

export interface JsonStrategyParseResult {
  format: JsonStrategyFormat;
  data: DiceStrategyConfig | AdvancedDiceStrategy | null;
  error: string | null;
}

/** Parse raw JSON and detect format. Robust for LLM/AI output. */
export function parseJsonStrategy(raw: string): JsonStrategyParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { format: "invalid", data: null, error: "Empty input" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const err = e instanceof SyntaxError ? e.message : "Invalid JSON";
    return { format: "invalid", data: null, error: err };
  }
  if (!parsed || typeof parsed !== "object") {
    return { format: "invalid", data: null, error: "Must be a JSON object" };
  }
  const o = parsed as Record<string, unknown>;

  // Advanced: has baseConfig and rules array
  if (
    o.baseConfig &&
    typeof o.baseConfig === "object" &&
    Array.isArray(o.rules) &&
    o.rules.length > 0
  ) {
    const bc = o.baseConfig as Record<string, unknown>;
    const amount =
      typeof bc.amount === "number"
        ? bc.amount
        : typeof bc.amount === "string"
          ? parseInt(bc.amount, 10)
          : NaN;
    const target =
      typeof bc.target === "number"
        ? bc.target
        : typeof bc.target === "string"
          ? parseFloat(bc.target)
          : NaN;
    const cond = String(bc.condition ?? "over").toLowerCase();
    const condition = cond === "under" ? "under" : "over";
    if (
      !Number.isFinite(amount) ||
      amount < 1 ||
      amount > 10000 ||
      !Number.isFinite(target) ||
      target < 0 ||
      target >= 100
    ) {
      return {
        format: "advanced",
        data: null,
        error: "baseConfig: amount 1-10000, target 0-99.99",
      };
    }
    const rules = o.rules as Array<Record<string, unknown>>;
    const validRules = rules.filter(
      (r) =>
        r?.trigger &&
        typeof (r.trigger as Record<string, unknown>).type === "string" &&
        r?.action &&
        typeof (r.action as Record<string, unknown>).type === "string"
    );
    if (validRules.length === 0) {
      return {
        format: "advanced",
        data: null,
        error: "At least one rule with trigger.type and action.type required",
      };
    }
    return {
      format: "advanced",
      data: {
        ...o,
        name: String(o.name || "Inline"),
        baseConfig: { amount, target, condition },
        rules: o.rules,
        executionMode: o.executionMode === "all_matching" ? "all_matching" : "sequential",
      } as AdvancedDiceStrategy,
      error: null,
    };
  }

  // Basic: has amount, target, condition (with optional progression)
  const amount =
    typeof o.amount === "number"
      ? o.amount
      : typeof o.amount === "string"
        ? parseInt(o.amount, 10)
        : NaN;
  const target =
    typeof o.target === "number"
      ? o.target
      : typeof o.target === "string"
        ? parseFloat(o.target)
        : NaN;
  const cond = String(o.condition ?? "over").toLowerCase();
  const condition = (cond === "under" ? "under" : "over") as "over" | "under";
  if (
    !Number.isFinite(amount) ||
    amount < 1 ||
    amount > 10000 ||
    !Number.isFinite(target) ||
    target < 0 ||
    target >= 100
  ) {
    return {
      format: "basic",
      data: null,
      error: "amount 1-10000, target 0-99.99, condition over|under",
    };
  }
  const config: DiceStrategyConfig = { amount, target, condition };
  const prog = String(o.progressionType ?? "").toLowerCase();
  if (
    [
      "flat",
      "martingale",
      "paroli",
      "dalembert",
      "fibonacci",
      "labouchere",
      "oscar",
      "kelly",
    ].includes(prog)
  ) {
    config.progressionType = prog as DiceStrategyConfig["progressionType"];
  }
  const numericOpts = [
    "maxBet",
    "maxConsecutiveLosses",
    "maxConsecutiveWins",
    "unitStep",
    "stopAfterRounds",
    "stopIfBalanceBelow",
    "stopIfBalanceAbove",
  ] as const;
  for (const k of numericOpts) {
    const v = (o as Record<string, unknown>)[k];
    let n: number | undefined;
    if (typeof v === "number" && !Number.isNaN(v)) n = v;
    else if (typeof v === "string") n = parseFloat(v);
    if (n !== undefined && !Number.isNaN(n)) {
      (config as Record<string, unknown>)[k] = n;
    }
  }
  return { format: "basic", data: config, error: null };
}

const BASIC_EXAMPLE: DiceStrategyConfig = {
  amount: 10,
  target: 49,
  condition: "over",
  progressionType: "martingale",
  maxBet: 500,
  stopAfterRounds: 50,
};

interface JsonStrategyWorkbenchPanelProps {
  /** Run basic config inline */
  onRunBasicConfig: (config: DiceStrategyConfig, maxRounds: number) => Promise<void>;
  /** Run advanced strategy inline */
  onRunAdvancedStrategy: (strategy: AdvancedDiceStrategy, maxRounds: number) => Promise<void>;
  /** Export current manual config to JSON */
  currentConfig?: { amount: number; target: number; condition: "over" | "under" };
  /** When strategy run is in progress */
  isRunning?: boolean;
  /** AI driving - disable run/save */
  aiDriving?: boolean;
}

export function JsonStrategyWorkbenchPanel({
  onRunBasicConfig,
  onRunAdvancedStrategy,
  currentConfig,
  isRunning = false,
  aiDriving = false,
}: JsonStrategyWorkbenchPanelProps) {
  const [rawJson, setRawJson] = useState("");
  const [status, setStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const [maxRounds, setMaxRounds] = useState(20);
  const [schemaExpanded, setSchemaExpanded] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const clearStatus = useCallback(() => {
    setStatus({ type: "idle", message: "" });
  }, []);

  const showStatus = useCallback((type: "success" | "error", message: string) => {
    setStatus({ type, message });
  }, []);

  const result = parseJsonStrategy(rawJson);

  const handleValidate = useCallback(() => {
    if (result.error) {
      showStatus("error", result.error);
      return;
    }
    showStatus(
      "success",
      `Valid ${result.format} strategy${result.format === "advanced" && result.data ? ` — ${(result.data as AdvancedDiceStrategy).name}` : ""}`
    );
  }, [result, showStatus]);

  const handleRun = useCallback(async () => {
    if (aiDriving || isRunning) return;
    if (result.error || !result.data) {
      showStatus("error", result.error ?? "Invalid strategy");
      return;
    }
    if (result.format === "basic") {
      await onRunBasicConfig(result.data as DiceStrategyConfig, maxRounds);
      showStatus("success", `Ran basic strategy — ${maxRounds} rounds`);
    } else {
      await onRunAdvancedStrategy(result.data as AdvancedDiceStrategy, maxRounds);
      showStatus("success", `Ran advanced strategy — ${maxRounds} rounds`);
    }
  }, [
    result,
    maxRounds,
    aiDriving,
    isRunning,
    onRunBasicConfig,
    onRunAdvancedStrategy,
    showStatus,
  ]);

  const handleSave = useCallback(async () => {
    if (aiDriving || result.error || !result.data) return;
    setSaveLoading(true);
    try {
      if (result.format === "basic") {
        const config = result.data as DiceStrategyConfig;
        const name = saveName.trim() || `JSON Basic ${Date.now()}`;
        const res = await fetch("/api/me/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ gameType: "dice", name, config }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showStatus("error", data.message ?? data.error ?? "Save failed");
          return;
        }
        showStatus("success", `Saved as "${name}"`);
        setSaveName("");
      } else {
        const strategy = result.data as AdvancedDiceStrategy;
        const name =
          saveName.trim() || strategy.name || `JSON Advanced ${Date.now()}`;
        const res = await fetch("/api/me/advanced-strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name,
            description: strategy.description,
            baseConfig: strategy.baseConfig,
            rules: strategy.rules,
            globalLimits: strategy.globalLimits,
            executionMode: strategy.executionMode ?? "sequential",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showStatus("error", data.message ?? data.error ?? "Save failed");
          return;
        }
        showStatus("success", `Saved as "${name}"`);
        setSaveName("");
        window.dispatchEvent(new Event("advanced-strategies-updated"));
      }
    } catch (err) {
      showStatus("error", "Network error — save failed");
    } finally {
      setSaveLoading(false);
    }
  }, [
    result,
    saveName,
    aiDriving,
    showStatus,
  ]);

  const handleLoadBasic = useCallback(() => {
    setRawJson(JSON.stringify(BASIC_EXAMPLE, null, 2));
    clearStatus();
  }, [clearStatus]);

  const handleLoadAdvanced = useCallback(
    (presetId?: string) => {
      const preset = presetId
        ? STRATEGY_PRESETS.find((p) => p.id === presetId)
        : STRATEGY_PRESETS[0];
      if (!preset) return;
      setRawJson(JSON.stringify(preset.strategy, null, 2));
      clearStatus();
    },
    [clearStatus]
  );

  const handleExportCurrent = useCallback(() => {
    if (!currentConfig) return;
    const basic = {
      amount: currentConfig.amount,
      target: currentConfig.target,
      condition: currentConfig.condition,
    };
    setRawJson(JSON.stringify(basic, null, 2));
    clearStatus();
  }, [currentConfig, clearStatus]);

  const handleCopy = useCallback(() => {
    if (!rawJson.trim()) return;
    navigator.clipboard.writeText(rawJson).then(
      () => showStatus("success", "Copied to clipboard"),
      () => showStatus("error", "Copy failed")
    );
  }, [rawJson, showStatus]);

  const disabled = aiDriving || isRunning;

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header: purpose + format badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--quant-neutral)] flex items-center gap-1.5">
          <span className="w-0.5 h-3 rounded-full bg-amber-500/80" />
          AI Agent JSON — Advanced Strategies
        </span>
        <div className="flex items-center gap-2">
          {result.format !== "invalid" && (
            <span
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                result.format === "advanced"
                  ? "bg-[var(--quant-purple)]/30 text-[var(--quant-purple)]"
                  : "bg-[var(--quant-accent)]/20 text-[var(--quant-accent)]"
              }`}
            >
              {result.format.toUpperCase()}
            </span>
          )}
          <span className="text-[9px] text-[var(--quant-neutral)]">Rounds:</span>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="text-[10px] font-mono bg-[var(--quant-bg-card)] border border-[var(--quant-border)] rounded px-2 py-0.5 text-[var(--quant-text-primary)] focus:border-[var(--quant-accent)] focus:outline-none"
          >
            {MAX_ROUNDS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* JSON textarea */}
      <textarea
        ref={textareaRef}
        value={rawJson}
        onChange={(e) => {
          setRawJson(e.target.value);
          clearStatus();
        }}
        placeholder={`Paste or type strategy JSON — Basic: { "amount": 10, "target": 49, "condition": "over" }
Advanced: { "name": "...", "baseConfig": { ... }, "rules": [ { "trigger": { "type": "loss" }, "action": { "type": "double_bet" } } ] }`}
        className="quant-input w-full min-h-[140px] font-mono text-[11px] leading-relaxed resize-y"
        spellCheck={false}
      />

      {/* Status */}
      {status.message && (
        <div
          className={`text-[10px] px-3 py-2 rounded ${
            status.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          {status.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={handleValidate}
          disabled={disabled}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-[var(--quant-bg-card)] border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 disabled:opacity-50 transition-all"
        >
          Validate
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={disabled || !!result.error}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-bold bg-[var(--quant-bullish)]/20 border border-[var(--quant-bullish)]/40 text-[var(--quant-bullish)] hover:bg-[var(--quant-bullish)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isRunning ? (
            <>
              <svg
                className="w-3 h-3 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Running…
            </>
          ) : (
            <>
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Run
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || !!result.error || saveLoading}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold bg-[var(--quant-accent)]/20 border border-[var(--quant-accent)]/40 text-[var(--quant-accent)] hover:bg-[var(--quant-accent)]/30 disabled:opacity-50 transition-all"
        >
          Save
        </button>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Strategy name (optional)"
          className="quant-input w-32 text-[10px] px-2 py-1"
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!rawJson.trim()}
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 disabled:opacity-50 transition-colors"
        >
          Copy
        </button>
      </div>

      {/* Load examples */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[9px] text-[var(--quant-neutral)] self-center mr-1">
          Load:
        </span>
        <button
          type="button"
          onClick={handleLoadBasic}
          className="px-2 py-1 rounded text-[10px] border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
        >
          Basic
        </button>
        <button
          type="button"
          onClick={() => handleLoadAdvanced()}
          className="px-2 py-1 rounded text-[10px] border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
        >
          Advanced
        </button>
        {STRATEGY_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleLoadAdvanced(p.id)}
            className="px-2 py-1 rounded text-[10px] border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
          >
            {p.name}
          </button>
        ))}
        {currentConfig && (
          <button
            type="button"
            onClick={handleExportCurrent}
            className="px-2 py-1 rounded text-[10px] border border-[var(--quant-border)] text-[var(--quant-neutral)] hover:text-white hover:border-[var(--quant-accent)]/40 transition-colors"
          >
            From Manual
          </button>
        )}
      </div>

      {/* Schema reference (collapsible) */}
      <div className="mt-auto pt-2 border-t border-[var(--quant-border)]">
        <button
          type="button"
          onClick={() => setSchemaExpanded(!schemaExpanded)}
          className="flex items-center gap-1.5 text-[10px] text-[var(--quant-neutral)] hover:text-white transition-colors w-full"
        >
          <span
            className={`transition-transform ${schemaExpanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          Schema reference for AI agents
        </button>
        {schemaExpanded && (
          <div className="mt-2 p-3 bg-[var(--quant-bg-card)] rounded border border-[var(--quant-border)] text-[10px] font-mono text-[var(--quant-neutral)] space-y-2 overflow-auto max-h-48">
            <div>
              <span className="text-[var(--quant-accent)]">Basic:</span>{" "}
              <code>
                {`{ amount: 1-10000, target: 0-99.99, condition: "over"|"under", progressionType?, maxBet?, stopAfterRounds? }`}
              </code>
            </div>
            <div>
              <span className="text-[var(--quant-purple)]">Advanced:</span>{" "}
              <code>
                {`{ name, baseConfig: { amount, target, condition }, rules: [{ trigger: { type }, action: { type, value? } }], executionMode?, globalLimits? }`}
              </code>
            </div>
            <div className="text-[9px] opacity-75">
              Triggers: win, loss, streak_loss_at_least, profit_above, balance_below,
              win_rate_above… | Actions: double_bet, reset_bet, switch_over_under,
              stop, set_bet_percent_of_balance… | GET /api/discovery for full schema
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

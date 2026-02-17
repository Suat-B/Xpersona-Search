"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { DiceStrategyConfig } from "@/lib/strategies";

/** Local type to avoid cross-folder import (games -> strategies) that can trigger .call bundling issues */
type DiceConfig = { amount: number; target: number; condition: "over" | "under" };

type StrategyOption = {
  id: string;
  name: string;
  config: DiceConfig & { progressionType?: DiceStrategyConfig["progressionType"] };
};

type StrategyRowFromApi = {
  id: string;
  name: string;
  config: Record<string, unknown>;
};

function isDiceConfig(c: Record<string, unknown>): boolean {
  const amount = c.amount;
  const target = c.target;
  const condition = c.condition;
  const hasAmount = typeof amount === "number" || (typeof amount === "string" && !Number.isNaN(Number(amount)));
  const hasTarget = typeof target === "number" || (typeof target === "string" && !Number.isNaN(Number(target)));
  const hasCondition = condition === "over" || condition === "under";
  return !!(hasAmount && hasTarget && hasCondition);
}

type DiceStrategyPanelProps = {
  amount: number;
  target: number;
  condition: "over" | "under";
  progressionType?: DiceStrategyConfig["progressionType"];
  activeStrategyName?: string | null;
  disabled?: boolean;
  onLoadConfig: (config: DiceConfig & { progressionType?: DiceStrategyConfig["progressionType"] }, strategyName?: string) => void;
  onBalanceUpdate?: () => void;
  onStrategyComplete?: (sessionPnl: number, roundsPlayed: number, wins: number) => void;
  onStartStrategyRun?: (config: DiceStrategyConfig, maxRounds: number, strategyName: string) => void;
};

export function DiceStrategyPanel({
  amount,
  target,
  condition,
  progressionType = "flat",
  activeStrategyName,
  disabled,
  onLoadConfig,
  onBalanceUpdate,
  onStrategyComplete,
  onStartStrategyRun,
}: DiceStrategyPanelProps) {
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [runMaxRounds, setRunMaxRounds] = useState(20);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/me/strategies?gameType=dice", { credentials: "include" });
      const text = await res.text();
      let data: { success?: boolean; data?: { strategies?: StrategyRowFromApi[] } };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setStrategies([]);
        return;
      }
      if (data.success && Array.isArray(data.data?.strategies)) {
        const raw = (data.data.strategies as StrategyRowFromApi[]).filter(
          (s: StrategyRowFromApi) => s.config != null
        );
        const mapped = raw
          .filter((s) => isDiceConfig(s.config as Record<string, unknown>))
          .map((s): StrategyOption => {
            const cfg = s.config as Record<string, unknown>;
            const amount = typeof cfg.amount === "number" ? cfg.amount : Number(cfg.amount) || 10;
            const target = typeof cfg.target === "number" ? cfg.target : Number(cfg.target) || 50;
            const conditionRaw = cfg.condition === "over" || cfg.condition === "under" ? cfg.condition : "over";
            const condition = conditionRaw as "over" | "under";
            return {
              id: s.id,
              name: s.name,
              config: {
                amount,
                target,
                condition,
                progressionType: (cfg.progressionType as DiceStrategyConfig["progressionType"]) ?? "flat",
              },
            };
          });
        setStrategies(mapped);
        if (selectedId && !mapped.some((x: StrategyOption) => x.id === selectedId)) {
          setSelectedId(null);
        }
      }
    } catch {
      setStrategies([]);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const selected = strategies.find((s) => s.id === selectedId);

  const handleLoad = () => {
    if (selected) {
      onLoadConfig(selected.config, selected.name);
      setMessage(`Loaded "${selected.name}"`);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = saveName.trim();
    if (!name) return;
    setMessage(null);
    try {
      const res = await fetch("/api/me/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          gameType: "dice",
          name,
          config: { amount, target, condition },
        }),
      });
      const text = await res.text();
      let data: { success?: boolean; message?: string; error?: string };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setMessage("Save failed");
        return;
      }
      if (data.success) {
        setSaveOpen(false);
        setSaveName("");
        await fetchStrategies();
        setMessage("Strategy saved");
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage(data.message ?? data.error ?? "Save failed");
      }
    } catch {
      setMessage("Save failed");
    }
  };

  const buildRunConfig = (): DiceStrategyConfig => {
    const c = selected?.config ?? { amount, target, condition };
    return {
      amount: c.amount,
      target: c.target,
      condition: c.condition,
      progressionType: selected?.config?.progressionType ?? "flat",
    };
  };

  const handleRunStrategy = () => {
    setMessage(null);
    const config = buildRunConfig();
    const strategyName = selected?.name ?? "Quick run";
    onStartStrategyRun?.(config, runMaxRounds, strategyName);
    onBalanceUpdate?.();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Saved strategies
        </h4>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {strategies.length} saved
        </span>
      </div>

      {/* Empty state */}
      {strategies.length === 0 && !saveOpen && (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-matte)]/30 p-4 text-center">
          <p className="text-xs text-[var(--text-secondary)]">
            No saved strategies yet
          </p>
          <p className="text-[10px] text-[var(--text-secondary)]/70 mt-1">
            Save your current settings or create strategies on the{" "}
            <Link href="/dashboard/strategies" className="text-[var(--accent-heart)] hover:underline">
              Strategies
            </Link>{" "}
            page
          </p>
        </div>
      )}

      {/* Strategy selector & actions */}
      {strategies.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setSelectedId(id);
                const s = id ? strategies.find((x) => x.id === id) : null;
                if (s) {
                  onLoadConfig(s.config, s.name);
                }
              }}
              disabled={disabled}
              className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-heart)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/30"
            >
              <option value="">Select a strategy...</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {selected && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-matte)]/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-primary)]">{selected.name}</span>
                <span className="text-[10px] text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-card)]">
                  {selected.config.progressionType || "flat"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
                <span>Transaction: {selected.config.amount}</span>
                <span className="text-[var(--border)]">|</span>
                <span>Target: {selected.config.target}% {selected.config.condition}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLoad}
          disabled={disabled || !selectedId}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent-heart)]/50 hover:bg-[var(--accent-heart)]/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => setSaveOpen((o) => !o)}
          disabled={disabled}
          className="flex-1 rounded-lg border border-[var(--accent-heart)]/30 bg-[var(--accent-heart)]/10 px-3 py-2 text-xs font-medium text-[var(--accent-heart)] transition-colors hover:bg-[var(--accent-heart)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveOpen ? "Cancel" : "Save new"}
        </button>
      </div>

      {/* Save form */}
      {saveOpen && (
        <form onSubmit={handleSave} className="rounded-lg border border-[var(--border)] bg-[var(--bg-matte)]/30 p-3 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
              Strategy name
            </label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g., Conservative Over 50"
              maxLength={100}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:border-[var(--accent-heart)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!saveName.trim()}
              className="flex-1 rounded-lg bg-[var(--accent-heart)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-heart)]/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save strategy
            </button>
            <button
              type="button"
              onClick={() => { setSaveOpen(false); setSaveName(""); }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Run strategy section */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-matte)]/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--text-primary)]">Auto-run strategy</span>
          <span className="text-[10px] text-[var(--text-secondary)]">With dice animation</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Rounds</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={runMaxRounds}
              onChange={(e) => setRunMaxRounds(Number(e.target.value) || 20)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)] text-center focus:border-[var(--accent-heart)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-heart)]/30"
            />
          </div>
          <div className="flex gap-1">
            {[10, 20, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRunMaxRounds(n)}
                className={`px-2 py-1.5 text-[10px] rounded-md transition-colors ${
                  runMaxRounds === n
                    ? "bg-[var(--accent-heart)]/20 text-[var(--accent-heart)] border border-[var(--accent-heart)]/30"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)]/30"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunStrategy}
          disabled={disabled || !onStartStrategyRun}
          className="w-full rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/20 transition-all hover:shadow-green-500/30 hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Run strategy
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className="rounded-lg border border-[#0ea5e9]/30 bg-[#0ea5e9]/10 px-3 py-2">
          <p className="text-xs text-[#0ea5e9] flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {message}
          </p>
        </div>
      )}
    </div>
  );
}

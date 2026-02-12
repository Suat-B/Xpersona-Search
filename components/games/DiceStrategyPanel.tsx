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
          .map((s) => {
            const cfg = s.config as Record<string, unknown>;
            const amount = typeof cfg.amount === "number" ? cfg.amount : Number(cfg.amount) || 10;
            const target = typeof cfg.target === "number" ? cfg.target : Number(cfg.target) || 50;
            const condition = cfg.condition === "over" || cfg.condition === "under" ? cfg.condition : "over";
            return {
              id: s.id,
              name: s.name,
              config: {
                ...cfg,
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
    <div className="rounded border border-[var(--border)] bg-[var(--bg-matte)]/50 p-4 space-y-4">
      <p className="text-sm font-medium text-[var(--text-secondary)]">
        Quick strategies — save, load, run with dice animation
      </p>
      {strategies.length === 0 && (
        <p className="text-xs text-amber-400/90">
          No saved strategies yet. Use &quot;Save as strategy&quot; below with your current bet/target, or create one on the <Link href="/dashboard/strategies" className="text-[var(--accent-heart)] hover:underline">Strategies</Link> page.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
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
          className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
        >
          <option value="">— Load strategy —</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleLoad}
          disabled={disabled || !selectedId}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] disabled:opacity-50"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => setSaveOpen((o) => !o)}
          disabled={disabled}
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-primary)] disabled:opacity-50"
        >
          Save as strategy
        </button>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          Run
          <input
            type="number"
            min={1}
            max={1000}
            value={runMaxRounds}
            onChange={(e) => setRunMaxRounds(Number(e.target.value) || 20)}
            title="1–1000 rounds"
            className="w-16 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1 text-[var(--text-primary)]"
          />
          rounds (1–1000)
        </label>
        <button
          type="button"
          onClick={handleRunStrategy}
          disabled={disabled || !onStartStrategyRun}
          className="rounded bg-green-600/80 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-green-600"
        >
          Run strategy
        </button>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        Choose rounds (1–1000), then Run strategy. Runs auto-play with live dice animation, balance, and bet per round. More strategies (Martingale, Paroli, etc.) on the <Link href="/dashboard/strategies" className="text-[var(--accent-heart)] hover:underline">Strategies</Link> page.
      </p>

      {saveOpen && (
        <form onSubmit={handleSave} className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Strategy name"
            maxLength={100}
            className="rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-sm text-[var(--text-primary)] w-48"
          />
          <button type="submit" disabled={!saveName.trim()} className="rounded bg-[var(--accent-heart)] px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => { setSaveOpen(false); setSaveName(""); }} className="text-sm text-[var(--text-secondary)]">
            Cancel
          </button>
        </form>
      )}
      {message && <p className="text-sm text-amber-400">{message}</p>}
    </div>
  );
}

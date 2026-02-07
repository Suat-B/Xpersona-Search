"use client";

import { useState, useEffect, useCallback } from "react";
import type { DiceStrategyConfig } from "@/lib/strategies";

type StrategyOption = {
  id: string;
  name: string;
  config: DiceStrategyConfig;
};

type DiceStrategyPanelProps = {
  amount: number;
  target: number;
  condition: "over" | "under";
  disabled?: boolean;
  onLoadConfig: (config: DiceStrategyConfig) => void;
  onBalanceUpdate?: () => void;
};

export function DiceStrategyPanel({
  amount,
  target,
  condition,
  disabled,
  onLoadConfig,
  onBalanceUpdate,
}: DiceStrategyPanelProps) {
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [runMaxRounds, setRunMaxRounds] = useState(20);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    sessionPnl: number;
    roundsPlayed: number;
    stoppedReason: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/me/strategies?gameType=dice");
      const data = await res.json();
      if (data.success && Array.isArray(data.data?.strategies)) {
        const list = data.data.strategies
          .filter((s: { gameType: string }) => s.gameType === "dice")
          .map((s: { id: string; name: string; config: unknown }) => ({
            id: s.id,
            name: s.name,
            config: s.config as DiceStrategyConfig,
          }));
        setStrategies(list);
        if (selectedId && !list.some((x: StrategyOption) => x.id === selectedId)) {
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
      onLoadConfig(selected.config);
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
        body: JSON.stringify({
          gameType: "dice",
          name,
          config: { amount, target, condition },
        }),
      });
      const data = await res.json();
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

  const handleRun = async () => {
    setMessage(null);
    setRunResult(null);
    setRunning(true);
    try {
      const body: { strategyId?: string; config?: DiceStrategyConfig; maxRounds: number } = {
        maxRounds: Math.min(100, Math.max(1, runMaxRounds)),
      };
      if (selectedId) {
        body.strategyId = selectedId;
      } else {
        body.config = { amount, target, condition };
      }
      const res = await fetch("/api/games/dice/run-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRunResult({
          sessionPnl: data.data.sessionPnl ?? 0,
          roundsPlayed: data.data.roundsPlayed ?? 0,
          stoppedReason: data.data.stoppedReason ?? "—",
        });
        onBalanceUpdate?.();
      } else {
        setMessage(data.error ?? data.message ?? "Run failed");
      }
    } catch {
      setMessage("Run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg-matte)]/50 p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--text-secondary)]">Strategy (save / load / run)</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value || null)}
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
            max={100}
            value={runMaxRounds}
            onChange={(e) => setRunMaxRounds(Number(e.target.value) || 20)}
            className="w-14 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1 text-[var(--text-primary)]"
          />
          rounds
        </label>
        <button
          type="button"
          onClick={handleRun}
          disabled={disabled || running}
          className="rounded bg-green-600/80 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run strategy"}
        </button>
      </div>
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
      {runResult && (
        <p className="text-sm text-[var(--text-primary)]">
          Run: PnL <span className={runResult.sessionPnl >= 0 ? "text-green-400" : "text-red-400"}>{runResult.sessionPnl}</span>, {runResult.roundsPlayed} rounds, stopped: {runResult.stoppedReason}
        </p>
      )}
    </div>
  );
}

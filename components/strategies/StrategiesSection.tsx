"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import { CREATIVE_DICE_STRATEGIES } from "@/lib/dice-strategies";
import type { CreativeStrategy } from "@/lib/dice-strategies";
import type { DiceStrategyConfig } from "@/lib/strategies";
import { AdvancedStrategiesSection } from "./AdvancedStrategiesSection";

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
    <section data-agent="strategies-section" className="space-y-8">
      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3" role="alert">
          <p className="text-sm text-red-400 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </p>
        </div>
      )}

      {/* Creative strategy grid */}
      <div data-agent="creative-strategies">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" data-agent="header">
              Preset Strategies
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Ready-to-use strategies with proven configurations
            </p>
          </div>
        </div>
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

      {/* My saved strategies */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">My Strategies</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {loading ? "Loading..." : `${runnable.length} saved strategy${runnable.length !== 1 ? "ies" : "y"}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <div className="w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
            Loading strategies...
          </div>
        ) : runnable.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-matte)]/30 p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-1">No saved strategies yet</p>
            <p className="text-xs text-[var(--text-secondary)]/70">Create a custom strategy or save from the dice game</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runnable.map((s) => (
              <GlassCard key={s.id} className="group p-4 hover:border-[var(--accent-heart)]/30 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-[var(--text-primary)] truncate">{s.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-matte)] text-[var(--text-secondary)] border border-[var(--border)]">
                        {(s.config.progressionType as string) || "flat"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{configSummary(s.gameType, s.config)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRunSaved(s, 20)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete strategy"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      {/* Advanced Strategies Section */}
      <AdvancedStrategiesSection />
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

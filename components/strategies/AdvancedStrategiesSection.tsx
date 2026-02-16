"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AdvancedStrategyBuilder } from "./AdvancedStrategyBuilder";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

type AdvancedStrategyRow = {
  id: string;
  name: string;
  description?: string;
  baseConfig: {
    amount: number;
    target: number;
    condition: "over" | "under";
  };
  rules: AdvancedDiceStrategy["rules"];
  executionMode: string;
  createdAt: string;
};

export function AdvancedStrategiesSection() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<AdvancedStrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<AdvancedDiceStrategy | undefined>(undefined);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/advanced-strategies", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.data?.strategies)) {
        setStrategies(data.data.strategies);
      } else {
        setError(data.error ?? "Failed to load strategies");
      }
    } catch {
      setError("Failed to load strategies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleSave = async (strategy: AdvancedDiceStrategy) => {
    try {
      const url = strategy.id
        ? `/api/me/advanced-strategies/${strategy.id}`
        : "/api/me/advanced-strategies";
      const method = strategy.id ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(strategy),
      });

      const data = await res.json();
      if (data.success) {
        setBuilderOpen(false);
        setEditingStrategy(undefined);
        fetchStrategies();
      } else {
        setError(data.error ?? "Failed to save strategy");
      }
    } catch {
      setError("Failed to save strategy");
    }
  };

  const handleRun = (strategy: AdvancedDiceStrategy, maxRounds: number) => {
    setError(null);
    saveStrategyRunPayload({
      strategy: strategy,
      strategyName: strategy.name,
      maxRounds,
      isAdvanced: true,
    });
    router.push("/games/dice?run=advanced");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this advanced strategy?")) return;
    try {
      const res = await fetch(`/api/me/advanced-strategies/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
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

  const handleEdit = (strategy: AdvancedStrategyRow) => {
    setEditingStrategy({
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      baseConfig: strategy.baseConfig,
      rules: strategy.rules,
      executionMode: strategy.executionMode as any,
    });
    setBuilderOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreateNew = () => {
    setEditingStrategy(undefined);
    setBuilderOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section className="space-y-6">
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

      {/* Builder Section */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-matte)]/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Advanced Strategy Builder</h3>
                <p className="text-xs text-[var(--text-secondary)]">Create complex rule-based strategies</p>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-emerald-400/80">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                  <span>Strategies feed our data intelligence layer</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBuilderOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-violet-500/30 transition-colors"
            >
              {builderOpen ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                  Hide
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {editingStrategy ? "Editing Strategy" : "Open Builder"}
                </>
              )}
            </button>
          </div>
        </div>

        {builderOpen && (
          <div className="p-4">
            <AdvancedStrategyBuilder
              initialStrategy={editingStrategy}
              onSave={handleSave}
              onRun={handleRun}
              onCancel={() => {
                setBuilderOpen(false);
                setEditingStrategy(undefined);
              }}
            />
          </div>
        )}
      </div>

      {/* My Advanced Strategies */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">My Advanced Strategies</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {loading ? "Loading..." : `${strategies.length} saved strategy${strategies.length !== 1 ? "ies" : "y"}`}
            </p>
          </div>
          {!builderOpen && (
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-500 text-white hover:bg-violet-500/90 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            Loading strategies...
          </div>
        ) : strategies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-matte)]/30 p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-1">No advanced strategies yet</p>
            <p className="text-xs text-[var(--text-secondary)]/70">Create your first rule-based strategy</p>
          </div>
        ) : (
          <div className="space-y-3">
            {strategies.map((strategy) => (
              <div
                key={strategy.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-violet-500/30 transition-colors group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-[var(--text-primary)] truncate">{strategy.name}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/30">
                        {strategy.executionMode}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Bet {strategy.baseConfig.amount} @ {strategy.baseConfig.target}% {strategy.baseConfig.condition} ·{" "}
                      {strategy.rules.length} rule{strategy.rules.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRun(strategy as any, 50)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Run
                    </button>
                    <button
                      onClick={() => handleEdit(strategy)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors"
                      title="Edit strategy"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(strategy.id)}
                      className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete strategy"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/GlassCard";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import { AdvancedStrategiesSection, openAdvancedBuilderForEdit, type AdvancedStrategyRow } from "./AdvancedStrategiesSection";
import type { DiceProgressionType } from "@/lib/strategies";
import { DICE_PROGRESSION_TYPES } from "@/lib/strategies";

type StrategyRow = {
  id: string;
  gameType: string;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
};

type UnifiedStrategy =
  | { type: "simple"; data: StrategyRow }
  | { type: "advanced"; data: AdvancedStrategyRow };

const GAMES_WITH_RUN = ["dice"] as const;

function configSummary(_gameType: string, config: Record<string, unknown>): string {
  const amount = config.amount ?? "?";
  const target = config.target ?? "?";
  const cond = config.condition ?? "?";
  const prog = config.progressionType ?? "flat";
  return `Transaction ${amount} @ ${cond} ${target} (${prog})`;
}

function getConfigValues(config: Record<string, unknown>) {
  const amount = typeof config.amount === "number" ? config.amount : Number(config.amount) || 10;
  const target = typeof config.target === "number" ? config.target : Number(config.target) || 50;
  const condition = config.condition === "over" || config.condition === "under" ? config.condition : "over";
  const progressionType = (config.progressionType as string) || "flat";
  return {
    amount: Math.min(10000, Math.max(1, amount)),
    target: Math.min(99.99, Math.max(0, target)),
    condition: condition as "over" | "under",
    progressionType: DICE_PROGRESSION_TYPES.includes(progressionType as DiceProgressionType)
      ? (progressionType as DiceProgressionType)
      : "flat",
  };
}

function parseDate(d: unknown): number {
  if (typeof d === "string") return new Date(d).getTime();
  if (d && typeof d === "object" && "getTime" in (d as object)) return (d as Date).getTime();
  return 0;
}

export function StrategiesSection() {
  const router = useRouter();
  const [unified, setUnified] = useState<UnifiedStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<StrategyRow | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; amount: number; target: number; condition: "over" | "under"; progressionType: DiceProgressionType } | null>(null);

  const fetchIdRef = useRef(0);

  const fetchStrategies = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [simpleRes, advancedRes] = await Promise.all([
        fetch("/api/v1/me/strategies?gameType=dice", { credentials: "include" }),
        fetch("/api/v1/me/advanced-strategies", { credentials: "include" }),
      ]);
      if (fetchId !== fetchIdRef.current) return;
      const simpleData = await simpleRes.json().catch(() => ({}));
      const advancedData = await advancedRes.json().catch(() => ({}));

      const simple: UnifiedStrategy[] = (simpleRes.ok && simpleData.success && Array.isArray(simpleData.data?.strategies))
        ? simpleData.data.strategies
            .filter((s: StrategyRow) => (GAMES_WITH_RUN as readonly string[]).includes(s.gameType))
            .map((s: StrategyRow) => ({ type: "simple" as const, data: s }))
        : [];
      const advanced: UnifiedStrategy[] = (advancedRes.ok && advancedData.success && Array.isArray(advancedData.data?.strategies))
        ? advancedData.data.strategies.map((s: AdvancedStrategyRow) => ({ type: "advanced" as const, data: s }))
        : [];

      const merged = [...simple, ...advanced].sort((a, b) => {
        const timeA = a.type === "simple" ? parseDate(a.data.createdAt) : parseDate(a.data.createdAt);
        const timeB = b.type === "simple" ? parseDate(b.data.createdAt) : parseDate(b.data.createdAt);
        return timeB - timeA;
      });
      setUnified(merged);
      if (!simpleRes.ok && !advancedRes.ok) setError(simpleData.error ?? advancedData.error ?? "Failed to load strategies");
      else setError(null);
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

  useEffect(() => {
    const onUpdated = () => fetchStrategies();
    window.addEventListener("advanced-strategies-updated", onUpdated);
    return () => window.removeEventListener("advanced-strategies-updated", onUpdated);
  }, [fetchStrategies]);

  const handleRunSimple = useCallback(
    (s: StrategyRow, maxRounds = 20) => {
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

  const handleRunAdvanced = useCallback(
    (s: AdvancedStrategyRow, maxRounds = 50) => {
      setError(null);
      saveStrategyRunPayload({
        strategy: {
          id: s.id,
          name: s.name,
          description: s.description,
          baseConfig: s.baseConfig,
          rules: s.rules ?? [],
          executionMode: (s.executionMode as any) ?? "sequential",
        },
        strategyName: s.name,
        maxRounds,
        isAdvanced: true,
      });
      router.push("/games/dice?run=advanced");
    },
    [router]
  );

  const handleDelete = async (item: UnifiedStrategy) => {
    const id = item.type === "simple" ? item.data.id : item.data.id;
    const label = item.type === "simple" ? "strategy" : "advanced strategy";
    if (!confirm(`Delete this ${label}?`)) return;
    try {
      const url = item.type === "simple"
        ? `/api/v1/me/strategies/${id}`
        : `/api/v1/me/advanced-strategies/${id}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setUnified((prev) => prev.filter((u) => (u.type === "simple" ? u.data.id : u.data.id) !== id));
      } else {
        setError(data.error ?? "Delete failed");
      }
    } catch {
      setError("Delete failed");
    }
  };

  const handleEdit = useCallback((s: StrategyRow) => {
    const vals = getConfigValues(s.config);
    setEditing(s);
    setEditForm({
      name: s.name,
      amount: vals.amount,
      target: vals.target,
      condition: vals.condition,
      progressionType: vals.progressionType,
    });
  }, []);

  const closeEditModal = useCallback(() => {
    setEditing(null);
    setEditForm(null);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const onEscape = (e: KeyboardEvent) => e.key === "Escape" && closeEditModal();
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [editing, closeEditModal]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    if (!editing || !editForm) return;
    e.preventDefault();
    const name = editForm.name.trim();
    if (!name) {
      setError("Strategy name is required");
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/v1/me/strategies/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          config: {
            amount: editForm.amount,
            target: editForm.target,
            condition: editForm.condition,
            progressionType: editForm.progressionType,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUnified((prev) =>
          prev.map((u) =>
            u.type === "simple" && u.data.id === editing.id
              ? {
                  ...u,
                  data: {
                    ...u.data,
                    name,
                    config: {
                      ...u.data.config,
                      amount: editForm!.amount,
                      target: editForm!.target,
                      condition: editForm!.condition,
                      progressionType: editForm!.progressionType,
                    },
                  },
                }
              : u
          )
        );
        closeEditModal();
      } else {
        setError(data.error ?? data.message ?? "Update failed");
      }
    } catch {
      setError("Update failed");
    }
  };

  return (
    <section data-agent="strategies-section" className="space-y-8">
      {/* Advanced Strategy Builder â€” at top per UX preference */}
      <AdvancedStrategiesSection />

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

      {/* My saved strategies â€” unified simple + advanced */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">My Strategies</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {loading ? "Loading..." : `${unified.length} saved strategy${unified.length !== 1 ? "ies" : "y"}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
            <div className="w-4 h-4 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
            Loading strategies...
          </div>
        ) : unified.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-matte)]/30 p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-1">No saved strategies yet</p>
            <p className="text-xs text-[var(--text-secondary)]/70">Create via Advanced Builder above or save from the dice game</p>
          </div>
        ) : (
          <div className="space-y-3">
            {unified.map((item) => {
              if (item.type === "simple") {
                const s = item.data;
                return (
                  <GlassCard key={`s-${s.id}`} className="group p-4 hover:border-[var(--accent-heart)]/30 transition-colors">
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
                          onClick={() => handleRunSimple(s, 20)}
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
                          onClick={() => handleEdit(s)}
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors"
                          title="Edit strategy"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
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
                );
              }
              const adv = item.data;
              return (
                <GlassCard key={`a-${adv.id}`} className="group p-4 hover:border-violet-500/30 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-[var(--text-primary)] truncate">{adv.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/30">
                          Advanced Â· {adv.executionMode}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Transaction {adv.baseConfig.amount} @ {adv.baseConfig.target}% {adv.baseConfig.condition} Â·{" "}
                        {adv.rules?.length ?? 0} rule{(adv.rules?.length ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRunAdvanced(adv, 50)}
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
                        onClick={() => openAdvancedBuilderForEdit(adv)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded-lg transition-colors"
                        title="Edit strategy"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
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
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Strategy Modal */}
      {editing && editForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm min-h-screen min-w-full"
          style={{ top: 0, left: 0, right: 0, bottom: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-strategy-title"
          onClick={(e) => e.target === e.currentTarget && closeEditModal()}
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 id="edit-strategy-title" className="text-lg font-semibold text-[var(--text-primary)]">
                Edit Strategy
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Strategy name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : null))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50"
                  placeholder="My Strategy"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-amount" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Amount
                  </label>
                  <input
                    id="edit-amount"
                    type="number"
                    min={1}
                    max={10000}
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, amount: Math.min(10000, Math.max(1, Number(e.target.value) || 1)) } : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50"
                  />
                </div>
                <div>
                  <label htmlFor="edit-target" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                    Target %
                  </label>
                  <input
                    id="edit-target"
                    type="number"
                    min={0}
                    max={99.99}
                    step={0.01}
                    value={editForm.target}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, target: Math.min(99.99, Math.max(0, Number(e.target.value) || 0)) } : null
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-condition" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Condition
                </label>
                <select
                  id="edit-condition"
                  value={editForm.condition}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, condition: e.target.value as "over" | "under" } : null))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50"
                >
                  <option value="over">Over</option>
                  <option value="under">Under</option>
                </select>
              </div>
              <div>
                <label htmlFor="edit-progression" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Progression
                </label>
                <select
                  id="edit-progression"
                  value={editForm.progressionType}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, progressionType: e.target.value as DiceProgressionType } : null
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-heart)]/50"
                >
                  {DICE_PROGRESSION_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt.charAt(0).toUpperCase() + pt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent-heart)] text-white font-medium hover:opacity-90 transition-opacity"
                >
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}




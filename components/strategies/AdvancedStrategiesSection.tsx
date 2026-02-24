"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdvancedStrategyBuilder } from "./AdvancedStrategyBuilder";
import { saveStrategyRunPayload } from "@/lib/strategy-run-payload";
import type { AdvancedDiceStrategy } from "@/lib/advanced-strategy-types";

export const ADVANCED_STRATEGY_EDIT_EVENT = "xpersona-advanced-strategy-edit";

export type AdvancedStrategyRow = {
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

export function openAdvancedBuilderForEdit(strategy: AdvancedStrategyRow) {
  window.dispatchEvent(
    new CustomEvent(ADVANCED_STRATEGY_EDIT_EVENT, { detail: strategy })
  );
}

export function AdvancedStrategiesSection() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<AdvancedDiceStrategy | undefined>(undefined);

  useEffect(() => {
    const handler = (e: CustomEvent<AdvancedStrategyRow>) => {
      const s = e.detail;
      if (!s?.id) return;
      setEditingStrategy({
        id: s.id,
        name: s.name,
        description: s.description,
        baseConfig: s.baseConfig,
        rules: s.rules ?? [],
        executionMode: (s.executionMode as AdvancedDiceStrategy["executionMode"]) ?? "sequential",
      });
      setBuilderOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener(ADVANCED_STRATEGY_EDIT_EVENT, handler as EventListener);
    return () => window.removeEventListener(ADVANCED_STRATEGY_EDIT_EVENT, handler as EventListener);
  }, []);

  const handleSave = async (strategy: AdvancedDiceStrategy) => {
    try {
      const url = strategy.id
        ? `/api/v1/me/advanced-strategies/${strategy.id}`
        : "/api/v1/me/advanced-strategies";
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
        window.dispatchEvent(new Event("advanced-strategies-updated"));
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
    </section>
  );
}




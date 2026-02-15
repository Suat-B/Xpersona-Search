"use client";

import { useState, useCallback } from "react";
import { RuleCard } from "./RuleCard";
import { STRATEGY_PRESETS, type AdvancedDiceStrategy, type StrategyRule, type ExecutionMode } from "@/lib/advanced-strategy-types";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";

interface CompactAdvancedStrategyBuilderProps {
  onRun: (strategy: AdvancedDiceStrategy, maxRounds: number) => void;
  onApply?: (strategy: AdvancedDiceStrategy) => void;
}

export function CompactAdvancedStrategyBuilder({
  onRun,
  onApply,
}: CompactAdvancedStrategyBuilderProps) {
  const [strategy, setStrategy] = useState<AdvancedDiceStrategy>({
    name: "Quick Strategy",
    baseConfig: { amount: 10, target: 50, condition: "over" },
    rules: [],
    executionMode: "sequential",
  });

  const [showJson, setShowJson] = useState(false);
  const [simulationResult, setSimulationResult] = useState<ReturnType<typeof simulateStrategy> | null>(null);
  const [maxRounds, setMaxRounds] = useState(50);

  // Rule management
  const addRule = useCallback(() => {
    const newRule: StrategyRule = {
      id: Math.random().toString(36).substr(2, 9),
      order: strategy.rules.length,
      enabled: true,
      trigger: { type: "loss", value: 1 },
      action: { type: "double_bet" },
    };
    setStrategy((s) => ({ ...s, rules: [...s.rules, newRule] }));
  }, [strategy.rules.length]);

  const updateRule = useCallback((updatedRule: StrategyRule) => {
    setStrategy((s) => ({
      ...s,
      rules: s.rules.map((r) => (r.id === updatedRule.id ? updatedRule : r)),
    }));
  }, []);

  const deleteRule = useCallback((ruleId: string) => {
    setStrategy((s) => ({
      ...s,
      rules: s.rules.filter((r) => r.id !== ruleId).map((r, i) => ({ ...r, order: i })),
    }));
  }, []);

  const moveRule = useCallback((index: number, direction: "up" | "down") => {
    setStrategy((s) => {
      const newRules = [...s.rules];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newRules.length) return s;

      [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
      return {
        ...s,
        rules: newRules.map((r, i) => ({ ...r, order: i })),
      };
    });
  }, []);

  const loadPreset = useCallback((presetId: string) => {
    const preset = STRATEGY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setStrategy({
        ...preset.strategy,
        id: undefined,
        userId: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      });
    }
  }, []);

  const runSimulation = useCallback(() => {
    const result = simulateStrategy(strategy, 1000, 100, DICE_HOUSE_EDGE);
    setSimulationResult(result);
  }, [strategy]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-sm font-medium text-violet-400">AI Strategy Builder</span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Create rule-based strategies with unlimited conditions and actions. Perfect for AI and advanced users.
        </p>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-2">Quick Presets</label>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_PRESETS.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              onClick={() => loadPreset(preset.id)}
              className="px-2 py-1 text-[10px] rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-violet-500/50 transition-colors"
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Base Config */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Bet</label>
          <input
            type="number"
            min={1}
            value={strategy.baseConfig.amount}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                baseConfig: { ...strategy.baseConfig, amount: parseInt(e.target.value) || 1 },
              })
            }
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Target</label>
          <input
            type="number"
            min={0}
            max={99}
            value={strategy.baseConfig.target}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                baseConfig: { ...strategy.baseConfig, target: parseInt(e.target.value) || 0 },
              })
            }
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Condition</label>
          <select
            value={strategy.baseConfig.condition}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                baseConfig: { ...strategy.baseConfig, condition: e.target.value as "over" | "under" },
              })
            }
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <option value="over">Over</option>
            <option value="under">Under</option>
          </select>
        </div>
      </div>

      {/* Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-[var(--text-secondary)]">Rules ({strategy.rules.length})</label>
          <button
            onClick={addRule}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-violet-500/50 text-violet-400 hover:bg-violet-500/10 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {strategy.rules.length === 0 ? (
            <div className="text-center py-4 border border-dashed border-[var(--border)] rounded-lg">
              <p className="text-xs text-[var(--text-secondary)]">No rules yet</p>
              <p className="text-[10px] text-[var(--text-secondary)]/70">Add rules to automate your strategy</p>
            </div>
          ) : (
            strategy.rules
              .sort((a, b) => a.order - b.order)
              .map((rule, index) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onUpdate={updateRule}
                  onDelete={() => deleteRule(rule.id)}
                  onMoveUp={() => moveRule(index, "up")}
                  onMoveDown={() => moveRule(index, "down")}
                  isFirst={index === 0}
                  isLast={index === strategy.rules.length - 1}
                />
              ))
          )}
        </div>
      </div>

      {/* Execution Mode */}
      <div className="flex gap-2">
        {(["sequential", "all_matching"] as ExecutionMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setStrategy({ ...strategy, executionMode: mode })}
            className={`flex-1 px-2 py-1.5 text-[10px] rounded border transition-colors ${
              strategy.executionMode === mode
                ? "border-violet-500 bg-violet-500/10 text-violet-400"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {mode === "sequential" ? "Sequential" : "All Matching"}
          </button>
        ))}
      </div>

      {/* Simulation */}
      {simulationResult && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--text-primary)]">Simulation Results</span>
            <button
              onClick={() => setSimulationResult(null)}
              className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Hide
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-[var(--text-secondary)]">Final</p>
              <p className={`text-sm font-bold ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {Number(simulationResult.finalBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-secondary)]">Profit</p>
              <p className={`text-sm font-bold ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {simulationResult.profit >= 0 ? "+" : ""}
                {Number(simulationResult.profit).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-secondary)]">Win Rate</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {simulationResult.roundHistory.length > 0
                  ? ((simulationResult.totalWins / simulationResult.roundHistory.length) * 100).toFixed(1)
                  : "0"}
                %
              </p>
            </div>
          </div>
        </div>
      )}

      {/* JSON Editor Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowJson(!showJson)}
          className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
        >
          {showJson ? "Hide JSON" : "Edit as JSON (AI Mode)"}
        </button>
        <button
          onClick={runSimulation}
          className="text-[10px] text-violet-400 hover:text-violet-300 underline"
        >
          Test Simulation
        </button>
      </div>

      {showJson && (
        <textarea
          value={JSON.stringify(strategy, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setStrategy(parsed);
            } catch {
              // Invalid JSON, ignore
            }
          }}
          className="w-full h-32 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-[10px] font-mono text-[var(--text-primary)] resize-none"
          spellCheck={false}
        />
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
        <div className="flex-1">
          <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Rounds</label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxRounds}
            onChange={(e) => setMaxRounds(parseInt(e.target.value) || 50)}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
          />
        </div>
        {onApply && (
          <button
            onClick={() => onApply(strategy)}
            className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Apply
          </button>
        )}
        <button
          onClick={() => onRun(strategy, maxRounds)}
          className="flex-1 px-3 py-1.5 rounded bg-violet-500 text-white text-xs font-medium hover:bg-violet-500/90 transition-colors"
        >
          Run Strategy
        </button>
      </div>

      {/* AI Hint */}
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-matte)]/50 p-3">
        <div className="flex items-start gap-2">
          <svg className="w-4 h-4 text-[var(--accent-heart)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">AI:</strong> Use the JSON editor to programmatically create strategies. 
              All 38+ trigger types and 25+ action types are supported. 
              Strategies execute client-side with real-time rule evaluation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { RuleCard } from "./RuleCard";
import { STRATEGY_PRESETS, type AdvancedDiceStrategy, type StrategyRule, type ExecutionMode } from "@/lib/advanced-strategy-types";
import { simulateStrategy } from "@/lib/dice-rule-engine";
import { DICE_HOUSE_EDGE } from "@/lib/constants";

interface AdvancedStrategyBuilderProps {
  initialStrategy?: AdvancedDiceStrategy;
  onSave: (strategy: AdvancedDiceStrategy) => void;
  onRun: (strategy: AdvancedDiceStrategy, maxRounds: number) => void;
  onCancel?: () => void;
}

export function AdvancedStrategyBuilder({
  initialStrategy,
  onSave,
  onRun,
  onCancel,
}: AdvancedStrategyBuilderProps) {
  const [strategy, setStrategy] = useState<AdvancedDiceStrategy>(
    initialStrategy || {
      name: "New Strategy",
      baseConfig: { amount: 10, target: 50, condition: "over" },
      rules: [],
      executionMode: "sequential",
    }
  );

  const [activeTab, setActiveTab] = useState<"builder" | "json" | "simulate">("builder");
  const [simulationResult, setSimulationResult] = useState<ReturnType<typeof simulateStrategy> | null>(null);
  const [simulationRounds, setSimulationRounds] = useState(100);
  const [simulationBalance, setSimulationBalance] = useState(1000);

  // Rule management
  const addRule = useCallback(() => {
    const newRule: StrategyRule = {
      id: Math.random().toString(36).substr(2, 9),
      order: strategy.rules.length,
      enabled: true,
      trigger: { type: "win", value: 1 },
      action: { type: "reset_bet" },
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

  // Load preset
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

  // Run simulation
  const runSimulation = useCallback(() => {
    const result = simulateStrategy(strategy, simulationBalance, simulationRounds, DICE_HOUSE_EDGE);
    setSimulationResult(result);
  }, [strategy, simulationBalance, simulationRounds]);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden" data-agent="advanced-strategy-builder">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-matte)]/50">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Advanced Strategy Builder</h3>
            <p className="text-xs text-[var(--text-secondary)]">Create complex dice strategies with unlimited rules</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("builder")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                activeTab === "builder"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Builder
            </button>
            <button
              onClick={() => setActiveTab("json")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                activeTab === "json"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setActiveTab("simulate")}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                activeTab === "simulate"
                  ? "bg-white/10 text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Simulate
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === "builder" && (
          <BuilderTab
            strategy={strategy}
            setStrategy={setStrategy}
            rules={strategy.rules}
            onAddRule={addRule}
            onUpdateRule={updateRule}
            onDeleteRule={deleteRule}
            onMoveRule={moveRule}
            onLoadPreset={loadPreset}
          />
        )}

        {activeTab === "json" && (
          <JsonTab strategy={strategy} onStrategyChange={setStrategy} />
        )}

        {activeTab === "simulate" && (
          <SimulateTab
            strategy={strategy}
            simulationRounds={simulationRounds}
            simulationBalance={simulationBalance}
            onRoundsChange={setSimulationRounds}
            onBalanceChange={setSimulationBalance}
            onRunSimulation={runSimulation}
            simulationResult={simulationResult}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-matte)]/30">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRun(strategy, 100)}
              className="px-4 py-2 text-sm font-medium rounded bg-green-500/20 text-green-400 border border-green-500/50 hover:bg-green-500/30 transition-colors"
            >
              Quick Run (100)
            </button>
            <button
              onClick={() => onSave(strategy)}
              className="px-4 py-2 text-sm font-medium rounded bg-[var(--accent-heart)] text-white hover:bg-[var(--accent-heart)]/90 transition-colors"
            >
              Save Strategy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Builder Tab Component
interface BuilderTabProps {
  strategy: AdvancedDiceStrategy;
  setStrategy: (s: AdvancedDiceStrategy) => void;
  rules: StrategyRule[];
  onAddRule: () => void;
  onUpdateRule: (rule: StrategyRule) => void;
  onDeleteRule: (id: string) => void;
  onMoveRule: (index: number, direction: "up" | "down") => void;
  onLoadPreset: (id: string) => void;
}

function BuilderTab({
  strategy,
  setStrategy,
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  onMoveRule,
  onLoadPreset,
}: BuilderTabProps) {
  return (
    <div className="space-y-6">
      {/* Strategy Name */}
      <div>
        <label className="block text-sm text-[var(--text-secondary)] mb-1">Strategy Name</label>
        <input
          type="text"
          value={strategy.name}
          onChange={(e) => setStrategy({ ...strategy, name: e.target.value })}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          placeholder="Enter strategy name..."
        />
      </div>

      {/* Base Configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)]/50">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Base Bet</label>
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
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Target</label>
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
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Condition</label>
          <select
            value={strategy.baseConfig.condition}
            onChange={(e) =>
              setStrategy({
                ...strategy,
                baseConfig: { ...strategy.baseConfig, condition: e.target.value as "over" | "under" },
              })
            }
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)]"
          >
            <option value="over">Over</option>
            <option value="under">Under</option>
          </select>
        </div>
      </div>

      {/* Execution Mode */}
      <div>
        <label className="block text-sm text-[var(--text-secondary)] mb-2">Execution Mode</label>
        <div className="flex gap-2">
          {(["sequential", "all_matching"] as ExecutionMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setStrategy({ ...strategy, executionMode: mode })}
              className={`px-3 py-2 text-sm rounded border transition-colors ${
                strategy.executionMode === mode
                  ? "border-[var(--accent-heart)] bg-[var(--accent-heart)]/10 text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {mode === "sequential" ? "Sequential (First Match)" : "All Matching"}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          {strategy.executionMode === "sequential"
            ? "Only the first matching rule will execute per round"
            : "All matching rules will execute in order per round"}
        </p>
      </div>

      {/* Presets */}
      <div>
        <label className="block text-sm text-[var(--text-secondary)] mb-2">Load Preset</label>
        <div className="flex flex-wrap gap-2">
          {STRATEGY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onLoadPreset(preset.id)}
              className="px-3 py-1.5 text-xs rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-colors"
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm text-[var(--text-secondary)]">Rules</label>
          <span className="text-xs text-[var(--text-secondary)]">
            {rules.filter((r) => r.enabled).length} active / {rules.length} total
          </span>
        </div>

        {rules.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--text-secondary)]">No rules yet</p>
            <p className="text-xs text-[var(--text-secondary)]/70 mt-1">Add rules to define your strategy</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules
              .sort((a, b) => a.order - b.order)
              .map((rule, index) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onUpdate={onUpdateRule}
                  onDelete={() => onDeleteRule(rule.id)}
                  onMoveUp={() => onMoveRule(index, "up")}
                  onMoveDown={() => onMoveRule(index, "down")}
                  isFirst={index === 0}
                  isLast={index === rules.length - 1}
                />
              ))}
          </div>
        )}

        <button
          onClick={onAddRule}
          className="w-full mt-3 py-3 rounded-lg border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-heart)]/50 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Rule
        </button>
      </div>
    </div>
  );
}

// JSON Tab Component
interface JsonTabProps {
  strategy: AdvancedDiceStrategy;
  onStrategyChange: (s: AdvancedDiceStrategy) => void;
}

function JsonTab({ strategy, onStrategyChange }: JsonTabProps) {
  const [jsonValue, setJsonValue] = useState(JSON.stringify(strategy, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      onStrategyChange(parsed);
      setError(null);
    } catch (e) {
      setError("Invalid JSON");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonValue);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Edit the strategy as JSON. Perfect for AI and advanced users.
        </p>
        <button
          onClick={copyToClipboard}
          className="px-3 py-1.5 text-xs rounded border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Copy to Clipboard
        </button>
      </div>

      <textarea
        value={jsonValue}
        onChange={(e) => handleJsonChange(e.target.value)}
        className="w-full h-96 rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] resize-none"
        spellCheck={false}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
        <p className="text-xs text-[var(--text-secondary)] mb-2">
          <strong className="text-[var(--text-primary)]">Tip:</strong> AI can create strategies by generating
          this JSON format programmatically.
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Available trigger types: win, loss, streak_win, profit_above, balance_below, and 30+ more.
        </p>
      </div>
    </div>
  );
}

// Simulate Tab Component
interface SimulateTabProps {
  strategy: AdvancedDiceStrategy;
  simulationRounds: number;
  simulationBalance: number;
  onRoundsChange: (n: number) => void;
  onBalanceChange: (n: number) => void;
  onRunSimulation: () => void;
  simulationResult: ReturnType<typeof simulateStrategy> | null;
}

function SimulateTab({
  strategy,
  simulationRounds,
  simulationBalance,
  onRoundsChange,
  onBalanceChange,
  onRunSimulation,
  simulationResult,
}: SimulateTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Starting Balance</label>
          <input
            type="number"
            min={1}
            value={simulationBalance}
            onChange={(e) => onBalanceChange(parseInt(e.target.value) || 1000)}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Rounds to Simulate</label>
          <input
            type="number"
            min={1}
            max={10000}
            value={simulationRounds}
            onChange={(e) => onRoundsChange(parseInt(e.target.value) || 100)}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-matte)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
      </div>

      <button
        onClick={onRunSimulation}
        className="w-full py-3 rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/50 hover:bg-violet-500/30 transition-colors font-medium"
      >
        Run Simulation
      </button>

      {simulationResult && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">Final Balance</p>
              <p
                className={`text-lg font-semibold ${
                  simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {simulationResult.finalBalance.toFixed(0)}
              </p>
            </div>
            <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">Profit/Loss</p>
              <p
                className={`text-lg font-semibold ${
                  simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {simulationResult.profit >= 0 ? "+" : ""}
                {simulationResult.profit.toFixed(0)}
              </p>
            </div>
            <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">Win Rate</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {simulationResult.roundHistory.length > 0
                  ? ((simulationResult.totalWins / simulationResult.roundHistory.length) * 100).toFixed(1)
                  : "0"}
                %
              </p>
            </div>
            <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
              <p className="text-xs text-[var(--text-secondary)]">Rounds</p>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {simulationResult.roundHistory.length}
              </p>
            </div>
          </div>

          {/* Stop Reason */}
          {simulationResult.shouldStop && simulationResult.stopReason && (
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-400">
                <strong>Stopped:</strong> {simulationResult.stopReason}
              </p>
            </div>
          )}

          {/* Balance Range */}
          <div className="p-3 rounded bg-[var(--bg-matte)] border border-[var(--border)]">
            <p className="text-xs text-[var(--text-secondary)] mb-2">Balance Range</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">Low: {simulationResult.minBalance.toFixed(0)}</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--bg-card)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 via-yellow-400 to-emerald-400"
                  style={{
                    width: `${
                      ((simulationResult.finalBalance - simulationResult.minBalance) /
                        (simulationResult.maxBalance - simulationResult.minBalance || 1)) *
                      100
                    }%`,
                  }}
                />
              </div>
              <span className="text-sm text-emerald-400">High: {simulationResult.maxBalance.toFixed(0)}</span>
            </div>
          </div>

          {/* Recent Rounds */}
          <div>
            <p className="text-sm text-[var(--text-secondary)] mb-2">Recent Rounds</p>
            <div className="max-h-48 overflow-y-auto rounded border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-matte)] sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">#</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Bet</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Roll</th>
                    <th className="px-2 py-1 text-left text-[var(--text-secondary)]">Result</th>
                    <th className="px-2 py-1 text-right text-[var(--text-secondary)]">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.roundHistory.slice(-20).map((round) => (
                    <tr key={round.round} className="border-t border-[var(--border)]">
                      <td className="px-2 py-1 text-[var(--text-secondary)]">{round.round}</td>
                      <td className="px-2 py-1 text-[var(--text-primary)]">{round.bet}</td>
                      <td className="px-2 py-1 text-[var(--text-primary)]">{round.roll}</td>
                      <td className="px-2 py-1">
                        <span className={round.win ? "text-emerald-400" : "text-red-400"}>
                          {round.win ? "Win" : "Loss"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right text-[var(--text-primary)]">
                        {round.balance.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

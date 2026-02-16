"use client";

import { useState, useCallback, useMemo } from "react";

// Types for AI-friendly strategy building
interface RuleCondition {
  metric: 'win_streak' | 'loss_streak' | 'current_pnl' | 'total_trades' | 'win_rate' | 'balance_pct' | 'consecutive_wins' | 'consecutive_losses';
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
}

interface RuleAction {
  type: 'multiply_bet' | 'add_to_bet' | 'reset_bet' | 'stop_trading' | 'switch_direction' | 'set_bet';
  parameter: number;
}

interface StrategyRule {
  id: string;
  condition: RuleCondition;
  action: RuleAction;
  priority: number;
  enabled: boolean;
}

interface StrategyConfig {
  name: string;
  description: string;
  initialBet: number;
  maxBet: number;
  stopLoss: number;
  takeProfit: number;
  maxConsecutiveLosses: number;
  rules: StrategyRule[];
}

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  config: StrategyConfig;
}

const strategyTemplates: StrategyTemplate[] = [
  {
    id: 'martingale',
    name: 'Martingale',
    description: 'Double bet after loss, reset after win',
    config: {
      name: 'Martingale Strategy',
      description: 'Classic Martingale progression system',
      initialBet: 10,
      maxBet: 1000,
      stopLoss: 50,
      takeProfit: 100,
      maxConsecutiveLosses: 10,
      rules: [
        {
          id: '1',
          condition: { metric: 'loss_streak', operator: '>', value: 0 },
          action: { type: 'multiply_bet', parameter: 2 },
          priority: 1,
          enabled: true,
        },
        {
          id: '2',
          condition: { metric: 'win_streak', operator: '>', value: 0 },
          action: { type: 'reset_bet', parameter: 0 },
          priority: 2,
          enabled: true,
        },
      ],
    },
  },
  {
    id: 'anti_martingale',
    name: 'Anti-Martingale',
    description: 'Increase bet after win, reset after loss',
    config: {
      name: 'Anti-Martingale Strategy',
      description: 'Ride winning streaks',
      initialBet: 10,
      maxBet: 500,
      stopLoss: 50,
      takeProfit: 100,
      maxConsecutiveLosses: 5,
      rules: [
        {
          id: '1',
          condition: { metric: 'win_streak', operator: '>=', value: 1 },
          action: { type: 'multiply_bet', parameter: 1.5 },
          priority: 1,
          enabled: true,
        },
        {
          id: '2',
          condition: { metric: 'loss_streak', operator: '>', value: 0 },
          action: { type: 'reset_bet', parameter: 0 },
          priority: 2,
          enabled: true,
        },
      ],
    },
  },
  {
    id: 'kelly',
    name: 'Kelly Criterion',
    description: 'Optimal bet sizing based on edge',
    config: {
      name: 'Kelly Criterion',
      description: 'Mathematically optimal bet sizing',
      initialBet: 10,
      maxBet: 100,
      stopLoss: 30,
      takeProfit: 50,
      maxConsecutiveLosses: 5,
      rules: [
        {
          id: '1',
          condition: { metric: 'total_trades', operator: '>=', value: 10 },
          action: { type: 'set_bet', parameter: 0 }, // Calculated dynamically
          priority: 1,
          enabled: true,
        },
      ],
    },
  },
  {
    id: 'trend_following',
    name: 'Trend Following',
    description: 'Follow winning streaks',
    config: {
      name: 'Trend Following',
      description: 'Increase bets during winning streaks',
      initialBet: 10,
      maxBet: 200,
      stopLoss: 40,
      takeProfit: 80,
      maxConsecutiveLosses: 3,
      rules: [
        {
          id: '1',
          condition: { metric: 'win_streak', operator: '>=', value: 2 },
          action: { type: 'multiply_bet', parameter: 1.2 },
          priority: 1,
          enabled: true,
        },
        {
          id: '2',
          condition: { metric: 'loss_streak', operator: '>=', value: 2 },
          action: { type: 'reset_bet', parameter: 0 },
          priority: 2,
          enabled: true,
        },
      ],
    },
  },
];

const metricOptions = [
  { value: 'win_streak', label: 'Win Streak' },
  { value: 'loss_streak', label: 'Loss Streak' },
  { value: 'current_pnl', label: 'Current PnL' },
  { value: 'total_trades', label: 'Total Trades' },
  { value: 'win_rate', label: 'Win Rate %' },
  { value: 'balance_pct', label: 'Balance %' },
  { value: 'consecutive_wins', label: 'Consecutive Wins' },
  { value: 'consecutive_losses', label: 'Consecutive Losses' },
];

const operatorOptions = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
];

const actionOptions = [
  { value: 'multiply_bet', label: 'Multiply Bet by' },
  { value: 'add_to_bet', label: 'Add to Bet' },
  { value: 'reset_bet', label: 'Reset Bet to Initial' },
  { value: 'stop_trading', label: 'Stop Trading' },
  { value: 'switch_direction', label: 'Switch Direction' },
  { value: 'set_bet', label: 'Set Bet to' },
];

export function AdvancedStrategyBuilder() {
  const [activeTab, setActiveTab] = useState<'manual' | 'strategy'>('strategy');
  const [strategy, setStrategy] = useState<StrategyConfig>({
    name: 'My Strategy',
    description: 'Custom trading strategy',
    initialBet: 10,
    maxBet: 1000,
    stopLoss: 50,
    takeProfit: 100,
    maxConsecutiveLosses: 10,
    rules: [],
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);

  // Load template
  const loadTemplate = useCallback((templateId: string) => {
    const template = strategyTemplates.find((t) => t.id === templateId);
    if (template) {
      setStrategy(template.config);
      setSelectedTemplate(templateId);
    }
  }, []);

  // Add new rule
  const addRule = useCallback(() => {
    const newRule: StrategyRule = {
      id: Date.now().toString(),
      condition: { metric: 'win_streak', operator: '>', value: 0 },
      action: { type: 'multiply_bet', parameter: 2 },
      priority: strategy.rules.length + 1,
      enabled: true,
    };
    setStrategy((prev) => ({
      ...prev,
      rules: [...prev.rules, newRule],
    }));
  }, [strategy.rules.length]);

  // Update rule
  const updateRule = useCallback((ruleId: string, updates: Partial<StrategyRule>) => {
    setStrategy((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      ),
    }));
  }, []);

  // Remove rule
  const removeRule = useCallback((ruleId: string) => {
    setStrategy((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }));
  }, []);

  // Update strategy config
  const updateConfig = useCallback((updates: Partial<StrategyConfig>) => {
    setStrategy((prev) => ({ ...prev, ...updates }));
  }, []);

  // Generate JSON
  const strategyJson = useMemo(() => {
    return JSON.stringify(strategy, null, 2);
  }, [strategy]);

  // Copy JSON to clipboard
  const copyJson = useCallback(() => {
    navigator.clipboard.writeText(strategyJson);
  }, [strategyJson]);

  // Run backtest
  const runBacktest = useCallback(async () => {
    setIsBacktesting(true);
    // Simulate backtest
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setBacktestResults({
      winRate: 52.3,
      profit: 125.5,
      maxDrawdown: -45.2,
      sharpe: 1.34,
      totalTrades: 1000,
    });
    setIsBacktesting(false);
  }, []);

  if (activeTab === 'manual') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('manual')}
              className="px-3 py-1.5 text-[11px] rounded bg-[var(--quant-accent)] text-black font-bold"
            >
              MANUAL
            </button>
            <button
              onClick={() => setActiveTab('strategy')}
              className="px-3 py-1.5 text-[11px] rounded bg-[var(--quant-bg-card)] text-[var(--quant-neutral)] hover:text-white transition-colors"
            >
              STRATEGY
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-[var(--quant-neutral)]">
          <div className="text-center">
            <p className="text-sm">Switch to Strategy tab to build automated strategies</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between mb-4 px-4 pt-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('manual')}
            className="px-3 py-1.5 text-[11px] rounded bg-[var(--quant-bg-card)] text-[var(--quant-neutral)] hover:text-white transition-colors"
          >
            MANUAL
          </button>
          <button
            onClick={() => setActiveTab('strategy')}
            className="px-3 py-1.5 text-[11px] rounded bg-[var(--quant-accent)] text-black font-bold"
          >
            STRATEGY
          </button>
        </div>
        
        {/* Template Selector */}
        <select
          value={selectedTemplate}
          onChange={(e) => loadTemplate(e.target.value)}
          className="quant-input text-[11px] py-1 px-2 w-40"
        >
          <option value="">Load Template...</option>
          {strategyTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Strategy Configuration */}
      <div className="px-4 pb-4 space-y-4">
        {/* Basic Info */}
        <div className="space-y-2">
          <input
            type="text"
            value={strategy.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            className="quant-input w-full text-sm font-bold"
            placeholder="Strategy Name"
          />
          <input
            type="text"
            value={strategy.description}
            onChange={(e) => updateConfig({ description: e.target.value })}
            className="quant-input w-full text-xs"
            placeholder="Description"
          />
        </div>

        {/* Base Parameters Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-[var(--quant-neutral)] uppercase">Initial Bet</label>
            <input
              type="number"
              value={strategy.initialBet}
              onChange={(e) => updateConfig({ initialBet: parseInt(e.target.value) || 10 })}
              className="quant-input w-full mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--quant-neutral)] uppercase">Max Bet</label>
            <input
              type="number"
              value={strategy.maxBet}
              onChange={(e) => updateConfig({ maxBet: parseInt(e.target.value) || 1000 })}
              className="quant-input w-full mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--quant-neutral)] uppercase">Stop Loss %</label>
            <input
              type="number"
              value={strategy.stopLoss}
              onChange={(e) => updateConfig({ stopLoss: parseInt(e.target.value) || 50 })}
              className="quant-input w-full mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--quant-neutral)] uppercase">Take Profit %</label>
            <input
              type="number"
              value={strategy.takeProfit}
              onChange={(e) => updateConfig({ takeProfit: parseInt(e.target.value) || 100 })}
              className="quant-input w-full mt-1"
            />
          </div>
        </div>

        {/* Rules Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase text-[var(--quant-neutral)]">Rules</span>
            <button
              onClick={addRule}
              className="text-[10px] px-2 py-1 rounded bg-[var(--quant-accent)] text-black font-bold hover:opacity-80 transition-opacity"
            >
              + Add Rule
            </button>
          </div>

          <div className="space-y-2">
            {strategy.rules.length === 0 && (
              <p className="text-[11px] text-[var(--quant-neutral)] text-center py-4">
                No rules yet. Click &quot;Add Rule&quot; to create your strategy.
              </p>
            )}
            
            {strategy.rules.map((rule) => (
              <div
                key={rule.id}
                className="bg-[var(--quant-bg-card)] border border-[var(--quant-border)] rounded p-3 space-y-2"
              >
                {/* Condition */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--quant-neutral)] w-16">IF</span>
                  <select
                    value={rule.condition.metric}
                    onChange={(e) =>
                      updateRule(rule.id, {
                        condition: { ...rule.condition, metric: e.target.value as any },
                      })
                    }
                    className="quant-input text-[10px] py-1 px-2 flex-1"
                  >
                    {metricOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.condition.operator}
                    onChange={(e) =>
                      updateRule(rule.id, {
                        condition: { ...rule.condition, operator: e.target.value as any },
                      })
                    }
                    className="quant-input text-[10px] py-1 px-2 w-16"
                  >
                    {operatorOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={rule.condition.value}
                    onChange={(e) =>
                      updateRule(rule.id, {
                        condition: { ...rule.condition, value: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="quant-input text-[10px] py-1 px-2 w-20"
                  />
                </div>

                {/* Action */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--quant-neutral)] w-16">THEN</span>
                  <select
                    value={rule.action.type}
                    onChange={(e) =>
                      updateRule(rule.id, {
                        action: { ...rule.action, type: e.target.value as any },
                      })
                    }
                    className="quant-input text-[10px] py-1 px-2 flex-1"
                  >
                    {actionOptions.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  {rule.action.type !== 'reset_bet' && rule.action.type !== 'stop_trading' && (
                    <input
                      type="number"
                      value={rule.action.parameter}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          action: { ...rule.action, parameter: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="quant-input text-[10px] py-1 px-2 w-20"
                    />
                  )}
                </div>

                {/* Priority & Remove */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[9px] text-[var(--quant-neutral)]">
                    Priority: {rule.priority}
                  </span>
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="text-[9px] text-bearish hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Interface - JSON Preview */}
        <div className="border border-[var(--quant-border)] rounded overflow-hidden">
          <button
            onClick={() => setShowJsonPreview(!showJsonPreview)}
            className="w-full px-3 py-2 bg-[var(--quant-bg-card)] flex items-center justify-between text-[11px] font-bold"
          >
            <span>📋 JSON Preview (AI Interface)</span>
            <span>{showJsonPreview ? '▼' : '▶'}</span>
          </button>
          {showJsonPreview && (
            <div className="relative">
              <pre className="p-3 text-[9px] font-mono bg-[#080808] text-[var(--quant-text-primary)] overflow-auto max-h-48">
                {strategyJson}
              </pre>
              <button
                onClick={copyJson}
                className="absolute top-2 right-2 px-2 py-1 text-[9px] bg-[var(--quant-accent)] text-black rounded hover:opacity-80 transition-opacity"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {/* Backtest & Deploy */}
        <div className="space-y-2 pt-2">
          <button
            onClick={runBacktest}
            disabled={isBacktesting}
            className="w-full py-2 rounded bg-[var(--quant-bg-card)] border border-[var(--quant-border)] text-[11px] font-bold hover:bg-[var(--quant-bg-hover)] transition-colors disabled:opacity-50"
          >
            {isBacktesting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Backtesting...
              </span>
            ) : (
              '▶ Run Backtest (1000 rounds)'
            )}
          </button>

          {backtestResults && (
            <div className="grid grid-cols-4 gap-2 p-2 bg-[var(--quant-bg-card)] rounded border border-[var(--quant-border)]">
              <div className="text-center">
                <div className="text-[9px] text-[var(--quant-neutral)]">Win Rate</div>
                <div className="text-[11px] font-bold text-accent">{backtestResults.winRate}%</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-[var(--quant-neutral)]">Profit</div>
                <div className={`text-[11px] font-bold ${backtestResults.profit >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                  {backtestResults.profit >= 0 ? '+' : ''}{backtestResults.profit}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-[var(--quant-neutral)]">Max DD</div>
                <div className="text-[11px] font-bold text-bearish">{backtestResults.maxDrawdown}%</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-[var(--quant-neutral)]">Sharpe</div>
                <div className="text-[11px] font-bold">{backtestResults.sharpe}</div>
              </div>
            </div>
          )}

          <button className="w-full py-2 rounded bg-[var(--quant-accent)] text-black text-[11px] font-bold hover:opacity-80 transition-opacity flex items-center justify-center gap-2">
            <span>🚀</span>
            Deploy to Live Trading
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdvancedStrategyBuilder;

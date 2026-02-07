"use client";

/**
 * Python Strategy Editor & Executor
 * Full IDE for writing and running Python strategies
 */

import { useState, useEffect, useCallback } from "react";
import { useStrategyRuntime } from "@/lib/python-runtime";
import { StrategyExecutionEngine, ExecutionSession, StopConditions } from "@/lib/strategy-engine";
import { createClientBetExecutor } from "@/lib/strategy-engine-client";
import { StrategyRunningBanner } from "@/components/strategies/StrategyRunningBanner";

const ACTIVE_STRATEGY_KEY = "xpersona_active_strategy_run";

function syncStrategyRunState(active: boolean, name?: string) {
  if (typeof window === "undefined") return;
  if (active && name) {
    try {
      sessionStorage.setItem(ACTIVE_STRATEGY_KEY, JSON.stringify({ name, startedAt: Date.now() }));
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("strategy-run-state", { detail: { active: true, name } }));
  } else {
    try {
      sessionStorage.removeItem(ACTIVE_STRATEGY_KEY);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("strategy-run-state", { detail: { active: false } }));
  }
}

// Sample strategies
const SAMPLE_STRATEGIES = {
  martingale: `class Strategy:
    """
    Classic Martingale Strategy
    Double bet after each loss, reset after win
    """
    
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.max_bet = config.get('max_bet', 1000)
        self.current_bet = self.base_bet
        self.consecutive_losses = 0
        
    def on_round_start(self, ctx):
        balance = ctx.get_balance()
        
        # Stop if can't afford next bet
        if self.current_bet > balance:
            return BetDecision.stop("insufficient_balance")
        
        return BetDecision(
            amount=self.current_bet,
            target=50,
            condition="over"
        )
    
    def on_round_complete(self, ctx, result):
        if result.win:
            # Reset on win
            self.current_bet = self.base_bet
            self.consecutive_losses = 0
        else:
            # Double on loss
            self.consecutive_losses += 1
            self.current_bet = min(
                self.current_bet * 2,
                self.max_bet,
                ctx.get_balance()
            )
    
    def should_stop(self, ctx):
        # Stop after 5 consecutive losses
        return self.consecutive_losses >= 5`,

  conservative: `class Strategy:
    """
    Conservative Low-Risk Strategy
    Small bets on high probability outcomes
    """
    
    def __init__(self, config):
        self.bet_amount = config.get('bet_amount', 5)
        self.target = 66  # 33% win rate, 3x multiplier
        self.condition = "under"
        self.rounds_played = 0
        
    def on_round_start(self, ctx):
        self.rounds_played += 1
        
        return BetDecision(
            amount=self.bet_amount,
            target=self.target,
            condition=self.condition
        )
    
    def on_round_complete(self, ctx, result):
        pass
    
    def should_stop(self, ctx):
        # Stop after 100 rounds
        return self.rounds_played >= 100`,

  adaptive: `class Strategy:
    """
    Adaptive Strategy with Pattern Detection
    Adjusts based on recent performance
    """
    
    def __init__(self, config):
        self.base_bet = config.get('base_bet', 10)
        self.current_bet = self.base_bet
        self.results_history = []
        self.target = 50
        self.condition = "over"
        
    def on_round_start(self, ctx):
        history = ctx.get_history(10)
        
        # Analyze recent trend
        if len(history) >= 5:
            recent_wins = sum(1 for r in history[-5:] if r['win'])
            
            # Increase bet on hot streak
            if recent_wins >= 4:
                self.current_bet = min(self.base_bet * 2, ctx.get_balance() * 0.1)
                ctx.notify("Hot streak detected! Increasing bet.")
            # Decrease on cold streak
            elif recent_wins <= 1:
                self.current_bet = self.base_bet
        
        return BetDecision(
            amount=self.current_bet,
            target=self.target,
            condition=self.condition
        )
    
    def on_round_complete(self, ctx, result):
        self.results_history.append(result.win)
    
    def should_stop(self, ctx):
        # Dynamic stop based on performance
        if len(self.results_history) >= 20:
            win_rate = sum(self.results_history[-20:]) / 20
            if win_rate < 0.4:
                return True
        return False`
};

interface StrategyEditorProps {
  userId: string;
  strategyId?: string;
  strategyName?: string;
  initialCode?: string;
  onStrategyRun?: (session: ExecutionSession) => void;
}

export function PythonStrategyEditor({ userId, strategyId, strategyName, initialCode, onStrategyRun }: StrategyEditorProps) {
  const { runtime, isLoading: runtimeLoading, error: runtimeError } = useStrategyRuntime();
  const [code, setCode] = useState(initialCode ?? SAMPLE_STRATEGIES.martingale);
  const [output, setOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);
  const [activeSession, setActiveSession] = useState<ExecutionSession | null>(null);
  const [engine, setEngine] = useState<StrategyExecutionEngine | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "output">("editor");
  const [strategyLoaded, setStrategyLoaded] = useState(false);

  // Load saved strategy by id
  useEffect(() => {
    if (!strategyId) {
      setStrategyLoaded(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/me/strategies/${strategyId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && data.data?.python_code) {
          setCode(data.data.python_code);
        }
        setStrategyLoaded(true);
      })
      .catch(() => setStrategyLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [strategyId]);

  // Initialize engine when runtime is ready (with client bet executor for real bets)
  useEffect(() => {
    if (runtime) {
      const betExecutor = createClientBetExecutor();
      setEngine(new StrategyExecutionEngine(runtime, betExecutor));
    }
  }, [runtime]);

  // Validate code on change (debounced)
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (runtime) {
        const result = await runtime.loadStrategy(code);
        setValidationResult({ valid: result.valid, error: result.error });
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [code, runtime]);

  // Add log message
  const addLog = useCallback((message: string) => {
    setOutput(prev => [...prev.slice(-99), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Run strategy (real bets via client executor; live balance)
  const runStrategy = async () => {
    if (!engine) return;

    setIsExecuting(true);
    setOutput([]);
    setActiveTab("output");
    addLog("Starting strategy execution (real dice bets)...");

    try {
      let initialBalance = 1000;
      try {
        const balanceRes = await fetch("/api/me/balance", { credentials: "include" });
        const balanceData = await balanceRes.json();
        if (balanceData.success && typeof balanceData.data?.balance === "number") {
          initialBalance = balanceData.data.balance;
          addLog(`Using live balance: ${initialBalance}`);
        }
      } catch {
        addLog("Using default initial balance: 1000");
      }

      const stopConditions: StopConditions = {
        maxRounds: 50,
        maxLossPercentage: 20,
        targetProfitPercentage: 50,
        consecutiveLosses: 5,
        maxTimeSeconds: 300,
      };

      const session = await engine.startSession({
        strategyId: strategyId ?? "editor-session",
        userId,
        initialBalance,
        stopConditions,
        speedMs: 100,
        pythonCode: code,
      });

      setActiveSession(session);
      addLog(`Session started: ${session.id}`);

      if (onStrategyRun) {
        onStrategyRun(session);
      }

      const interval = setInterval(() => {
        const updated = engine.getSession(session.id);
        if (updated) {
          setActiveSession(updated);

          if (updated.status !== "running") {
            clearInterval(interval);
            setIsExecuting(false);
            addLog(`Session ${updated.status}: ${updated.stopReason || updated.error || "completed"}`);
            addLog(`Final PnL: ${updated.sessionPnl}`);
            addLog(`Rounds played: ${updated.currentRound}`);
            window.dispatchEvent(new Event("balance-updated"));
          } else {
            const lastResult = updated.results[updated.results.length - 1];
            if (lastResult) {
              addLog(
                `Round ${lastResult.round}: ${lastResult.win ? "WIN" : "LOSS"} ${lastResult.result.toFixed(2)} | Bet: ${lastResult.betAmount} | Payout: ${lastResult.payout} | Balance: ${lastResult.balance}`
              );
            }
          }
        }
      }, 200);
    } catch (error) {
      addLog(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setIsExecuting(false);
      syncStrategyRunState(false);
    }
  };

  // Stop strategy
  const stopStrategy = () => {
    if (engine && activeSession) {
      engine.stopSession(activeSession.id, "manual_stop");
      syncStrategyRunState(false);
      addLog("Manual stop requested");
    }
  };

  // Load sample strategy
  const loadSample = (name: keyof typeof SAMPLE_STRATEGIES) => {
    setCode(SAMPLE_STRATEGIES[name]);
    setOutput([]);
  };

  if (runtimeLoading) {
    return (
      <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[var(--accent-heart)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading Python Runtime...</p>
        </div>
      </div>
    );
  }

  if (runtimeError) {
    return (
      <div className="w-full rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
        Failed to load Python runtime: {runtimeError}
      </div>
    );
  }

  const displayName = strategyName ?? "Your strategy";
  const winRatePercent = activeSession?.results?.length
    ? (activeSession.results.filter((r) => r.win).length / activeSession.results.length) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Dice-themed running banner when session is active */}
      {activeSession && (
        <StrategyRunningBanner
          strategyName={displayName}
          status={activeSession.status}
          currentRound={activeSession.currentRound}
          sessionPnl={activeSession.sessionPnl}
          currentBalance={activeSession.currentBalance}
          initialBalance={activeSession.initialBalance}
          winRatePercent={winRatePercent}
          onStop={activeSession.status === "running" ? stopStrategy : undefined}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐍</span>
          <h2 className="text-lg font-bold">Python Strategy Editor</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            validationResult?.valid 
              ? "bg-emerald-500/20 text-emerald-400" 
              : "bg-red-500/20 text-red-400"
          }`}>
            {validationResult?.valid ? "✓ Valid" : "✗ Invalid"}
          </span>
        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        Fully custom: any class with <code className="bg-white/10 px-1 rounded">on_round_start(ctx)</code> works for dice. OpenClaw uses the same contract.
      </p>

      {/* Sample Strategy Buttons */}
      <div className="flex gap-2">
        <button 
          onClick={() => loadSample('martingale')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] hover:bg-white/5 transition-colors"
        >
          Load Martingale
        </button>
        <button 
          onClick={() => loadSample('conservative')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] hover:bg-white/5 transition-colors"
        >
          Load Conservative
        </button>
        <button 
          onClick={() => loadSample('adaptive')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] hover:bg-white/5 transition-colors"
        >
          Load Adaptive
        </button>
      </div>

      {validationResult?.error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          {validationResult.error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-matte)] border border-[var(--border)]">
        <button
          onClick={() => setActiveTab("editor")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "editor" 
              ? "bg-[var(--bg-card)] text-[var(--text-primary)]" 
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab("output")}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "output" 
              ? "bg-[var(--bg-card)] text-[var(--text-primary)]" 
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Output
        </button>
      </div>

      {activeTab === "editor" ? (
        <div className="space-y-4">
          {/* Code Editor */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-96 p-4 font-mono text-sm bg-[var(--bg-matte)] text-[var(--text-primary)] border-0 resize-none focus:outline-none focus:ring-0"
              spellCheck={false}
              placeholder="Write your Python strategy here..."
              disabled={isExecuting}
            />
          </div>

          {/* Execution Controls */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--text-secondary)]">
              {activeSession?.status === "running" ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="font-mono">{displayName}</span> · Round {activeSession.currentRound} | PnL: {activeSession.sessionPnl >= 0 ? "+" : ""}{activeSession.sessionPnl}
                </span>
              ) : (
                <span>Ready to execute</span>
              )}
            </div>
            <div className="flex gap-2">
              {activeSession?.status === "running" ? (
                <button 
                  onClick={stopStrategy}
                  disabled={!isExecuting}
                  className="px-6 py-2 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button 
                  onClick={runStrategy}
                  disabled={!validationResult?.valid || isExecuting || !engine}
                  className="px-6 py-2 rounded-xl font-bold text-white bg-[var(--accent-heart)] hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {isExecuting ? "Running..." : "Run Strategy"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Output Log */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-medium">Execution Log</h3>
            </div>
            <div className="p-4">
              <div className="h-64 overflow-y-auto space-y-1 font-mono text-xs">
                {output.length === 0 ? (
                  <p className="text-[var(--text-secondary)] italic">
                    No output yet. Run a strategy to see results.
                  </p>
                ) : (
                  output.map((line, idx) => (
                    <div key={idx} className="text-[var(--text-primary)]">
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Session summary when stopped (banner above already shows live stats when running) */}
          {activeSession && activeSession.status !== "running" && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">Session ended</p>
              <p className="text-sm font-mono text-[var(--text-primary)]">
                Final PnL: <span className={activeSession.sessionPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {activeSession.sessionPnl >= 0 ? "+" : ""}{activeSession.sessionPnl}
                </span>
                {" "}· Rounds: {activeSession.currentRound} · {activeSession.stopReason ?? activeSession.error ?? "completed"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PythonStrategyEditor;

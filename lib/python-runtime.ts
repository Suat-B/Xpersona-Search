"use client";

/**
 * Pyodide Python Runtime for Strategy Execution
 * Browser-based Python execution with casino API bridge
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MAX_PYTHON_CODE_LENGTH } from "./strategy-python-validation";

// Pyodide instance type
interface PyodideInstance {
  runPython: (code: string) => any;
  runPythonAsync: (code: string) => Promise<any>;
  loadPackage: (packageName: string) => Promise<void>;
  setStdout: (callback: (text: string) => void) => void;
  setStderr: (callback: (text: string) => void) => void;
  isPyProxy: (obj: any) => boolean;
  pyimport: (name: string) => any;
  globals: {
    set: (name: string, value: any) => void;
    get: (name: string) => any;
  };
  FS: {
    writeFile: (path: string, data: string | Uint8Array) => void;
    readFile: (path: string) => string | Uint8Array;
    mkdir: (path: string) => void;
  };
}

// Load Pyodide from CDN
let pyodideInstance: PyodideInstance | null = null;
let pyodideLoadingPromise: Promise<PyodideInstance> | null = null;

export async function loadPyodideRuntime(): Promise<PyodideInstance> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (pyodideLoadingPromise) {
    return pyodideLoadingPromise;
  }

  pyodideLoadingPromise = (async () => {
    try {
      // Load Pyodide from CDN (avoid bundling node-only deps from npm "pyodide")
      const indexURL = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
      if (typeof window !== "undefined") {
        const w = window as unknown as { loadPyodide?: (opts: { indexURL: string; stdout?: (t: string) => void; stderr?: (t: string) => void }) => Promise<unknown> };
        if (!w.loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `${indexURL}pyodide.js`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Pyodide script"));
            document.head.appendChild(script);
          });
        }
        const loadPyodide = (window as unknown as { loadPyodide: (opts: { indexURL: string; stdout?: (t: string) => void; stderr?: (t: string) => void }) => Promise<unknown> }).loadPyodide;
        console.log("Loading Pyodide...");
        const pyodide = await loadPyodide({
          indexURL,
          stdout: (text: string) => console.log("[Python]", text),
          stderr: (text: string) => console.error("[Python Error]", text),
        });
        console.log("Pyodide loaded successfully!");
        await (pyodide as PyodideInstance).loadPackage("numpy");
        console.log("NumPy loaded!");
        pyodideInstance = pyodide as PyodideInstance;
        return pyodideInstance;
      }
      throw new Error("Pyodide is only supported in the browser");
    } catch (error) {
      console.error("Failed to load Pyodide:", error);
      throw error;
    }
  })();

  return pyodideLoadingPromise;
}

// React hook for Pyodide
export function usePyodide() {
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const instance = await loadPyodideRuntime();
        if (mounted) {
          setPyodide(instance);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load Pyodide");
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return { pyodide, isLoading, error };
}

// Strategy runtime class
export class StrategyRuntime {
  private pyodide: PyodideInstance;
  private strategyModule: any = null;
  private executionLog: string[] = [];

  constructor(pyodide: PyodideInstance) {
    this.pyodide = pyodide;
  }

  // Initialize the casino SDK in Python
  async initializeCasinoSDK(): Promise<void> {
    const sdkCode = `
import json
import sys
from typing import Dict, Any, Optional, Callable

class BetDecision:
    """Decision to place a bet"""
    def __init__(self, amount: float, target: float, condition: str):
        self.amount = amount
        self.target = target
        self.condition = condition
        self.action = "bet"
    
    def to_dict(self):
        return {
            "action": "bet",
            "amount": self.amount,
            "target": self.target,
            "condition": self.condition
        }
    
    @classmethod
    def stop(cls, reason: str = "manual"):
        """Create a stop decision"""
        decision = cls(0, 0, "over")
        decision.action = "stop"
        decision.reason = reason
        return decision

class RoundResult:
    """Result of a dice round"""
    def __init__(self, result: float, win: bool, payout: float, balance: float):
        self.result = result
        self.win = win
        self.payout = payout
        self.balance = balance

class StrategyContext:
    """Context for strategy execution with bridge to JavaScript"""
    
    def __init__(self, bridge=None):
        self._bridge = bridge
        self._history = []
        self._round_count = 0
    
    def get_balance(self) -> float:
        """Get current balance"""
        if self._bridge:
            return self._bridge.get_balance()
        return 1000.0
    
    def get_history(self, n: int = 50) -> list:
        """Get last n round results"""
        if self._bridge:
            return self._bridge.get_history(n)
        return []
    
    def notify(self, message: str):
        """Send notification"""
        if self._bridge:
            self._bridge.notify(message)
        print(f"[NOTIFY] {message}")
    
    def calculate_odds(self, target: float, condition: str) -> dict:
        """Calculate theoretical odds"""
        if self._bridge:
            return self._bridge.calculate_odds(target, condition)
        return {"win_probability": 50.0, "multiplier": 2.0}
    
    @property
    def round_number(self) -> int:
        """Current round index (1-based)."""
        if self._bridge and hasattr(self._bridge, 'get_round_number') and callable(getattr(self._bridge, 'get_round_number')):
            return self._bridge.get_round_number()
        return self._round_count
    
    @property
    def initial_balance(self) -> float:
        """Starting balance for this session."""
        if self._bridge and hasattr(self._bridge, 'get_initial_balance') and callable(getattr(self._bridge, 'get_initial_balance')):
            return self._bridge.get_initial_balance()
        return 1000.0
    
    @property
    def session_pnl(self) -> float:
        """Session profit/loss so far."""
        if self._bridge and hasattr(self._bridge, 'get_session_pnl') and callable(getattr(self._bridge, 'get_session_pnl')):
            return self._bridge.get_session_pnl()
        return 0.0
    
    def get_limits(self) -> dict:
        """Dice game limits: min_bet, max_bet, house_edge, target_min, target_max."""
        if self._bridge and hasattr(self._bridge, 'get_limits') and callable(getattr(self._bridge, 'get_limits')):
            return self._bridge.get_limits()
        return {"min_bet": 1, "max_bet": 10000, "house_edge": 0.03, "target_min": 0, "target_max": 99.99}
    
    def last_result(self):
        """Last round result (result, win, payout, bet_amount) or None."""
        if self._bridge and hasattr(self._bridge, 'get_last_result') and callable(getattr(self._bridge, 'get_last_result')):
            return self._bridge.get_last_result()
        return None
    
    @property
    def round_count(self) -> int:
        return self._round_count
    
    def _increment_round(self):
        self._round_count += 1

class BaseStrategy:
    """Base class for all strategies"""
    
    name = "BaseStrategy"
    description = "Base strategy class"
    version = "1.0.0"
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.initialized = False
    
    def initialize(self, ctx: StrategyContext):
        """Called once before first round"""
        self.initialized = True
    
    def on_round_start(self, ctx: StrategyContext) -> BetDecision:
        """
        Called before each round to decide bet.
        Must return a BetDecision.
        """
        raise NotImplementedError("Strategy must implement on_round_start")
    
    def on_round_complete(self, ctx: StrategyContext, result: RoundResult):
        """Called after each round with result"""
        pass
    
    def should_stop(self, ctx: StrategyContext) -> bool:
        """Return True to stop execution"""
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Return strategy statistics"""
        return {
            "name": self.name,
            "initialized": self.initialized
        }

# Export for use
__all__ = ['BetDecision', 'RoundResult', 'StrategyContext', 'BaseStrategy']
`;

    await this.pyodide.runPythonAsync(sdkCode);
    console.log("Casino SDK initialized in Python!");
  }

  // Load and validate a strategy
  async loadStrategy(pythonCode: string): Promise<{ valid: boolean; error?: string; strategyClass?: any }> {
    try {
      // Pre-validation
      const validation = this.validateCode(pythonCode);
      if (!validation.valid) {
        return { valid: false, error: validation.error };
      }

      // Wrap the code in a module
      const wrappedCode = `
${pythonCode}

# Get the Strategy class (should be defined in the code above)
_strategy_class = None
for name in dir():
    obj = eval(name)
    if isinstance(obj, type) and name not in ['BetDecision', 'RoundResult', 'StrategyContext', 'BaseStrategy']:
        if hasattr(obj, 'on_round_start'):
            _strategy_class = obj
            break

if _strategy_class is None:
    raise Exception("No Strategy class found. Define a class with on_round_start method.")

_strategy_class
`;

      const strategyClass = await this.pyodide.runPythonAsync(wrappedCode);
      
      return { valid: true, strategyClass };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  // Execute a strategy for one round
  async executeRound(
    strategyCode: string,
    bridge: CasinoBridge,
    state: any = null
  ): Promise<ExecutionResult> {
    try {
      // Set up bridge; pass state as JSON so Python gets a real dict (JsProxy has no .get())
      this.pyodide.globals.set("js_bridge", bridge);
      this.pyodide.globals.set("strategy_state_json", state != null ? JSON.stringify(state) : "null");

      const executionCode = `
import json
import inspect

# Load strategy
${strategyCode}

# Parse state from JSON so we have a real dict (not JsProxy)
strategy_state = json.loads(strategy_state_json) if strategy_state_json and strategy_state_json != "null" else None

# Find strategy class
strategy_class = None
for name in dir():
    obj = eval(name)
    if isinstance(obj, type) and name not in ['BetDecision', 'RoundResult', 'StrategyContext', 'BaseStrategy', 'json']:
        if hasattr(obj, 'on_round_start'):
            strategy_class = obj
            break

if strategy_class is None:
    raise Exception("Strategy class not found")

# Create context
ctx = StrategyContext(js_bridge)

# Config for instantiation (restore from state or empty)
_config = strategy_state.get('config', {}) if strategy_state else {}

# Instantiate: support both Strategy() and Strategy(config)
try:
    _sig = inspect.signature(strategy_class.__init__)
    _params = [p for p in _sig.parameters if p != 'self']
    if not _params:
        strategy = strategy_class()
    else:
        strategy = strategy_class(_config)
except Exception:
    strategy = strategy_class(_config)

if strategy_state:
    for key, value in strategy_state.items():
        if key != 'config':
            setattr(strategy, key, value)
elif hasattr(strategy, 'initialize') and callable(getattr(strategy, 'initialize')):
    strategy.initialize(ctx)

# Get decision
decision = strategy.on_round_start(ctx)

# Serialize result
_should_stop = strategy.should_stop(ctx) if hasattr(strategy, 'should_stop') and callable(getattr(strategy, 'should_stop')) else False
_stats = strategy.get_stats() if hasattr(strategy, 'get_stats') and callable(getattr(strategy, 'get_stats')) else {}
result = {
    "decision": decision.to_dict() if hasattr(decision, 'to_dict') else {"action": "stop"},
    "should_stop": _should_stop,
    "stats": _stats,
    "state": {
        "config": getattr(strategy, 'config', {}),
        **{k: v for k, v in strategy.__dict__.items() if not k.startswith('_')}
    }
}

json.dumps(result)
`;

      const resultJson = await this.pyodide.runPythonAsync(executionCode);
      const result = JSON.parse(resultJson);

      return {
        success: true,
        decision: result.decision,
        shouldStop: result.should_stop,
        stats: result.stats,
        state: result.state
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Call strategy.on_round_complete(ctx, round_result) and return updated state.
   * Called by the engine after each settled bet.
   */
  async executeRoundComplete(
    strategyCode: string,
    bridge: CasinoBridge,
    state: Record<string, unknown> | null,
    roundResult: RoundResultPayload
  ): Promise<{ success: boolean; state?: Record<string, unknown>; error?: string }> {
    try {
      this.pyodide.globals.set("js_bridge", bridge);
      this.pyodide.globals.set("strategy_state_json", state != null ? JSON.stringify(state) : "null");
      this.pyodide.globals.set("_round_result_result", roundResult.result);
      this.pyodide.globals.set("_round_result_win", roundResult.win);
      this.pyodide.globals.set("_round_result_payout", roundResult.payout);
      this.pyodide.globals.set("_round_result_balance", roundResult.balance);

      const executionCode = `
import json
import inspect

# Load strategy
${strategyCode}

# Parse state from JSON so we have a real dict (not JsProxy)
strategy_state = json.loads(strategy_state_json) if strategy_state_json and strategy_state_json != "null" else None

# Find strategy class
strategy_class = None
for name in dir():
    obj = eval(name)
    if isinstance(obj, type) and name not in ['BetDecision', 'RoundResult', 'StrategyContext', 'BaseStrategy', 'json']:
        if hasattr(obj, 'on_round_start'):
            strategy_class = obj
            break

if strategy_class is None:
    raise Exception("Strategy class not found")

ctx = StrategyContext(js_bridge)

_config = strategy_state.get('config', {}) if strategy_state else {}
try:
    _sig = inspect.signature(strategy_class.__init__)
    _params = [p for p in _sig.parameters if p != 'self']
    if not _params:
        strategy = strategy_class()
    else:
        strategy = strategy_class(_config)
except Exception:
    strategy = strategy_class(_config)

if strategy_state:
    for key, value in strategy_state.items():
        if key != 'config':
            setattr(strategy, key, value)

round_result = RoundResult(_round_result_result, _round_result_win, _round_result_payout, _round_result_balance)
if hasattr(strategy, 'on_round_complete') and callable(getattr(strategy, 'on_round_complete')):
    strategy.on_round_complete(ctx, round_result)

new_state = {
    "config": getattr(strategy, 'config', {}),
    **{k: v for k, v in strategy.__dict__.items() if not k.startswith('_')}
}
json.dumps(new_state)
`;

      const resultJson = await this.pyodide.runPythonAsync(executionCode);
      const newState = JSON.parse(resultJson) as Record<string, unknown>;
      return { success: true, state: newState };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[StrategyRuntime] on_round_complete error:", message);
      return { success: false, state: state ?? undefined, error: message };
    }
  }

  // Validate Python code for security
  private validateCode(code: string): { valid: boolean; error?: string } {
    // Check for dangerous imports
    const dangerousPatterns = [
      /import\s+os/,
      /import\s+sys/,
      /import\s+subprocess/,
      /import\s+socket/,
      /import\s+requests/,
      /import\s+urllib/,
      /__import__/,
      /eval\s*\(/,
      /exec\s*\(/,
      /compile\s*\(/,
      /open\s*\(/,
      /file\s*\(/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return { 
          valid: false, 
          error: `Security violation: Code contains forbidden pattern ${pattern}` 
        };
      }
    }

    // Check code length (align with strategy-python-validation)
    if (code.length > MAX_PYTHON_CODE_LENGTH) {
      return { valid: false, error: `Code exceeds maximum length (${MAX_PYTHON_CODE_LENGTH} characters)` };
    }

    // Check for required method
    if (!code.includes("on_round_start")) {
      return { valid: false, error: "Strategy must implement 'on_round_start' method" };
    }

    return { valid: true };
  }

  // Get execution log
  getLog(): string[] {
    return [...this.executionLog];
  }
}

// Bridge interface for JavaScript -> Python communication
export interface DiceLimits {
  min_bet: number;
  max_bet: number;
  house_edge: number;
  target_min: number;
  target_max: number;
}

export interface LastResult {
  result: number;
  win: boolean;
  payout: number;
  bet_amount: number;
}

export interface CasinoBridge {
  get_balance: () => number;
  get_history: (n: number) => any[];
  place_bet: (amount: number, target: number, condition: string) => Promise<any>;
  notify: (message: string) => void;
  calculate_odds: (target: number, condition: string) => any;
  get_round_number?: () => number;
  get_initial_balance?: () => number;
  get_session_pnl?: () => number;
  get_limits?: () => DiceLimits;
  get_last_result?: () => LastResult | null;
}

// Round result payload for on_round_complete callback
export interface RoundResultPayload {
  result: number;
  win: boolean;
  payout: number;
  balance: number;
}

// Execution result interface
export interface ExecutionResult {
  success: boolean;
  decision?: {
    action: string;
    amount: number;
    target: number;
    condition: string;
    reason?: string;
  };
  shouldStop?: boolean;
  stats?: any;
  state?: any;
  error?: string;
}

// React hook for strategy runtime
export function useStrategyRuntime() {
  const { pyodide, isLoading, error } = usePyodide();
  const [runtime, setRuntime] = useState<StrategyRuntime | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (pyodide && !runtime) {
      const rt = new StrategyRuntime(pyodide);
      rt.initializeCasinoSDK().then(() => {
        setRuntime(rt);
        setIsInitialized(true);
      });
    }
  }, [pyodide, runtime]);

  return {
    runtime,
    isLoading: isLoading || !isInitialized,
    error,
    pyodide
  };
}

export default StrategyRuntime;

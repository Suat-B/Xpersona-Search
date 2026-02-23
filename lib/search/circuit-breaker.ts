/**
 * Circuit breaker for search database operations.
 *
 * States:
 *   CLOSED  -> Normal operation, requests pass through
 *   OPEN    -> Failures exceeded threshold, all requests short-circuit to fallback
 *   HALF_OPEN -> After recovery timeout, allow a single probe request
 *
 * Configuration:
 *   - failureThreshold: 5 consecutive failures to open the circuit
 *   - failureWindowMs: 60 seconds window for counting failures
 *   - recoveryTimeoutMs: 30 seconds before transitioning from OPEN to HALF_OPEN
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  failureThreshold: number;
  failureWindowMs: number;
  recoveryTimeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 60_000,
  recoveryTimeoutMs: 30_000,
};

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number[] = [];
  private lastOpenedAt = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Current circuit state.
   */
  getState(): CircuitState {
    this.evaluateState();
    return this.state;
  }

  /**
   * Whether requests should be allowed through.
   */
  isAllowed(): boolean {
    this.evaluateState();
    if (this.state === "CLOSED") return true;
    if (this.state === "HALF_OPEN") return true;
    return false;
  }

  /**
   * Record a successful operation. Resets the circuit to CLOSED.
   */
  recordSuccess(): void {
    this.failures = [];
    this.state = "CLOSED";
  }

  /**
   * Record a failed operation. May trip the circuit to OPEN.
   */
  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Prune failures outside the window
    const windowStart = now - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t >= windowStart);

    if (this.failures.length >= this.config.failureThreshold) {
      this.state = "OPEN";
      this.lastOpenedAt = now;
      console.warn(
        `[CircuitBreaker] Circuit OPENED after ${this.failures.length} failures in ${this.config.failureWindowMs}ms`
      );
    }
  }

  /**
   * Execute an async operation with circuit breaker protection.
   * @param operation - The async operation to execute
   * @param fallback - Fallback value when circuit is open
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback: T
  ): Promise<{ result: T; fromFallback: boolean }> {
    if (!this.isAllowed()) {
      return { result: fallback, fromFallback: true };
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return { result, fromFallback: false };
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  /**
   * Reset the circuit breaker to initial state.
   */
  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.lastOpenedAt = 0;
  }

  private evaluateState(): void {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastOpenedAt;
      if (elapsed >= this.config.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
      }
    }
  }
}

// Singleton circuit breaker for search operations
export const searchCircuitBreaker = new CircuitBreaker();

// Separate circuit breaker for suggest/trending (lighter operations)
export const suggestCircuitBreaker = new CircuitBreaker({
  failureThreshold: 8,
  failureWindowMs: 60_000,
  recoveryTimeoutMs: 15_000,
});

export { CircuitBreaker };
export type { CircuitState, CircuitBreakerConfig };

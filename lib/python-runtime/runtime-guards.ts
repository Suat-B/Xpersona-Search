export interface RuntimeGuardOptions {
  executionTimeout: number;
  maxRecursionDepth: number;
  memoryLimit: number;
  maxIterations: number;
}

export interface GuardContext {
  strategyName: string;
  round: number;
  sessionId: string;
}

export class RuntimeGuards {
  private options: RuntimeGuardOptions;
  private timeoutController: AbortController | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private iterationCount: number = 0;
  private startTimestamp: number = 0;

  constructor(options: Partial<RuntimeGuardOptions> = {}) {
    this.options = {
      executionTimeout: options.executionTimeout ?? 10000,
      maxRecursionDepth: options.maxRecursionDepth ?? 100,
      memoryLimit: options.memoryLimit ?? 50 * 1024 * 1024,
      maxIterations: options.maxIterations ?? 10000
    };
  }

  async executeWithGuard<T>(
    fn: () => Promise<T>,
    context: GuardContext
  ): Promise<T> {
    this.resetIterationCounter();
    this.startTimestamp = Date.now();

    const result = await Promise.race([
      fn(),
      this.createTimeout(context)
    ]);

    this.clearTimeout();

    if (this.shouldAbort()) {
      throw new Error(`Execution aborted: ${this.getAbortReason(context)}`);
    }

    return result;
  }

  private createTimeout(context: GuardContext): Promise<never> {
    return new Promise((_, reject) => {
      this.timeoutController = new AbortController();
      
      this.timeoutTimer = setTimeout(() => {
        this.timeoutController?.abort();
        reject(new Error(`Execution timeout: strategy exceeded ${this.options.executionTimeout}ms`));
      }, this.options.executionTimeout);
    });
  }

  clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.timeoutController) {
      this.timeoutController.abort();
      this.timeoutController = null;
    }
  }

  shouldAbort(): boolean {
    return this.iterationCount >= this.options.maxIterations;
  }

  getAbortReason(context: GuardContext): string {
    if (this.iterationCount >= this.options.maxIterations) {
      return `Maximum iterations exceeded (${this.options.maxIterations})`;
    }
    
    const elapsed = Date.now() - this.startTimestamp;
    if (elapsed >= this.options.executionTimeout) {
      return `Execution timeout (${this.options.executionTimeout}ms)`;
    }
    
    return 'Unknown abort reason';
  }

  resetIterationCounter(): void {
    this.iterationCount = 0;
  }

  incrementIterations(): void {
    this.iterationCount++;
  }

  checkMemoryUsage(): { used: number; limit: number; ok: boolean; percentage: number } {
    const used = this.estimateMemoryUsage();
    const ok = used <= this.options.memoryLimit;
    const percentage = (used / this.options.memoryLimit) * 100;
    
    return {
      used,
      limit: this.options.memoryLimit,
      ok,
      percentage
    };
  }

  private estimateMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize || 0;
    }
    
    return 0;
  }

  checkRecursionDepth(depth: number): { ok: boolean; depth: number; maxDepth: number } {
    const ok = depth <= this.options.maxRecursionDepth;
    
    return {
      ok,
      depth,
      maxDepth: this.options.maxRecursionDepth
    };
  }

  getElapsedTime(): number {
    return Date.now() - this.startTimestamp;
  }

  getStats(): {
    iterations: number;
    elapsedTime: number;
    memory: { used: number; limit: number; ok: boolean; percentage: number };
    timeout: { elapsed: number; limit: number; remaining: number };
  } {
    return {
      iterations: this.iterationCount,
      elapsedTime: this.getElapsedTime(),
      memory: this.checkMemoryUsage(),
      timeout: {
        elapsed: this.getElapsedTime(),
        limit: this.options.executionTimeout,
        remaining: Math.max(0, this.options.executionTimeout - this.getElapsedTime())
      }
    };
  }

  updateOptions(options: Partial<RuntimeGuardOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): RuntimeGuardOptions {
    return { ...this.options };
  }

  abort(reason: string): void {
    this.clearTimeout();
    this.iterationCount = this.options.maxIterations;
    console.warn(`[RuntimeGuards] Execution aborted: ${reason}`);
  }
}

export default RuntimeGuards;

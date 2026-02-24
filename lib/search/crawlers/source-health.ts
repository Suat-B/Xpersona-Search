type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface SourceHealthState {
  source: string;
  state: BreakerState;
  failCount: number;
  openedAt?: number;
  cooldownMs: number;
  threshold: number;
}

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_THRESHOLD = 4;

const health = new Map<string, SourceHealthState>();

function getOrCreate(source: string): SourceHealthState {
  const existing = health.get(source);
  if (existing) return existing;
  const created: SourceHealthState = {
    source,
    state: "CLOSED",
    failCount: 0,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    threshold: DEFAULT_THRESHOLD,
  };
  health.set(source, created);
  return created;
}

export function canProceed(source: string): boolean {
  const s = getOrCreate(source);
  if (s.state === "CLOSED") return true;
  if (s.state === "HALF_OPEN") return true;
  const now = Date.now();
  const openedAt = s.openedAt ?? now;
  if (now - openedAt >= s.cooldownMs) {
    s.state = "HALF_OPEN";
    return true;
  }
  return false;
}

export function recordSuccess(source: string): void {
  const s = getOrCreate(source);
  s.state = "CLOSED";
  s.failCount = 0;
  s.openedAt = undefined;
}

export function recordFailure(source: string): void {
  const s = getOrCreate(source);
  s.failCount += 1;
  if (s.failCount >= s.threshold) {
    s.state = "OPEN";
    s.openedAt = Date.now();
  }
}

export function getSourceHealth(source: string): SourceHealthState {
  return { ...getOrCreate(source) };
}

export function resetSourceHealth(source?: string): void {
  if (!source) {
    health.clear();
    return;
  }
  health.delete(source);
}


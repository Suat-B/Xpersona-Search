export type CrawlMode = "hot" | "warm" | "backfill";

export interface CrawlRuntimeOptions {
  mode?: CrawlMode;
  githubBudget?: number;
  timeBudgetMs?: number;
  lockOwner?: string;
}

export function getCrawlMode(options?: CrawlRuntimeOptions): CrawlMode {
  return options?.mode ?? "backfill";
}

export function isHotOrWarm(options?: CrawlRuntimeOptions): boolean {
  const mode = getCrawlMode(options);
  return mode === "hot" || mode === "warm";
}


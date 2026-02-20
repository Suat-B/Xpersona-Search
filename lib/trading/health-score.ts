/**
 * Strategy Health Score: 0–100 composite from performance and track record.
 * Badge tiers: Healthy (70+), Moderate (40–69), Struggling (<40).
 */

export interface HealthScoreInput {
  sharpeRatio?: number | null;
  maxDrawdownPercent?: number | null;
  winRate?: number | null;
  paperTradingDays?: number | null;
  liveTrackRecordDays?: number | null;
  subscriberCount?: number | null;
}

export type HealthLabel = "healthy" | "moderate" | "struggling";

export interface HealthScoreResult {
  score: number;
  label: HealthLabel;
}

/**
 * Compute health score (0–100) from strategy metrics.
 * Weights: Sharpe 30, inverse DD 30, winRate 20, paper days 10, live days 10.
 */
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  let total = 0;

  // Sharpe: 0–2+ maps to 0–30 (negative = 0)
  const sharpe = input.sharpeRatio ?? 0;
  total += Math.min(30, Math.max(0, sharpe) * 15);

  // Max DD: 0–50% maps to 30–0 (lower DD = better)
  const dd = input.maxDrawdownPercent ?? 50;
  total += Math.max(0, 30 - (dd / 50) * 30);

  // Win rate: 40–70% maps to 0–20
  const win = input.winRate ?? 50;
  total += Math.min(20, Math.max(0, (win - 40) / 30) * 20);

  // Paper trading days: 0–90 maps to 0–10
  const paper = input.paperTradingDays ?? 0;
  total += Math.min(10, (paper / 90) * 10);

  // Live track record: 0–90 maps to 0–10
  const live = input.liveTrackRecordDays ?? 0;
  total += Math.min(10, (live / 90) * 10);

  const score = Math.round(Math.min(100, Math.max(0, total)));

  let label: HealthLabel = "struggling";
  if (score >= 70) label = "healthy";
  else if (score >= 40) label = "moderate";

  return { score, label };
}

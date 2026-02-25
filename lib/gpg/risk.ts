import type { AgentClusterStats, PlannerConstraints } from "./types";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function getBayesPriors() {
  const alpha = Number(process.env.GPG_BAYES_ALPHA ?? "3");
  const beta = Number(process.env.GPG_BAYES_BETA ?? "1");
  return {
    alpha: Number.isFinite(alpha) && alpha > 0 ? alpha : 3,
    beta: Number.isFinite(beta) && beta > 0 ? beta : 1,
  };
}

export function bayesianSuccess(successCount: number, totalCount: number): number {
  const { alpha, beta } = getBayesPriors();
  const success = Math.max(0, successCount);
  const total = Math.max(0, totalCount);
  if (total === 0) {
    return Number((alpha / (alpha + beta)).toFixed(4));
  }
  return Number(((success + alpha) / (total + alpha + beta)).toFixed(4));
}

export function computeRiskScore(params: {
  disputeRate: number;
  hallucinationRate: number;
  policyBlockRate: number;
  variance: number;
}): number {
  const dispute = clamp01(params.disputeRate);
  const hallucination = clamp01(params.hallucinationRate);
  const policyBlock = clamp01(params.policyBlockRate);
  const variance = clamp01(params.variance);

  const score =
    0.4 * dispute +
    0.25 * hallucination +
    0.2 * policyBlock +
    0.15 * variance;

  return Number(clamp01(score).toFixed(4));
}

export function computeEscrowMultiplier(risk: number): number {
  const value = clamp01(risk);
  if (value >= 0.75) return 1.6;
  if (value >= 0.55) return 1.4;
  if (value >= 0.35) return 1.2;
  if (value >= 0.2) return 1.1;
  return 1;
}

export function computeAgentGpgScore(params: {
  pSuccess: number;
  risk: number;
  expectedCost: number;
  p95LatencyMs: number;
  constraints?: PlannerConstraints;
}): number {
  const pSuccess = clamp01(params.pSuccess);
  const risk = clamp01(params.risk);

  const budgetRef =
    typeof params.constraints?.budget === "number" && params.constraints.budget > 0
      ? params.constraints.budget
      : 10;
  const latencyRef =
    typeof params.constraints?.maxLatencyMs === "number" && params.constraints.maxLatencyMs > 0
      ? params.constraints.maxLatencyMs
      : 12000;

  const costEfficiency = clamp01(1 - params.expectedCost / budgetRef);
  const latencyEfficiency = clamp01(1 - params.p95LatencyMs / latencyRef);

  const gpgScore =
    0.55 * pSuccess +
    0.25 * (1 - risk) +
    0.1 * costEfficiency +
    0.1 * latencyEfficiency;

  return Number(clamp01(gpgScore).toFixed(4));
}

export function buildRiskReasons(stats: Partial<AgentClusterStats>): string[] {
  const reasons: string[] = [];
  if ((stats.disputeRate90d ?? 0) >= 0.1) reasons.push("High dispute rate");
  if ((stats.failureRate30d ?? 0) >= 0.3) reasons.push("Elevated failure rate");
  if ((stats.calibError30d ?? 0) >= 0.2) reasons.push("Poor confidence calibration");
  if ((stats.runCount30d ?? 0) < 10) reasons.push("Low recent sample size");
  if (reasons.length === 0) reasons.push("Stable reliability profile");
  return reasons;
}

export function getExecuteBlendWeight(): number {
  const raw = Number(process.env.GPG_EXECUTE_BLEND_WEIGHT ?? "0.3");
  if (!Number.isFinite(raw)) return 0.3;
  return Math.min(0.9, Math.max(0, raw));
}

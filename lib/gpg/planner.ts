import { createHash } from "crypto";
import type { PipelinePlan } from "./types";
import { bayesianSuccess, computeAgentGpgScore } from "./risk";

export function hashAgentPath(path: string[]): string {
  return createHash("sha256").update(path.join(">"), "utf8").digest("hex");
}

export function computePipelineProbability(agentSuccess: number[]): number {
  return agentSuccess.reduce((acc, p) => acc * Math.max(0, Math.min(1, p)), 1);
}

export function computePipelinePlan(params: {
  agentPath: string[];
  agentSuccess: number[];
  agentCosts: number[];
  agentLatencies: number[];
  agentQualities: number[];
}): PipelinePlan {
  const pSuccess = computePipelineProbability(params.agentSuccess);
  const expectedCost = params.agentCosts.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const expectedLatency = params.agentLatencies.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const expectedQuality = params.agentQualities.length
    ? params.agentQualities.reduce((sum, v) => sum + (Number(v) || 0), 0) / params.agentQualities.length
    : 0;

  const risk = Number((1 - pSuccess).toFixed(4));

  return {
    agents: params.agentPath,
    p_success: Number(pSuccess.toFixed(4)),
    expected_cost: Number(expectedCost.toFixed(4)),
    expected_latency_ms: Number(expectedLatency.toFixed(2)),
    expected_quality: Number(expectedQuality.toFixed(4)),
    risk,
    failure_modes: risk > 0.2 ? ["TIMEOUT", "TOOL_ERROR"] : [],
  };
}

export function scorePipelinePlan(plan: PipelinePlan): number {
  const score = computeAgentGpgScore({
    pSuccess: plan.p_success,
    risk: plan.risk,
    expectedCost: plan.expected_cost,
    p95LatencyMs: plan.expected_latency_ms,
  });
  return score;
}

export function bayesFromAggregate(successRate: number, runCount: number): number {
  const success = Math.round(successRate * runCount);
  return bayesianSuccess(success, runCount);
}

export const GPG_RUN_STATUSES = ["SUCCESS", "FAILURE", "TIMEOUT", "PARTIAL"] as const;
export type GpgRunStatus = (typeof GPG_RUN_STATUSES)[number];

export const GPG_FAILURE_TYPES = [
  "TOOL_ERROR",
  "TIMEOUT",
  "HALLUCINATION",
  "INVALID_FORMAT",
  "POLICY_BLOCK",
  "UNKNOWN",
] as const;
export type GpgFailureType = (typeof GPG_FAILURE_TYPES)[number];

export type GpgTaskCluster = {
  id: string;
  slug: string;
  name: string;
  taskType: string;
  tags: string[];
};

export type TaskSignature = {
  id: string;
  rawText: string;
  normalizedText: string;
  taskType: string;
  tags: string[];
  clusterId: string | null;
};

export type AgentClusterStats = {
  agentId: string;
  clusterId: string;
  successRate30d: number;
  failureRate30d: number;
  disputeRate90d: number;
  avgQuality30d: number;
  calibError30d: number;
  p50LatencyMs30d: number;
  p95LatencyMs30d: number;
  avgCost30d: number;
  runCount30d: number;
  verifiedRunCount30d: number;
  bayesSuccess30d: number;
  riskScore30d: number;
};

export type PipelineRun = {
  id: string;
  clusterId: string | null;
  agentPath: string[];
  status: GpgRunStatus;
  latencyMs: number;
  costUsd: number;
  qualityScore: number | null;
  failureType: GpgFailureType | null;
};

export type PlannerConstraints = {
  budget?: number;
  maxLatencyMs?: number;
  minSuccessProb?: number;
  minQuality?: number;
};

export type PlannerOptimizeMode =
  | "success_then_cost"
  | "cost_then_success"
  | "latency_then_success";

export type PlannerPreferences = {
  optimizeFor?: PlannerOptimizeMode;
};

export type GpgRiskScore = {
  score: number;
  reasons: string[];
};

export type GpgRecommendItem = {
  agentId: string;
  slug?: string;
  name?: string;
  p_success: number;
  expected_cost: number;
  p95_latency_ms: number;
  expected_quality: number;
  risk: number;
  gpg_score: number;
  why: string[];
};

export type GpgRecommendResponse = {
  clusterId: string | null;
  clusterName: string | null;
  taskType: string;
  topAgents: GpgRecommendItem[];
  alternatives: GpgRecommendItem[];
};

export type PipelinePlan = {
  agents: string[];
  p_success: number;
  expected_cost: number;
  expected_latency_ms: number;
  expected_quality: number;
  risk: number;
  failure_modes: string[];
};

export type GpgPlanResponse = {
  clusterId: string | null;
  clusterName: string | null;
  taskType: string;
  plan: PipelinePlan | null;
  alternatives: PipelinePlan[];
};

export type GpgReceiptPayload = {
  receiptType: "gpg_ingest_verified" | "gpg_plan_issued" | "gpg_recommend_issued";
  agentId: string;
  counterpartyAgentId?: string | null;
  eventPayload: Record<string, unknown>;
  idempotencyKey?: string | null;
};

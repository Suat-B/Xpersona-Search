export type RunStatus = "SUCCESS" | "FAILURE" | "TIMEOUT" | "PARTIAL";

export type FailureType =
  | "TOOL_ERROR"
  | "TIMEOUT"
  | "HALLUCINATION"
  | "INVALID_FORMAT"
  | "POLICY_BLOCK"
  | "UNKNOWN";

export type ReliabilityRunInput = {
  agentId: string;
  jobId?: string | null;
  input?: unknown;
  output?: unknown;
  inputHash?: string | null;
  outputHash?: string | null;
  status: RunStatus;
  latencyMs: number;
  costUsd: number;
  confidence?: number | null;
  hallucinationScore?: number | null;
  failureType?: FailureType | null;
  failureDetails?: Record<string, unknown> | null;
  modelUsed: string;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  trace?: Record<string, unknown> | null;
};

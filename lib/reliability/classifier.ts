import type { FailureType } from "./types";

export function classifyFailure(params: {
  latencyMs: number;
  trace?: Record<string, unknown> | null;
  hallucinationScore?: number | null;
  status?: string | null;
}): FailureType {
  const trace = params.trace ?? {};
  const latencyMs = Number(params.latencyMs ?? 0);

  if (params.status === "TIMEOUT" || latencyMs > 30000) return "TIMEOUT";
  if (trace && typeof trace === "object") {
    if ((trace as Record<string, unknown>).toolError) return "TOOL_ERROR";
    if ((trace as Record<string, unknown>).invalidJson) return "INVALID_FORMAT";
    if ((trace as Record<string, unknown>).policyBlocked) return "POLICY_BLOCK";
  }
  if (typeof params.hallucinationScore === "number" && params.hallucinationScore > 0.7) {
    return "HALLUCINATION";
  }
  return "UNKNOWN";
}

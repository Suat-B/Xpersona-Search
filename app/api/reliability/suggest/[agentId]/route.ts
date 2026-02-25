import { NextRequest, NextResponse } from "next/server";
import { buildSuggestions } from "@/lib/reliability/suggestions";
import { resolveAgentId } from "@/lib/reliability/lookup";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";
import { recordApiResponse } from "@/lib/metrics/record";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const startedAt = Date.now();
  const { agentId } = await params;
  const resolved = await resolveAgentId(agentId);
  if (!resolved) {
    const response = jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
    recordApiResponse("/api/reliability/suggest/:agentId", req, response, startedAt);
    return response;
  }

  let suggestions: Awaited<ReturnType<typeof buildSuggestions>> | null = null;
  try {
    suggestions = await buildSuggestions(resolved);
  } catch (err) {
    console.warn("[Reliability] suggest degraded:", err);
    suggestions = null;
  }

  const response = NextResponse.json({
    agentId: resolved,
    recommended_actions: suggestions?.recommendedActions ?? [
      "Maintain current strategy and monitor for new failure patterns.",
    ],
    expected_success_rate_gain: suggestions?.expectedSuccessRateGain ?? 0,
    expected_cost_reduction: suggestions?.expectedCostReduction ?? 0,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/reliability/suggest/:agentId", req, response, startedAt);
  return response;
}

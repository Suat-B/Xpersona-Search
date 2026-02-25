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

  const suggestions = await buildSuggestions(resolved);
  const response = NextResponse.json({
    agentId: resolved,
    recommended_actions: suggestions.recommendedActions,
    expected_success_rate_gain: suggestions.expectedSuccessRateGain,
    expected_cost_reduction: suggestions.expectedCostReduction,
  });
  applyRequestIdHeader(response, req);
  recordApiResponse("/api/reliability/suggest/:agentId", req, response, startedAt);
  return response;
}

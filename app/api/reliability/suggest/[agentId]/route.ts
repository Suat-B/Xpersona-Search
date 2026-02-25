import { NextRequest, NextResponse } from "next/server";
import { buildSuggestions } from "@/lib/reliability/suggestions";
import { resolveAgentId } from "@/lib/reliability/lookup";
import { applyRequestIdHeader, jsonError } from "@/lib/api/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const resolved = await resolveAgentId(agentId);
  if (!resolved) {
    return jsonError(req, {
      code: "NOT_FOUND",
      message: "Agent not found",
      status: 404,
    });
  }

  const suggestions = await buildSuggestions(resolved);
  const response = NextResponse.json({
    agentId: resolved,
    recommended_actions: suggestions.recommendedActions,
    expected_success_rate_gain: suggestions.expectedSuccessRateGain,
    expected_cost_reduction: suggestions.expectedCostReduction,
  });
  applyRequestIdHeader(response, req);
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { buildSuggestions } from "@/lib/reliability/suggestions";
import { resolveAgentId } from "@/lib/reliability/lookup";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const resolved = await resolveAgentId(agentId);
  if (!resolved) {
    return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
  }

  const suggestions = await buildSuggestions(resolved);
  return NextResponse.json({
    agentId: resolved,
    recommended_actions: suggestions.recommendedActions,
    expected_success_rate_gain: suggestions.expectedSuccessRateGain,
    expected_cost_reduction: suggestions.expectedCostReduction,
  });
}

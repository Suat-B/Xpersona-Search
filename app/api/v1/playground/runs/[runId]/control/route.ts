import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { zRunControlRequest } from "@/lib/playground/contracts";
import { getAgentRunById, updateAgentRun } from "@/lib/playground/store";

type Ctx = { params: Promise<{ runId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const RECOMMENDED_ACTION: Record<string, string> = {
  pause: "Pause the run and inspect the receipt before continuing.",
  resume: "Continue the run and refresh the receipt in Playground.",
  cancel: "Run cancelled. Use the receipt as the source of truth for any follow-up.",
  repair: "Retry the run with the receipt as the source of truth.",
  takeover: "Take over the run manually and use the current receipt as the source of truth.",
  retry_last_turn: "Retry the last hosted turn with the current receipt and tool trace as the source of truth.",
};

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zRunControlRequest);
  if (!parsed.success) return parsed.response;
  const { runId } = await ctx.params;

  const existing = await getAgentRunById({ userId: auth.userId, runId });
  if (!existing) {
    return jsonError(request, {
      code: "RUN_NOT_FOUND",
      message: "Unknown runId",
      status: 404,
    });
  }

  const output = asRecord(existing.output);
  const reviewState = asRecord(output.reviewState);
  const controlHistory = Array.isArray(output.controlHistory) ? [...output.controlHistory] : [];
  controlHistory.push({
    action: parsed.data.action,
    note: parsed.data.note ?? null,
    at: new Date().toISOString(),
  });

  const nextStatus =
    parsed.data.action === "cancel"
      ? "failed"
      : parsed.data.action === "resume" ||
          parsed.data.action === "repair" ||
          parsed.data.action === "retry_last_turn"
        ? "running"
        : parsed.data.action === "takeover"
          ? "needs_review"
        : existing.status;

  const updated = await updateAgentRun({
    userId: auth.userId,
    runId,
    status: nextStatus,
    output: {
      ...output,
      reviewState: {
        ...reviewState,
        recommendedAction: RECOMMENDED_ACTION[parsed.data.action],
      },
      controlHistory,
    },
  });

  return ok(request, updated ?? existing);
}

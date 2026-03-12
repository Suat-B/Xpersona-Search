import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zRunControlRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getAgentRunById, updateAgentRun } from "@/lib/playground/store";

type Ctx = { params: Promise<{ runId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function buildReviewState(action: "pause" | "resume" | "cancel" | "repair", note?: string) {
  if (action === "resume") {
    return {
      status: "ready",
      reason: note?.trim() || "Run resumed.",
      recommendedAction: "Continue the run and refresh the receipt in Playground.",
      surface: "playground_panel",
      controlActions: ["pause", "cancel", "repair"],
    };
  }
  if (action === "cancel") {
    return {
      status: "blocked",
      reason: note?.trim() || "Run cancelled by user.",
      recommendedAction: "Repair or replay the run before applying further changes.",
      surface: "playground_panel",
      controlActions: ["repair"],
    };
  }
  if (action === "repair") {
    return {
      status: "needs_attention",
      reason: note?.trim() || "Repair requested for this run.",
      recommendedAction: "Retry the run with the receipt as the source of truth.",
      surface: "playground_panel",
      controlActions: ["resume", "cancel"],
    };
  }
  return {
    status: "needs_attention",
    reason: note?.trim() || "Run paused by user.",
    recommendedAction: "Resume the run when you are ready to continue.",
    surface: "playground_panel",
    controlActions: ["resume", "cancel", "repair"],
  };
}

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

  const body = parsed.data;
  const currentOutput = asRecord(existing.output);
  const controlHistory = Array.isArray(currentOutput.controlHistory) ? [...currentOutput.controlHistory] : [];
  controlHistory.push({
    action: body.action,
    note: body.note ?? null,
    createdAt: new Date().toISOString(),
  });

  const updated = await updateAgentRun({
    userId: auth.userId,
    runId,
    status:
      body.action === "cancel"
        ? "failed"
        : body.action === "resume" || body.action === "repair"
          ? "running"
          : existing.status,
    output: {
      ...currentOutput,
      reviewState: buildReviewState(body.action, body.note),
      controlHistory,
    },
    ...(body.action === "cancel" ? { errorMessage: body.note || "Run cancelled by user." } : {}),
  });

  return ok(request, {
    accepted: true,
    runId,
    action: body.action,
    run: updated ?? existing,
  });
}

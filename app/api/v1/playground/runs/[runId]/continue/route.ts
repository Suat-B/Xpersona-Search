import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zRunContinueRequest } from "@/lib/playground/contracts";
import { ok, parseBody, serverError, unauthorized } from "@/lib/playground/http";
import { resolveAgentRunForContinue } from "@/lib/playground/store";
import { OpenHandsGatewayError } from "@/lib/playground/openhands-gateway";
import { continueAssistToolLoop } from "@/lib/playground/tool-loop";
import { buildAssistResponsePayload } from "@/app/api/v1/playground/assist/route-helpers";

type Ctx = { params: Promise<{ runId: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zRunContinueRequest);
  if (!parsed.success) return parsed.response;

  const { runId: runIdParam } = await ctx.params;
  const existing = await resolveAgentRunForContinue({
    userId: auth.userId,
    runIdFromPath: runIdParam,
    sessionId: parsed.data.sessionId,
  });
  if (!existing) {
    return jsonError(request, {
      code: "RUN_NOT_FOUND",
      message: "Unknown runId",
      status: 404,
    });
  }

  const traceId = getOrCreateRequestId(request);
  try {
    const result = await continueAssistToolLoop({
      userId: auth.userId,
      traceId,
      runId: existing.id,
      toolResult: parsed.data.toolResult,
    });

    return ok(
      request,
      buildAssistResponsePayload({
        sessionId: existing.sessionId,
        traceId,
        result,
      })
    );
  } catch (error) {
    if (error instanceof OpenHandsGatewayError) {
      return jsonError(request, {
        code: error.code,
        message: error.message,
        status: error.status,
        details: error.details,
      });
    }
    console.error("[playground/runs/continue] failed", { runId: runIdParam, resolvedRunId: existing.id, error });
    return serverError(request, error);
  }
}

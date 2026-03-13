import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { getOrCreateRequestId } from "@/lib/api/request-meta";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zRunContinueRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getAgentRunById } from "@/lib/playground/store";
import { continueAssistToolLoop } from "@/lib/playground/tool-loop";
import { buildAssistResponsePayload } from "@/app/api/v1/playground/assist/route-helpers";

type Ctx = { params: Promise<{ runId: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zRunContinueRequest);
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

  const traceId = getOrCreateRequestId(request);
  const result = await continueAssistToolLoop({
    userId: auth.userId,
    traceId,
    runId,
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
}

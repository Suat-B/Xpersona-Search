import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, unauthorized } from "@/lib/playground/http";
import { getAgentRunById } from "@/lib/playground/store";

type Ctx = { params: Promise<{ runId: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const { runId } = await ctx.params;
  const row = await getAgentRunById({ userId: auth.userId, runId });
  if (!row) {
    return jsonError(request, {
      code: "RUN_NOT_FOUND",
      message: "Unknown runId",
      status: 404,
    });
  }

  const output = asRecord(row.output);
  return ok(request, {
    ...row,
    receipt: output.receipt ?? null,
    checkpoint: output.checkpoint ?? null,
    reviewState: output.reviewState ?? null,
    contextTrace: output.contextTrace ?? null,
    delegateRuns: output.delegateRuns ?? [],
    memoryWrites: output.memoryWrites ?? [],
  });
}

import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { createBinaryEventStreamResponse } from "@/lib/binary/sse";
import { getBinaryBuildForUser, isBinaryStreamingEnabled } from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { unauthorized } from "@/lib/playground/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  if (!isBinaryStreamingEnabled()) {
    return jsonError(request, {
      code: "BINARY_STREAMING_DISABLED",
      message: "Binary streaming is disabled for this environment.",
      status: 503,
      retryable: true,
      retryAfterMs: 5_000,
    });
  }

  const { id } = await ctx.params;
  const build = await getBinaryBuildForUser({
    userId: auth.userId,
    buildId: id,
  });
  if (!build) {
    return jsonError(request, {
      code: "BINARY_BUILD_NOT_FOUND",
      message: "Unknown binary build.",
      status: 404,
    });
  }

  return createBinaryEventStreamResponse({
    request,
    buildId: id,
    cursor: request.nextUrl.searchParams.get("cursor"),
  });
}

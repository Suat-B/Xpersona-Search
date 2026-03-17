import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { normalizeBinaryTargetEnvironment, zBinaryBuildRequest } from "@/lib/binary/contracts";
import { createBinaryEventStreamResponse } from "@/lib/binary/sse";
import { createBinaryBuild, isBinaryStreamingEnabled } from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { parseBody, unauthorized } from "@/lib/playground/http";

export async function POST(request: NextRequest): Promise<Response> {
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

  const parsed = await parseBody(request, zBinaryBuildRequest);
  if (!parsed.success) return parsed.response;

  try {
    const build = await createBinaryBuild({
      userId: auth.userId,
      request: {
        ...parsed.data,
        targetEnvironment: normalizeBinaryTargetEnvironment(parsed.data.targetEnvironment),
      },
    });

    return createBinaryEventStreamResponse({
      request,
      buildId: build.id,
    });
  } catch (error) {
    return jsonError(request, {
      code: "BINARY_BUILD_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Binary builds are currently unavailable.",
      status: 503,
      retryable: true,
      retryAfterMs: 5_000,
    });
  }
}

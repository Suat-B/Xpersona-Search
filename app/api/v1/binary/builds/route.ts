import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { normalizeBinaryTargetEnvironment, zBinaryBuildRequest } from "@/lib/binary/contracts";
import { createBinaryBuild } from "@/lib/binary/service";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

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

    return ok(request, build, build.status === "queued" || build.status === "running" ? 202 : 201);
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

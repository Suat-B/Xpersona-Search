import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { zBinaryPublishRequest } from "@/lib/binary/contracts";
import { getBinaryBuildForUser, publishBinaryBuild } from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zBinaryPublishRequest);
  if (!parsed.success) return parsed.response;

  const { id } = await ctx.params;
  const origin = new URL(request.url).origin;
  try {
    const build = await publishBinaryBuild({
      userId: auth.userId,
      buildId: id,
      origin,
      expiresInSeconds: parsed.data.expiresInSeconds,
    });
    if (!build) {
      const existing = await getBinaryBuildForUser({
        userId: auth.userId,
        buildId: id,
      });
      if (existing && (existing.status === "queued" || existing.status === "running")) {
        return jsonError(request, {
          code: "BINARY_BUILD_NOT_READY",
          message: "Wait for the portable package bundle build to finish before publishing it.",
          status: 409,
          retryable: true,
          retryAfterMs: 2_000,
        });
      }
      return jsonError(request, {
        code: "BINARY_BUILD_NOT_PUBLISHABLE",
        message: "Binary build is missing or not publishable.",
        status: 404,
      });
    }

    return ok(request, build);
  } catch (error) {
    return jsonError(request, {
      code: "BINARY_PUBLISH_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Binary publish is currently unavailable.",
      status: 503,
      retryable: true,
      retryAfterMs: 5_000,
    });
  }
}

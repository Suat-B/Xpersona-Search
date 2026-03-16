import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { normalizeBinaryTargetEnvironment, zBinaryValidateRequest } from "@/lib/binary/contracts";
import { getBinaryBuildForUser, validateBinaryBuild } from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zBinaryValidateRequest);
  if (!parsed.success) return parsed.response;

  const { id } = await ctx.params;
  const build = await validateBinaryBuild({
    userId: auth.userId,
    buildId: id,
    targetEnvironment: parsed.data.targetEnvironment
      ? normalizeBinaryTargetEnvironment(parsed.data.targetEnvironment)
      : undefined,
  });
  if (!build) {
    const existing = await getBinaryBuildForUser({
      userId: auth.userId,
      buildId: id,
    });
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return jsonError(request, {
        code: "BINARY_BUILD_NOT_READY",
        message: "Wait for the portable package bundle build to finish before validating it.",
        status: 409,
        retryable: true,
        retryAfterMs: 2_000,
      });
    }
    return jsonError(request, {
      code: "BINARY_BUILD_NOT_FOUND",
      message: "Unknown binary build.",
      status: 404,
    });
  }

  return ok(request, build);
}

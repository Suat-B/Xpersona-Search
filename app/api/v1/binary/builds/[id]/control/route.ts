import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { zBinaryControlRequest } from "@/lib/binary/contracts";
import { cancelBinaryBuild, getBinaryBuildForUser } from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zBinaryControlRequest);
  if (!parsed.success) return parsed.response;

  const { id } = await ctx.params;
  const build = await cancelBinaryBuild({
    userId: auth.userId,
    buildId: id,
  });
  if (!build) {
    const existing = await getBinaryBuildForUser({
      userId: auth.userId,
      buildId: id,
    });
    return jsonError(request, {
      code: existing ? "BINARY_BUILD_NOT_CANCELABLE" : "BINARY_BUILD_NOT_FOUND",
      message: existing ? "Binary build can no longer be canceled." : "Unknown binary build.",
      status: existing ? 409 : 404,
      retryable: existing ? false : undefined,
    });
  }

  return ok(request, build);
}

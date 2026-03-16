import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, unauthorized } from "@/lib/playground/http";
import { getBinaryBuildForUser } from "@/lib/binary/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

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

  return ok(request, build);
}

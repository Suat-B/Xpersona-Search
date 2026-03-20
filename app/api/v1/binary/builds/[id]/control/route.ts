import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { zBinaryControlRequest } from "@/lib/binary/contracts";
import {
  branchBinaryBuild,
  cancelBinaryBuild,
  getBinaryBuildForUser,
  refineBinaryBuild,
  rewindBinaryBuild,
} from "@/lib/binary/service";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zBinaryControlRequest);
  if (!parsed.success) return parsed.response;

  const { id } = await ctx.params;
  const build =
    parsed.data.action === "cancel"
      ? await cancelBinaryBuild({
          userId: auth.userId,
          buildId: id,
        })
      : parsed.data.action === "refine"
        ? await refineBinaryBuild({
            userId: auth.userId,
            buildId: id,
            intent: parsed.data.intent,
          })
        : parsed.data.action === "branch"
          ? await branchBinaryBuild({
              userId: auth.userId,
              buildId: id,
              checkpointId: parsed.data.checkpointId,
              intent: parsed.data.intent,
            })
          : await rewindBinaryBuild({
              userId: auth.userId,
              buildId: id,
              checkpointId: parsed.data.checkpointId,
            });
  if (!build) {
    const existing = await getBinaryBuildForUser({
      userId: auth.userId,
      buildId: id,
    });
    return jsonError(request, {
      code: existing ? "BINARY_BUILD_CONTROL_REJECTED" : "BINARY_BUILD_NOT_FOUND",
      message:
        !existing
          ? "Unknown binary build."
          : parsed.data.action === "cancel"
            ? "Binary build can no longer be canceled."
            : parsed.data.action === "refine"
              ? "Binary build must be actively streaming before it can be refined."
              : parsed.data.action === "branch"
                ? "Binary build could not be branched from the requested checkpoint."
                : "Binary build could not be rewound to the requested checkpoint.",
      status: existing ? 409 : 404,
      retryable: existing ? false : undefined,
    });
  }

  return ok(request, build);
}

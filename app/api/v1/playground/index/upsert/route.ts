import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { logAction, upsertIndexChunks } from "@/lib/playground/store";
import { zIndexUpsertRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zIndexUpsertRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  await upsertIndexChunks({
    userId: auth.userId,
    projectKey: body.projectKey,
    chunks: body.chunks,
    cursor: body.cursor,
    stats: body.stats,
  });

  await logAction({
    userId: auth.userId,
    actionType: "index",
    status: "executed",
    payload: {
      projectKey: body.projectKey,
      upserted: body.chunks.length,
      cursor: body.cursor ?? null,
    },
  });

  return ok(request, { upserted: body.chunks.length });
}

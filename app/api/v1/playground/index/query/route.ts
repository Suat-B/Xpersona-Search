import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { queryIndex } from "@/lib/playground/store";
import { zIndexQueryRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundApiKey(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zIndexQueryRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const chunks = await queryIndex({
    userId: auth.userId,
    projectKey: body.projectKey,
    query: body.query,
    limit: Math.max(1, Math.min(body.limit ?? 8, 50)),
  });
  return ok(request, chunks);
}


import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { createSession, listSessions } from "@/lib/playground/store";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { zCreateSessionRequest, zSessionsListQuery } from "@/lib/playground/contracts";
import { getOrCreateRequestId } from "@/lib/api/request-meta";

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const query = zSessionsListQuery.safeParse({
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    mode: request.nextUrl.searchParams.get("mode") ?? undefined,
    search: request.nextUrl.searchParams.get("search") ?? undefined,
  });

  const result = await listSessions({
    userId: auth.userId,
    cursor: query.success ? query.data.cursor : undefined,
    limit: query.success ? query.data.limit : undefined,
    mode: query.success ? query.data.mode : undefined,
    search: query.success ? query.data.search : undefined,
  });
  return ok(request, result);
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zCreateSessionRequest);
  if (!parsed.success) return parsed.response;

  const body = parsed.data;
  const session = await createSession({
    userId: auth.userId,
    title: body.title,
    mode: body.mode,
    workspaceFingerprint: body.workspaceFingerprint,
    metadata: body.metadata,
    traceId: getOrCreateRequestId(request),
  });
  return ok(request, session, 201);
}

import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { appendSessionMessage, listSessionMessages } from "@/lib/playground/store";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { zAppendMessageRequest, zMessagesGetQuery } from "@/lib/playground/contracts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const query = zMessagesGetQuery.safeParse({
    includeAgentEvents: request.nextUrl.searchParams.get("includeAgentEvents") ?? undefined,
    fromTimestamp: request.nextUrl.searchParams.get("fromTimestamp") ?? undefined,
  });
  const { id } = await ctx.params;

  const messages = await listSessionMessages({
    userId: auth.userId,
    sessionId: id,
    includeAgentEvents: query.success ? query.data.includeAgentEvents : false,
    fromTimestamp: query.success ? query.data.fromTimestamp : undefined,
  });
  return ok(request, messages);
}

export async function POST(request: NextRequest, ctx: Ctx): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zAppendMessageRequest);
  if (!parsed.success) return parsed.response;

  const { id } = await ctx.params;
  const body = parsed.data;
  const row = await appendSessionMessage({
    userId: auth.userId,
    sessionId: id,
    role: body.role,
    kind: body.kind,
    content: body.content,
    payload: body.payload,
    tokenCount: Math.ceil(body.content.length / 4),
  });
  return ok(request, row, 201);
}

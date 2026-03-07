import { NextRequest, NextResponse } from "next/server";
import { createChatProxyBearer, resolveExistingChatActor } from "@/lib/chat/actor";
import { proxyPlaygroundRequest } from "@/lib/chat/playground-proxy";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "UNAUTHORIZED",
      message: "Call /api/me/chat/bootstrap first.",
    },
    { status: 401 }
  );
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<Response> {
  const actor = await resolveExistingChatActor(request);
  if (!actor) return unauthorized();
  const { id } = await ctx.params;
  const query = new URLSearchParams(request.nextUrl.searchParams);
  query.set("includeAgentEvents", "true");
  const bearer = createChatProxyBearer(actor);
  return proxyPlaygroundRequest({
    request,
    method: "GET",
    path: `/api/v1/playground/sessions/${encodeURIComponent(id)}/messages?${query.toString()}`,
    bearer,
  });
}

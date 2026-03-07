import { NextRequest, NextResponse } from "next/server";
import { createChatProxyBearer, resolveExistingChatActor } from "@/lib/chat/actor";
import { proxyPlaygroundRequest } from "@/lib/chat/playground-proxy";

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

export async function GET(request: NextRequest): Promise<Response> {
  const actor = await resolveExistingChatActor(request);
  if (!actor) return unauthorized();
  const bearer = createChatProxyBearer(actor);
  return proxyPlaygroundRequest({
    request,
    method: "GET",
    path: `/api/v1/playground/sessions${request.nextUrl.search}`,
    bearer,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await resolveExistingChatActor(request);
  if (!actor) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bearer = createChatProxyBearer(actor);
  return proxyPlaygroundRequest({
    request,
    method: "POST",
    path: "/api/v1/playground/sessions",
    bearer,
    body,
  });
}

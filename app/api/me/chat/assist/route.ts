import { NextRequest, NextResponse } from "next/server";
import {
  createChatProxyBearer,
  ensureChatTrialEntitlement,
  resolveExistingChatActor,
} from "@/lib/chat/actor";
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

export async function POST(request: NextRequest): Promise<Response> {
  const actor = await resolveExistingChatActor(request);
  if (!actor) return unauthorized();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.task !== "string" || !body.task.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "task is required",
      },
      { status: 400 }
    );
  }

  await ensureChatTrialEntitlement(actor.userId);
  const bearer = createChatProxyBearer(actor);

  const proxiedBody = {
    ...body,
    mode: "generate",
    model: "Qwen/Qwen3-235B-A22B-Instruct-2507:fastest",
    stream: true,
    safetyProfile: "standard",
  };

  return proxyPlaygroundRequest({
    request,
    method: "POST",
    path: "/api/v1/playground/assist",
    bearer,
    body: proxiedBody,
    acceptSse: true,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, type AuthUser } from "@/lib/auth-utils";
import { isAdmin } from "@/lib/admin";

type GuardSuccess = {
  ok: true;
  user: AuthUser;
};

type GuardFailure = {
  ok: false;
  response: NextResponse;
};

type GuardResult = GuardSuccess | GuardFailure;

function unauthorizedResponse(message = "UNAUTHORIZED"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbiddenResponse(message = "FORBIDDEN"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireBearerApiKey(req: NextRequest): Promise<GuardResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: unauthorizedResponse("BEARER_TOKEN_REQUIRED") };
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, user: authResult.user };
}

export async function requireSessionUser(req: NextRequest): Promise<GuardResult> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    return { ok: false, response: forbiddenResponse("SESSION_REQUIRED") };
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, user: authResult.user };
}

export async function requireAdmin(req: NextRequest): Promise<GuardResult> {
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return { ok: false, response: unauthorizedResponse() };
  }
  if (!isAdmin(authResult.user)) {
    return { ok: false, response: forbiddenResponse() };
  }
  return { ok: true, user: authResult.user };
}

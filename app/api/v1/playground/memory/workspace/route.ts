import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { zWorkspaceMemoryPutRequest, zWorkspaceMemoryQuery } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { getUserPlaygroundProfile, upsertUserPlaygroundProfile } from "@/lib/playground/store";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = zWorkspaceMemoryQuery.safeParse({
    workspaceFingerprint: request.nextUrl.searchParams.get("workspaceFingerprint") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(request, {
      code: "INVALID_WORKSPACE_FINGERPRINT",
      message: "workspaceFingerprint is required",
      status: 400,
    });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.userId }).catch(() => null);
  const stablePreferences = asRecord(profile?.stablePreferences);
  const workspaceMemoryRoot = asRecord(stablePreferences.workspaceMemory);
  const workspaceFingerprint = parsed.data.workspaceFingerprint;
  const value = asRecord(workspaceMemoryRoot[workspaceFingerprint]);

  return ok(request, {
    workspaceFingerprint,
    value: {
      summary: typeof value.summary === "string" ? value.summary : "",
      promotedMemories: Array.isArray(value.promotedMemories) ? value.promotedMemories : [],
      touchedPaths: Array.isArray(value.touchedPaths) ? value.touchedPaths : [],
      enabled: value.enabled !== false,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      note: typeof value.note === "string" ? value.note : null,
    },
  });
}

export async function PUT(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zWorkspaceMemoryPutRequest);
  if (!parsed.success) return parsed.response;

  const profile = await getUserPlaygroundProfile({ userId: auth.userId }).catch(() => null);
  const stablePreferences = asRecord(profile?.stablePreferences);
  const workspaceMemoryRoot = asRecord(stablePreferences.workspaceMemory);
  const body = parsed.data;
  const existing = asRecord(workspaceMemoryRoot[body.workspaceFingerprint]);
  const nextStablePreferences = {
    ...stablePreferences,
    workspaceMemory: {
      ...workspaceMemoryRoot,
      [body.workspaceFingerprint]: {
        ...existing,
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.promotedMemories !== undefined ? { promotedMemories: body.promotedMemories } : {}),
        ...(body.touchedPaths !== undefined ? { touchedPaths: body.touchedPaths } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        updatedAt: new Date().toISOString(),
      },
    },
  };

  await upsertUserPlaygroundProfile({
    userId: auth.userId,
    stablePreferences: nextStablePreferences,
  });

  return ok(request, {
    workspaceFingerprint: body.workspaceFingerprint,
    value: nextStablePreferences.workspaceMemory[body.workspaceFingerprint],
  });
}

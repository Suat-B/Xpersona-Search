import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/errors";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { zWorkspaceMemoryPutRequest, zWorkspaceMemoryQuery } from "@/lib/playground/contracts";
import { getUserPlaygroundProfile, upsertUserPlaygroundProfile } from "@/lib/playground/store";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = zWorkspaceMemoryQuery.safeParse(params);
  if (!parsed.success) {
    return jsonError(request, {
      code: "INVALID_WORKSPACE_MEMORY_QUERY",
      message: parsed.error.issues[0]?.message || "Invalid workspace memory query.",
      status: 400,
    });
  }

  const profile = await getUserPlaygroundProfile({ userId: auth.userId });
  const stablePreferences = asRecord(profile?.stablePreferences);
  const workspaceMemory = asRecord(stablePreferences.workspaceMemory);

  return ok(request, {
    workspaceFingerprint: parsed.data.workspaceFingerprint,
    memory: workspaceMemory[parsed.data.workspaceFingerprint] ?? null,
  });
}

export async function PUT(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zWorkspaceMemoryPutRequest);
  if (!parsed.success) return parsed.response;

  const profile = await getUserPlaygroundProfile({ userId: auth.userId });
  const stablePreferences = asRecord(profile?.stablePreferences);
  const workspaceMemory = asRecord(stablePreferences.workspaceMemory);
  const nextMemory = {
    ...workspaceMemory,
    [parsed.data.workspaceFingerprint]: {
      summary: parsed.data.summary ?? null,
      promotedMemories: parsed.data.promotedMemories ?? [],
      touchedPaths: parsed.data.touchedPaths ?? [],
      enabled: parsed.data.enabled ?? true,
      note: parsed.data.note ?? null,
      updatedAt: new Date().toISOString(),
    },
  };

  const saved = await upsertUserPlaygroundProfile({
    userId: auth.userId,
    stablePreferences: {
      ...stablePreferences,
      workspaceMemory: nextMemory,
    },
  });

  return ok(request, {
    workspaceFingerprint: parsed.data.workspaceFingerprint,
    memory: asRecord(asRecord(saved.stablePreferences).workspaceMemory)[parsed.data.workspaceFingerprint] ?? null,
  });
}

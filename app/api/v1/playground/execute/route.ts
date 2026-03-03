import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { logAction } from "@/lib/playground/store";
import { zExecuteRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { validateExecuteAction } from "@/lib/playground/policy";

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundApiKey(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zExecuteRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const snapshotId = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const rollbackToken = `rb_${Math.random().toString(36).slice(2, 12)}`;

  const results: Array<{
    action: unknown;
    status: "approved" | "blocked";
    reason?: string;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  }> = [];

  for (const action of body.actions) {
    const startedAt = Date.now();
    const check = validateExecuteAction(action);
    const status = check.ok ? "approved" : "blocked";
    const reason = check.reason;

    const stdout =
      action.type === "rollback"
        ? `Rollback prepared for snapshot ${action.snapshotId}`
        : check.ok
          ? "Policy approved."
          : "";
    const stderr = check.ok ? "" : reason ?? "Action blocked";
    const exitCode = check.ok ? 0 : 1;
    const durationMs = Date.now() - startedAt;

    results.push({
      action,
      status,
      reason,
      stdout,
      stderr,
      exitCode,
      durationMs,
    });

    await logAction({
      userId: auth.userId,
      sessionId: body.sessionId,
      actionType: action.type === "rollback" ? "rollback" : action.type,
      status,
      payload: action as unknown as Record<string, unknown>,
      reason,
      durationMs,
      exitCode,
      stdoutExcerpt: stdout.slice(0, 1200),
      stderrExcerpt: stderr.slice(0, 1200),
    });
  }

  const nextActions = results.some((row) => row.status === "blocked")
    ? ["Revise blocked actions and retry execute."]
    : ["Apply approved edits locally and run approved commands."];

  return ok(request, {
    results,
    artifacts: [
      {
        kind: "snapshot_manifest",
        payload: {
          snapshotId,
          rollbackToken,
          workspaceFingerprint: body.workspaceFingerprint,
        },
      },
    ],
    nextActions,
    rollbackToken,
    snapshotId,
  });
}


import { NextRequest } from "next/server";
import { authenticatePlaygroundRequest } from "@/lib/playground/auth";
import { logAction } from "@/lib/playground/store";
import { zExecuteRequest } from "@/lib/playground/contracts";
import { ok, parseBody, unauthorized } from "@/lib/playground/http";
import { validateExecuteAction } from "@/lib/playground/policy";

function summarizeApprovedAction(action: { type: string } & Record<string, unknown>): string {
  if (action.type === "rollback") return `Rollback prepared for snapshot ${String(action.snapshotId || "")}`;
  if (action.type === "mkdir") return `Directory approved: ${String(action.path || "")}`;
  if (action.type === "write_file") return `File write approved: ${String(action.path || "")}`;
  if (action.type === "edit") return `Edit approved: ${String(action.path || "")}`;
  if (action.type === "command") return `Command approved: ${String(action.command || "")}`;
  if (action.type === "desktop_open_app") return `Desktop app launch approved: ${String(action.app || "")}`;
  if (action.type === "desktop_open_url") return `Desktop URL open approved: ${String(action.url || "")}`;
  if (action.type === "desktop_focus_window") {
    return `Desktop window focus approved: ${String(action.windowId || action.title || action.app || "window")}`;
  }
  if (action.type === "desktop_click") return "Desktop click approved.";
  if (action.type === "desktop_type") return "Desktop typing approved.";
  if (action.type === "desktop_keypress") return "Desktop keypress approved.";
  if (action.type === "desktop_scroll") return "Desktop scroll approved.";
  if (action.type === "desktop_wait") return `Desktop wait approved: ${String(action.durationMs || 0)}ms`;
  return "Policy approved.";
}

export async function POST(request: NextRequest): Promise<Response> {
  const auth = await authenticatePlaygroundRequest(request);
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

    const stdout = check.ok ? summarizeApprovedAction(action as { type: string } & Record<string, unknown>) : "";
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
      actionType: action.type,
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

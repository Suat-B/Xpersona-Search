import { NextRequest } from "next/server";
import { authenticatePlaygroundApiKey } from "@/lib/playground/auth";
import { zReplayRequest } from "@/lib/playground/contracts";
import { createReplayRun, listSessionMessages, listSessions } from "@/lib/playground/store";
import { ok, parseBody, unauthorized, badRequest } from "@/lib/playground/http";

export async function POST(request: NextRequest): Promise<Response> {
  if (process.env.PLAYGROUND_ENABLE_REPLAY !== "1") {
    return badRequest(request, "Replay is currently disabled by server policy.");
  }
  const auth = await authenticatePlaygroundApiKey(request);
  if (!auth) return unauthorized(request);

  const parsed = await parseBody(request, zReplayRequest);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const sessions = await listSessions({ userId: auth.userId, limit: 200 });
  const source = sessions.data.find((session) => session.id === body.sessionId);
  if (!source) return badRequest(request, "Unknown sessionId");

  const messages = await listSessionMessages({
    userId: auth.userId,
    sessionId: body.sessionId,
    includeAgentEvents: true,
  });

  const sourceFingerprint = source.workspaceFingerprint ?? "";
  const driftSummary =
    sourceFingerprint === body.workspaceFingerprint
      ? "No workspace drift detected."
      : "Workspace fingerprint changed since original session. Re-validation recommended.";

  const replayId = await createReplayRun({
    userId: auth.userId,
    sourceSessionId: body.sessionId,
    workspaceFingerprint: body.workspaceFingerprint,
    driftSummary,
    status: "completed",
    metadata: {
      mode: body.mode,
      sourceWorkspaceFingerprint: sourceFingerprint || null,
      messageCount: messages.length,
    },
  });

  return ok(request, {
    replayId,
    replayPlan: {
      mode: body.mode,
      steps: [
        "Reconstruct prior context from session history.",
        "Re-rank context using current workspace fingerprint.",
        "Execute requested mode with drift-aware safeguards.",
      ],
    },
    driftReport: {
      changed: sourceFingerprint !== body.workspaceFingerprint,
      summary: driftSummary,
    },
    recommendedApplyStrategy:
      sourceFingerprint === body.workspaceFingerprint
        ? "Apply with standard validation."
        : "Apply with conservative plan-first execution and full test run.",
  });
}

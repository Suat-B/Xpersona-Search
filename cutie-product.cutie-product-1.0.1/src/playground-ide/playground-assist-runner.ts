import { requestJson } from "./api-client";
import { getBaseApiUrl } from "./pg-config";
import type { AssistRunEnvelope, PendingToolCall, RequestAuth, ToolResult } from "./shared";
import type { ToolExecutor } from "./tool-executor";

export async function playgroundRequestAssist(
  auth: RequestAuth,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AssistRunEnvelope> {
  const response = await requestJson<{ data?: AssistRunEnvelope }>(
    "POST",
    `${getBaseApiUrl()}/api/v1/playground/assist`,
    auth,
    body,
    { signal }
  );
  return (response?.data || response) as AssistRunEnvelope;
}

export async function playgroundContinueRun(
  auth: RequestAuth,
  runId: string,
  toolResult: ToolResult,
  signal?: AbortSignal
): Promise<AssistRunEnvelope> {
  const url = `${getBaseApiUrl()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`;
  const body = { toolResult };
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    if (signal?.aborted) throw new Error("Prompt aborted");
    try {
      const response = await requestJson<{ data?: AssistRunEnvelope }>("POST", url, auth, body, { signal });
      return (response?.data || response) as AssistRunEnvelope;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message.includes("RUN_NOT_FOUND") && attempt < 2) continue;
      throw lastError;
    }
  }
  throw lastError ?? new Error("Continue run failed");
}

export async function runPlaygroundToolLoop(input: {
  auth: RequestAuth;
  initial: AssistRunEnvelope;
  toolExecutor: ToolExecutor;
  workspaceFingerprint: string;
  sessionId?: string;
  signal?: AbortSignal;
}): Promise<AssistRunEnvelope> {
  let envelope = input.initial;
  const maxSteps = 64;
  for (let step = 0; step < maxSteps; step++) {
    if (!envelope.pendingToolCall || !envelope.runId) return envelope;
    if (input.signal?.aborted) throw new Error("Prompt aborted");
    const pendingToolCall = envelope.pendingToolCall as PendingToolCall;
    const toolResult = await input.toolExecutor.executeToolCall({
      pendingToolCall,
      auth: input.auth,
      sessionId: input.sessionId,
      workspaceFingerprint: input.workspaceFingerprint,
    });
    envelope = await playgroundContinueRun(input.auth, envelope.runId, toolResult, input.signal);
  }
  return envelope;
}

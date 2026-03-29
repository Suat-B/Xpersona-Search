import { requestJson } from "./api-client";
import { getBaseApiUrl } from "./pg-config";
import type { ActionRunnerFileMutationPayload } from "./actions";
import type { AssistRunEnvelope, PendingToolCall, RequestAuth, ToolResult } from "./shared";
import type { ToolExecutor } from "./tool-executor";

function truncateProgressText(text: string, max: number): string {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Plain, first-person lines for the chat bubble while hosted playground tools run locally. */
export function formatPlaygroundPendingToolLine(pending: PendingToolCall): string {
  const tc = pending.toolCall;
  const name = tc.name;
  const args = tc.arguments || {};
  const pathArg = typeof args.path === "string" ? args.path.trim() : "";
  const cmd = typeof args.command === "string" ? args.command.trim() : "";
  const query = typeof args.query === "string" ? args.query.trim() : "";

  switch (name) {
    case "read_file":
      return pathArg
        ? `I'm reading "${pathArg}" so the model can see what's in the file.`
        : "I'm reading a file in your workspace.";
    case "edit":
    case "write_file":
      return pathArg
        ? `I'm updating "${pathArg}" from the model's change.`
        : "I'm applying an edit in your workspace.";
    case "mkdir":
      return pathArg ? `I'm creating the folder "${pathArg}".` : "I'm creating a folder in your workspace.";
    case "list_files":
      return pathArg ? `I'm listing files under "${pathArg}".` : "I'm listing files in your workspace.";
    case "search_workspace":
      return query
        ? `I'm searching the workspace for: ${truncateProgressText(query, 120)}.`
        : "I'm searching the workspace.";
    case "get_diagnostics":
      return pathArg
        ? `I'm loading editor diagnostics for "${pathArg}".`
        : "I'm loading editor diagnostics.";
    case "git_status":
      return "I'm reading git status in your workspace.";
    case "git_diff":
      return "I'm reading git diff in your workspace.";
    case "run_command":
      return cmd
        ? `I'm running this command locally: ${truncateProgressText(cmd, 100)}.`
        : "I'm running a shell command in your workspace.";
    case "create_checkpoint":
      return "I'm creating a workspace checkpoint.";
    case "get_workspace_memory":
      return "I'm loading workspace memory for the model.";
    default:
      return `I'm running "${name}" in your workspace.`;
  }
}

export function formatPlaygroundToolResultLine(result: ToolResult): string {
  const label = result.name.replace(/_/g, " ");
  if (result.blocked) {
    return `That step was blocked (${label}): ${truncateProgressText(result.error || result.summary || "blocked", 200)}.`;
  }
  if (result.ok) {
    return `Finished ${label}: ${truncateProgressText(result.summary || "done", 240)}.`;
  }
  return `Something went wrong (${label}): ${truncateProgressText(result.error || result.summary || "failed", 240)}.`;
}

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
  signal?: AbortSignal,
  sessionId?: string | null
): Promise<AssistRunEnvelope> {
  const url = `${getBaseApiUrl()}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`;
  const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : "";
  const body = sid ? { toolResult, sessionId: sid } : { toolResult };
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
  onDidMutateFile?: (payload: ActionRunnerFileMutationPayload) => void | Promise<void>;
  /** Appends one short plain-text paragraph for the chat UI (before each tool and after each result). */
  onProgressLine?: (line: string) => void;
}): Promise<AssistRunEnvelope> {
  let envelope = input.initial;
  const maxSteps = 64;
  for (let step = 0; step < maxSteps; step++) {
    if (!envelope.pendingToolCall || !envelope.runId) return envelope;
    if (input.signal?.aborted) throw new Error("Prompt aborted");
    const pendingToolCall = envelope.pendingToolCall as PendingToolCall;
    input.onProgressLine?.(formatPlaygroundPendingToolLine(pendingToolCall));
    const toolResult = await input.toolExecutor.executeToolCall({
      pendingToolCall,
      auth: input.auth,
      sessionId: input.sessionId,
      workspaceFingerprint: input.workspaceFingerprint,
      signal: input.signal,
      onDidMutateFile: input.onDidMutateFile,
    });
    input.onProgressLine?.(formatPlaygroundToolResultLine(toolResult));
    envelope = await playgroundContinueRun(
      input.auth,
      envelope.runId,
      toolResult,
      input.signal,
      input.sessionId || envelope.sessionId
    );
  }
  return envelope;
}

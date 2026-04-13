import type { AssistResult } from "@/lib/playground/orchestration";

/**
 * True when the user message is a bare greeting with no @mentions, paths, or retrieval hints.
 * Used to skip OpenHands tool loop so trivial "hello" turns do not trigger file edits.
 */
export function isTrivialGreetingOnlyTask(input: {
  task: string;
  mode: string;
  retrievalHints?: { preferredTargetPath?: string; mentionedPaths?: string[] } | null;
}): boolean {
  if (input.mode !== "auto") return false;
  const t = String(input.task || "").trim();
  if (!t) return false;
  if (/@[^\s\n]+/.test(t)) return false;
  if (/["'`][^"'`]*[/\\][^"'`]*["'`]/.test(t)) return false;
  const hints = input.retrievalHints;
  if (hints?.preferredTargetPath?.trim()) return false;
  if (hints?.mentionedPaths?.length) return false;
  const lower = t.replace(/[!?.]+$/g, "").trim().toLowerCase();
  const trivial = new Set([
    "hello",
    "hi",
    "hey",
    "hello there",
    "hi there",
    "hey there",
    "good morning",
    "good afternoon",
    "good evening",
    "thanks",
    "thank you",
    "thx",
    "bye",
    "ok",
    "okay",
    "sup",
    "yo",
    "hiya",
    "howdy",
  ]);
  return trivial.has(lower);
}

export function buildConversationHistory(
  rows: Array<{ role?: string; content?: string }> | undefined
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!rows?.length) return [];
  return rows
    .filter((row): row is { role: "user" | "assistant"; content: string } => {
      return (
        !!row &&
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        row.content.trim().length > 0
      );
    })
    .reverse()
    .slice(-10)
    .map((row) => ({
      role: row.role,
      content: row.content.replace(/\r\n/g, "\n").trim().slice(0, 12_000),
    }));
}

export function buildAssistResponsePayload(input: {
  sessionId: string;
  traceId: string;
  result: AssistResult;
}) {
  const { result } = input;
  return {
    sessionId: input.sessionId,
    traceId: input.traceId,
    decision: result.decision,
    plan: result.plan,
    actions: result.actions,
    final: result.final,
    validationPlan: result.validationPlan,
    targetInference: result.targetInference,
    contextSelection: result.contextSelection,
    completionStatus: result.completionStatus,
    missingRequirements: result.missingRequirements,
    ...(result.userInputRequest ? { userInputRequest: result.userInputRequest } : {}),
    ...(result.modelMetadata?.modelResolvedAlias ? { modelAlias: result.modelMetadata.modelResolvedAlias } : {}),
    ...(result.modelMetadata?.chatModelSource ? { chatModelSource: result.modelMetadata.chatModelSource } : {}),
    ...(result.modelMetadata?.chatModelAlias ? { chatModelAlias: result.modelMetadata.chatModelAlias } : {}),
    ...(result.modelMetadata?.chatProvider ? { chatProvider: result.modelMetadata.chatProvider } : {}),
    ...(result.modelMetadata?.orchestratorModelAlias
      ? { orchestratorModelAlias: result.modelMetadata.orchestratorModelAlias }
      : {}),
    ...(result.modelMetadata?.orchestratorProvider
      ? { orchestratorProvider: result.modelMetadata.orchestratorProvider }
      : {}),
    ...(result.modelMetadata?.fallbackApplied ? { fallbackApplied: true } : {}),
    ...(result.orchestrator ? { orchestrator: result.orchestrator } : {}),
    ...(result.orchestratorVersion ? { orchestratorVersion: result.orchestratorVersion } : {}),
    progressState: result.progressState,
    objectiveState: result.objectiveState,
    ...(result.runId ? { runId: result.runId } : {}),
    ...(result.modelCandidate ? { modelCandidate: result.modelCandidate } : {}),
    ...(typeof result.fallbackAttempt === "number" ? { fallbackAttempt: result.fallbackAttempt } : {}),
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    ...(result.persistenceDir ? { persistenceDir: result.persistenceDir } : {}),
    ...(result.conversationId ? { conversationId: result.conversationId } : {}),
    ...(result.fallbackTrail?.length ? { fallbackTrail: result.fallbackTrail } : {}),
    ...(result.orchestrationProtocol ? { orchestrationProtocol: result.orchestrationProtocol } : {}),
    ...(result.adapter ? { adapter: result.adapter } : {}),
    ...(result.loopState ? { loopState: result.loopState } : {}),
    ...(result.pendingToolCall ? { pendingToolCall: result.pendingToolCall } : {}),
    ...(result.toolTrace?.length ? { toolTrace: result.toolTrace } : {}),
    ...(result.receipt ? { receipt: result.receipt } : {}),
    ...(result.checkpoint ? { checkpoint: result.checkpoint } : {}),
    ...(result.reviewState ? { reviewState: result.reviewState } : {}),
  };
}

export function resolveAssistTomEnabled(input: {
  task: string;
  interactionKind?: string;
  requestedTomEnabled?: boolean;
}): boolean {
  if (typeof input.requestedTomEnabled === "boolean") {
    return input.requestedTomEnabled;
  }
  const task = String(input.task || "").trim().toLowerCase();
  const debugRuntimeTask =
    task.startsWith("binary runtime debug") ||
    task.includes("binary runtime debug") ||
    task.includes("debug-runtime");
  if (debugRuntimeTask) return false;
  return true;
}

import type { AssistResult } from "@/lib/playground/orchestration";

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
    progressState: result.progressState,
    objectiveState: result.objectiveState,
    ...(result.runId ? { runId: result.runId } : {}),
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

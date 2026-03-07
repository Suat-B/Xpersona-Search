import type { AssistResult } from "@/lib/playground/orchestration";

const PUBLIC_PLAYGROUND_MODEL_NAME = "Playground 1";

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

export function mergeConversationHistory(input: {
  persisted: Array<{ role: "user" | "assistant"; content: string }>;
  fromClient?: Array<{ role: "user" | "assistant"; content: string }>;
}): Array<{ role: "user" | "assistant"; content: string }> {
  const merged = [...(input.persisted ?? []), ...(input.fromClient ?? [])]
    .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
    .map((row) => ({
      role: row.role,
      content: row.content.replace(/\r\n/g, "\n").trim().slice(0, 12_000),
    }))
    .filter((row) => row.content.length > 0);

  const deduped: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const row of merged) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.role === row.role && prev.content === row.content) continue;
    deduped.push(row);
  }
  return deduped.slice(-14);
}

export function buildCompactSessionSummary(input: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  latestTask: string;
  latestFinal: string;
}): string {
  const clean = (text: string) =>
    String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const recent = input.history.slice(-4).map((turn) => `${turn.role}: ${clean(turn.content).slice(0, 140)}`);
  const latestUser = clean(input.latestTask).slice(0, 160);
  const latestAssistant = clean(input.latestFinal).slice(0, 220);
  return [
    latestUser ? `Latest user request: ${latestUser}` : "",
    latestAssistant ? `Latest assistant outcome: ${latestAssistant}` : "",
    recent.length ? `Recent context: ${recent.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 900);
}

export function buildAssistResponsePayload(input: {
  sessionId: string;
  traceId: string;
  result: AssistResult;
}) {
  const { result } = input;
  return {
    sessionId: input.sessionId,
    decision: result.decision,
    intent: result.intent,
    reasonCodes: result.reasonCodes,
    autonomyDecision: result.autonomyDecision,
    validationPlan: result.validationPlan,
    plan: result.plan,
    edits: result.edits,
    commands: result.commands,
    actions: result.actions,
    final: result.final,
    logs: result.logs,
    model: PUBLIC_PLAYGROUND_MODEL_NAME,
    confidence: result.confidence,
    risk: result.risk,
    influence: result.influence,
    nextBestActions: result.nextBestActions,
    repromptStage: result.repromptStage,
    actionability: result.actionability,
    traceId: input.traceId,
  };
}

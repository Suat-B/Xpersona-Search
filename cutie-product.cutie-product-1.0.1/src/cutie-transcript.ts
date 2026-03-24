import { looksLikeCutieToolArtifactText } from "./cutie-native-autonomy";
import type { CutieTaskGoal, CutieTranscriptEvent } from "./types";

function trimText(value: string): string {
  return String(value || "").trim();
}

function extractToolNameFromArtifact(raw: string): string {
  const text = trimText(raw);
  if (!text) return "";
  const patterns = [
    /"toolName"\s*:\s*"([^"]+)"/i,
    /"tool_call"\s*:\s*\{[\s\S]*?"name"\s*:\s*"([^"]+)"/i,
    /"tool_calls"\s*:\s*\[[\s\S]*?"name"\s*:\s*"([^"]+)"/i,
    /"name"\s*:\s*"([^"]+)"/i,
    /"tool"\s*:\s*"([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function isLowSignalConversationStatus(text: string): boolean {
  return /^(Cutie is replying|Cutie is finishing the response|Cutie completed the run)\.?$/i.test(trimText(text));
}

function isVisibleTranscriptEvent(event: CutieTranscriptEvent | null | undefined, goal?: CutieTaskGoal | null): boolean {
  if (!event || !trimText(event.text)) return false;
  if (goal === "conversation" && event.kind === "status" && isLowSignalConversationStatus(event.text)) {
    return false;
  }
  return true;
}

function isAssistantTranscriptEvent(event: CutieTranscriptEvent): boolean {
  return event.kind === "assistant_text" || event.kind === "final";
}

function formatTranscriptSectionLines(lines: string[]): string {
  return lines.map((line) => trimText(line)).filter(Boolean).join("\n\n");
}

export function humanizeSuppressedAssistantArtifact(raw: string): string {
  const text = trimText(raw);
  if (!text) return "";
  const toolName = extractToolNameFromArtifact(text);
  if (toolName) {
    return `Recovered \`${toolName}\` action from model output.`;
  }
  if (looksLikeCutieToolArtifactText(text)) {
    return "Recovered a tool action from model output.";
  }
  return "Model emitted an unrecognized tool artifact; Cutie is attempting recovery.";
}

export function buildVisibleTranscriptText(
  events: CutieTranscriptEvent[],
  goal?: CutieTaskGoal | null
): string {
  const rows = (Array.isArray(events) ? events : [])
    .filter((event): event is CutieTranscriptEvent => isVisibleTranscriptEvent(event, goal))
    .map((event) => trimText(event.text));
  return rows.join("\n");
}

export function buildOperationalTranscriptText(
  events: CutieTranscriptEvent[],
  goal?: CutieTaskGoal | null
): string {
  const rows = (Array.isArray(events) ? events : [])
    .filter((event): event is CutieTranscriptEvent => isVisibleTranscriptEvent(event, goal))
    .filter((event) => !isAssistantTranscriptEvent(event))
    .map((event) => trimText(event.text));
  return formatTranscriptSectionLines(rows);
}

export function buildAssistantTranscriptText(
  events: CutieTranscriptEvent[],
  goal?: CutieTaskGoal | null
): string {
  const rows = (Array.isArray(events) ? events : [])
    .filter((event): event is CutieTranscriptEvent => isVisibleTranscriptEvent(event, goal))
    .filter((event) => isAssistantTranscriptEvent(event))
    .map((event) => trimText(event.text));
  return rows.length ? trimText(rows[rows.length - 1] || "") : "";
}

export function hasVisibleOperationalTranscript(
  events: CutieTranscriptEvent[],
  goal?: CutieTaskGoal | null
): boolean {
  return Boolean(buildOperationalTranscriptText(events, goal));
}

export function mergeTranscriptIntoAssistantContent(input: {
  events: CutieTranscriptEvent[];
  assistantContent?: string | null;
  goal?: CutieTaskGoal | null;
}): string {
  const transcriptText = buildOperationalTranscriptText(input.events, input.goal);
  const assistantContent = trimText(input.assistantContent || "") || buildAssistantTranscriptText(input.events, input.goal);
  if (!transcriptText) return assistantContent || buildVisibleTranscriptText(input.events, input.goal);
  if (!hasVisibleOperationalTranscript(input.events, input.goal)) {
    return assistantContent || transcriptText;
  }
  if (!assistantContent) {
    return ["Cutie action log:", transcriptText].filter(Boolean).join("\n\n");
  }
  return ["Cutie action log:", transcriptText, "Cutie response:", assistantContent].filter(Boolean).join("\n\n");
}

type CutieStructuredToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  summary?: string;
};

type CutieStructuredObjectiveOutcome = {
  id: string;
  status: "done" | "blocked";
  note?: string;
};

type CutieArtifactExtractionShape =
  | "tool_call_wrapper"
  | "tool_calls_wrapper"
  | "top_level_tool_name"
  | "top_level_name"
  | "top_level_tool";

export type CutieStructuredTurnResult =
  | {
      response: {
        type: "tool_batch";
        toolCalls: CutieStructuredToolCall[];
      };
      assistantText: string;
      normalizationSource: "upstream_tool_calls" | "streamed_tool_calls" | "text_tool_artifact";
      artifactExtractionShape?: CutieArtifactExtractionShape;
      batchCollapsedToSingleAction?: boolean;
    }
  | {
      response: {
        type: "final";
        text: string;
        objectives?: CutieStructuredObjectiveOutcome[];
      };
      assistantText: string;
      normalizationSource: "plain_final" | "text_tool_artifact";
      artifactExtractionShape?: CutieArtifactExtractionShape;
      batchCollapsedToSingleAction?: boolean;
    };

export type StreamingToolCallAccumulator = {
  id?: string;
  name?: string;
  argumentsText: string;
  summary?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stripCodeFence(raw: string): string {
  const trimmed = String(raw || "").trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function tryParseJson(value: string): unknown | null {
  const normalized = stripCodeFence(value);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    return null;
  }
}

function normalizeObjectiveOutcomes(value: unknown): CutieStructuredObjectiveOutcome[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: CutieStructuredObjectiveOutcome[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const id = String(row.id || "").trim();
    const status = row.status === "done" || row.status === "blocked" ? row.status : null;
    const note = String(row.note || "").trim();
    if (!id || !status) continue;
    rows.push({
      id,
      status,
      ...(note ? { note: note.slice(0, 500) } : {}),
    });
  }
  return rows.length ? rows : undefined;
}

function normalizeFinalCandidate(value: unknown): { text: string; objectives?: CutieStructuredObjectiveOutcome[] } | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;

  // Some models wrap under a nested response object.
  if (record.response && typeof record.response === "object") {
    const nested = normalizeFinalCandidate(record.response);
    if (nested) return nested;
  }

  if (record.tool_call || Array.isArray(record.tool_calls)) return null;

  const type = String(record.type || "").trim().toLowerCase();
  const hasFinalText =
    typeof record.final === "string" ||
    typeof record.text === "string" ||
    typeof record.final_answer === "string";
  const objectives = normalizeObjectiveOutcomes(record.objectives);
  const isExplicitFinal = type === "final" || type === "final_answer";

  if (!isExplicitFinal && !hasFinalText && !objectives?.length) return null;
  if (type && type !== "final" && type !== "final_answer") return null;

  const text =
    typeof record.final === "string"
      ? record.final.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : typeof record.final_answer === "string"
          ? record.final_answer.trim()
        : "";

  return {
    text,
    ...(objectives ? { objectives } : {}),
  };
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = tryParseJson(value.trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return {};
}

function normalizeToolCallCandidate(
  value: unknown,
  index: number,
  allowedToolNames: Set<string>
): CutieStructuredToolCall | null {
  const record = asRecord(value);
  let source = record;
  if (record.tool_call && typeof record.tool_call === "object") {
    source = asRecord(record.tool_call);
  } else if (record.function && typeof record.function === "object") {
    const fn = asRecord(record.function);
    source = {
      id: record.id,
      name: fn.name,
      arguments: fn.arguments,
      summary: record.summary,
    };
  }

  const name = String(source.name || source.toolName || source.tool || "").trim();
  if (!name) return null;
  if (allowedToolNames.size && !allowedToolNames.has(name)) return null;

  const summary = String(source.summary || "").trim();
  return {
    id: String(source.id || `cutie_tool_${index + 1}_${name}`),
    name,
    arguments: normalizeToolArguments(source.arguments ?? source.args ?? source.input),
    ...(summary ? { summary } : {}),
  };
}

function detectArtifactExtractionShape(value: unknown): CutieArtifactExtractionShape | null {
  const record = asRecord(value);
  if (Array.isArray(record.tool_calls)) return "tool_calls_wrapper";
  if (record.tool_call && typeof record.tool_call === "object") return "tool_call_wrapper";
  if (typeof record.toolName === "string" && record.toolName.trim()) return "top_level_tool_name";
  if (typeof record.name === "string" && record.name.trim()) return "top_level_name";
  if (typeof record.tool === "string" && record.tool.trim()) return "top_level_tool";
  if (record.function && typeof record.function === "object") return "tool_call_wrapper";
  return null;
}

function extractJsonPayloadsFromText(
  text: string
): Array<{ payload: unknown; artifactExtractionShape?: CutieArtifactExtractionShape }> {
  const payloads: Array<{ payload: unknown; artifactExtractionShape?: CutieArtifactExtractionShape }> = [];
  const matches = [...String(text || "").matchAll(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/gi)];
  for (const match of matches) {
    const parsed = tryParseJson(String(match[1] || "").trim());
    if (parsed) {
      payloads.push({
        payload: parsed,
        artifactExtractionShape: detectArtifactExtractionShape(parsed) || "tool_call_wrapper",
      });
    }
  }
  if (payloads.length) return payloads;

  const trimmed = String(text || "").trim();
  if (!trimmed) return payloads;
  const parsed = tryParseJson(trimmed);
  if (parsed) {
    payloads.push({
      payload: parsed,
      ...(detectArtifactExtractionShape(parsed) ? { artifactExtractionShape: detectArtifactExtractionShape(parsed) || undefined } : {}),
    });
  }
  return payloads;
}

function isToolArtifactRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    record.tool_call ||
      Array.isArray(record.tool_calls) ||
      (typeof record.toolName === "string" && record.toolName.trim()) ||
      (typeof record.name === "string" && record.name.trim()) ||
      (typeof record.tool === "string" && record.tool.trim())
  );
}

function findStructuredArtifactStart(text: string): number {
  const source = String(text || "");
  if (!source.trim()) return -1;

  const leadingWhitespace = source.length - source.trimStart().length;
  const trimmed = source.trimStart();
  const parsedTopLevel = tryParseJson(trimmed);
  const parsedRecord = asRecord(parsedTopLevel);
  if (isToolArtifactRecord(parsedRecord) || normalizeFinalCandidate(parsedTopLevel)) {
    return leadingWhitespace;
  }

  const patterns = [
    /\[TOOL_CALL\]/i,
    /[\{\[]\s*"tool_call"\s*:/i,
    /[\{\[]\s*"tool_calls"\s*:/i,
    /[\{\[]\s*"toolName"\s*:\s*"[^"]+"/i,
    /[\{\[]\s*"type"\s*:\s*"(?:tool_call|tool_calls|tool_batch|final|final_answer)"/i,
  ];
  let best = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match?.length) continue;
    if (best < 0 || match.index < best) {
      best = match.index;
    }
  }
  return best;
}

export function stripCutieToolArtifactText(text: string): string {
  const withoutBlocks = String(text || "").replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, "");
  const trimmed = withoutBlocks.trim();
  if (!trimmed) return "";
  const artifactStart = findStructuredArtifactStart(trimmed);
  if (artifactStart < 0) return trimmed;
  return trimmed.slice(0, artifactStart).trimEnd();
}

export function extractCutieToolCallsFromText(
  text: string,
  allowedToolNames: Iterable<string>,
  maxToolsPerBatch = 1
): { toolCalls: CutieStructuredToolCall[]; artifactExtractionShape?: CutieArtifactExtractionShape } {
  const allowed = new Set(Array.from(allowedToolNames));
  const calls: CutieStructuredToolCall[] = [];
  let artifactExtractionShape: CutieArtifactExtractionShape | undefined;
  const payloads = extractJsonPayloadsFromText(text);
  for (const payload of payloads) {
    const record = asRecord(payload.payload);
    const items = Array.isArray(record.tool_calls)
      ? record.tool_calls
      : record.tool_call
        ? [record.tool_call]
        : [payload.payload];
    for (const item of items) {
      const normalized = normalizeToolCallCandidate(item, calls.length, allowed);
      if (!normalized) continue;
      artifactExtractionShape = artifactExtractionShape || payload.artifactExtractionShape || detectArtifactExtractionShape(payload.payload) || undefined;
      calls.push(normalized);
      if (calls.length >= maxToolsPerBatch) {
        return { toolCalls: calls, ...(artifactExtractionShape ? { artifactExtractionShape } : {}) };
      }
    }
  }
  return { toolCalls: calls, ...(artifactExtractionShape ? { artifactExtractionShape } : {}) };
}

function extractCutieFinalFromText(
  text: string
): { text: string; objectives?: CutieStructuredObjectiveOutcome[] } | null {
  const payloads = extractJsonPayloadsFromText(text);
  for (const payload of payloads) {
    const direct = normalizeFinalCandidate(payload.payload);
    if (direct) return direct;
  }
  return null;
}

export function extractCutieToolCallsFromUpstream(
  toolCalls: unknown,
  allowedToolNames: Set<string>,
  maxToolsPerBatch: number
): CutieStructuredToolCall[] {
  if (!Array.isArray(toolCalls)) return [];
  const calls: CutieStructuredToolCall[] = [];
  for (const item of toolCalls) {
    const normalized = normalizeToolCallCandidate(item, calls.length, allowedToolNames);
    if (!normalized) continue;
    calls.push(normalized);
    if (calls.length >= maxToolsPerBatch) break;
  }
  return calls;
}

export function mergeStreamingToolCalls(acc: StreamingToolCallAccumulator[], toolCalls: unknown): void {
  if (!Array.isArray(toolCalls)) return;
  for (const item of toolCalls) {
    const record = asRecord(item);
    const requestedIndex = Number(record.index);
    const index =
      Number.isFinite(requestedIndex) && requestedIndex >= 0 ? Math.floor(requestedIndex) : acc.length;
    if (!acc[index]) {
      acc[index] = {
        argumentsText: "",
      };
    }
    const bucket = acc[index];
    if (typeof record.id === "string" && record.id.trim()) {
      bucket.id = record.id.trim();
    }
    if (typeof record.summary === "string" && record.summary.trim()) {
      bucket.summary = record.summary.trim();
    }
    const fn = asRecord(record.function);
    const name = String(fn.name || record.name || "").trim();
    if (name) {
      bucket.name = name;
    }
    const argsChunk = String(fn.arguments || record.arguments || "");
    if (argsChunk) {
      bucket.argumentsText += argsChunk;
    }
  }
}

export function finalizeStreamingToolCalls(
  acc: StreamingToolCallAccumulator[],
  allowedToolNames: Set<string>,
  maxToolsPerBatch: number
): CutieStructuredToolCall[] {
  const calls: CutieStructuredToolCall[] = [];
  for (const item of acc) {
    if (!item) continue;
    const normalized = normalizeToolCallCandidate(
      {
        id: item.id,
        name: item.name,
        arguments: item.argumentsText,
        summary: item.summary,
      },
      calls.length,
      allowedToolNames
    );
    if (!normalized) continue;
    calls.push(normalized);
    if (calls.length >= maxToolsPerBatch) break;
  }
  return calls;
}

export function normalizeStructuredCutieTurnResult(input: {
  assistantText: string;
  upstreamToolCalls?: unknown;
  allowedToolNames: Iterable<string>;
  maxToolsPerBatch?: number;
  streamedToolCalls?: boolean;
}): CutieStructuredTurnResult {
  const maxToolsPerBatch = Math.max(1, input.maxToolsPerBatch ?? 1);
  const allowed = new Set(Array.from(input.allowedToolNames));
  const assistantText = stripCutieToolArtifactText(input.assistantText);
  const upstreamCalls = extractCutieToolCallsFromUpstream(input.upstreamToolCalls, allowed, maxToolsPerBatch);
  if (upstreamCalls.length) {
    const canonicalCalls = upstreamCalls.slice(0, 1);
    return {
      response: {
        type: "tool_batch",
        toolCalls: canonicalCalls,
      },
      assistantText,
      normalizationSource: input.streamedToolCalls ? "streamed_tool_calls" : "upstream_tool_calls",
      batchCollapsedToSingleAction: upstreamCalls.length > canonicalCalls.length,
    };
  }

  const textExtraction = extractCutieToolCallsFromText(input.assistantText, allowed, maxToolsPerBatch);
  if (textExtraction.toolCalls.length) {
    const canonicalCalls = textExtraction.toolCalls.slice(0, 1);
    return {
      response: {
        type: "tool_batch",
        toolCalls: canonicalCalls,
      },
      assistantText,
      normalizationSource: "text_tool_artifact",
      batchCollapsedToSingleAction: textExtraction.toolCalls.length > canonicalCalls.length,
      ...(textExtraction.artifactExtractionShape
        ? { artifactExtractionShape: textExtraction.artifactExtractionShape }
        : {}),
    };
  }
  const finalExtraction = extractCutieFinalFromText(input.assistantText);
  if (finalExtraction) {
    return {
      response: {
        type: "final",
        text: finalExtraction.text,
        ...(finalExtraction.objectives ? { objectives: finalExtraction.objectives } : {}),
      },
      assistantText: finalExtraction.text,
      normalizationSource: "text_tool_artifact",
    };
  }

  return {
    response: {
      type: "final",
      text: assistantText,
    },
    assistantText,
    normalizationSource: "plain_final",
  };
}

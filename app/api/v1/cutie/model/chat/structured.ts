type CutieStructuredToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  summary?: string;
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
      };
      assistantText: string;
      normalizationSource: "plain_final";
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

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
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

function extractToolPayloadsFromText(text: string): Array<{ payload: unknown; artifactExtractionShape?: CutieArtifactExtractionShape }> {
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

export function stripCutieToolArtifactText(text: string): string {
  const withoutBlocks = String(text || "").replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, "").trim();
  if (!withoutBlocks) return "";
  const parsed = tryParseJson(withoutBlocks);
  const record = asRecord(parsed);
  if (
    record.tool_call ||
    Array.isArray(record.tool_calls) ||
    (typeof record.toolName === "string" && record.toolName.trim()) ||
    (typeof record.name === "string" && record.name.trim()) ||
    (typeof record.tool === "string" && record.tool.trim())
  ) {
    return "";
  }
  return withoutBlocks;
}

export function extractCutieToolCallsFromText(
  text: string,
  allowedToolNames: Iterable<string>,
  maxToolsPerBatch = 1
): { toolCalls: CutieStructuredToolCall[]; artifactExtractionShape?: CutieArtifactExtractionShape } {
  const allowed = new Set(Array.from(allowedToolNames));
  const calls: CutieStructuredToolCall[] = [];
  let artifactExtractionShape: CutieArtifactExtractionShape | undefined;
  const payloads = extractToolPayloadsFromText(text);
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

  return {
    response: {
      type: "final",
      text: assistantText,
    },
    assistantText,
    normalizationSource: "plain_final",
  };
}

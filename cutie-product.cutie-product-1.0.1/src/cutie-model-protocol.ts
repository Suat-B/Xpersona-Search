import type {
  CutieArtifactExtractionShape,
  CutieFallbackModeUsed,
  CutieModelAdapterKind,
  CutieModelCapabilityProfile,
  CutieNormalizationTier,
  CutieNormalizationSource,
  CutieOrchestratorContractVersion,
  CutiePortabilityMode,
  CutieProtocolMode,
  CutieStructuredResponse,
  CutieToolName,
} from "./types";

const KNOWN_TOOL_NAMES = new Set<CutieToolName>([
  "list_files",
  "read_file",
  "search_workspace",
  "get_diagnostics",
  "git_status",
  "git_diff",
  "desktop_capture_screen",
  "desktop_get_active_window",
  "desktop_list_windows",
  "create_checkpoint",
  "patch_file",
  "write_file",
  "mkdir",
  "run_command",
  "desktop_open_app",
  "desktop_open_url",
  "desktop_focus_window",
  "desktop_click",
  "desktop_type",
  "desktop_keypress",
  "desktop_scroll",
  "desktop_wait",
]);

type ParsedStreamEvent =
  | { type: "assistant_delta"; text: string }
  | {
      type: "meta";
      usage?: Record<string, unknown> | null;
      model?: string;
      modelAdapter?: CutieModelAdapterKind;
      modelCapabilities?: CutieModelCapabilityProfile;
      protocolMode?: CutieProtocolMode;
      orchestratorContractVersion?: CutieOrchestratorContractVersion;
      portabilityMode?: CutiePortabilityMode;
      transportModeUsed?: CutieProtocolMode;
      normalizationSource?: CutieNormalizationSource;
      normalizationTier?: CutieNormalizationTier;
      artifactExtractionShape?: CutieArtifactExtractionShape;
      fallbackModeUsed?: CutieFallbackModeUsed;
      batchCollapsedToSingleAction?: boolean;
    }
  | { type: "response"; response: CutieStructuredResponse }
  | { type: "noop" }
  | { type: "error"; message: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asToolName(value: unknown): CutieToolName {
  const name = String(value || "").trim() as CutieToolName;
  if (!KNOWN_TOOL_NAMES.has(name)) {
    throw new CutieStructuredProtocolError(`Unknown Cutie tool "${String(value || "")}".`);
  }
  return name;
}

function normalizeObjectives(value: unknown): Array<{ id: string; status: "done" | "blocked"; note?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value
    .map((item) => {
      const record = asRecord(item);
      const id = String(record.id || "").trim();
      const status = record.status === "done" || record.status === "blocked" ? record.status : null;
      const note = String(record.note || "").trim();
      if (!id || !status) return null;
      return {
        id,
        status,
        ...(note ? { note } : {}),
      };
    })
    .filter((item): item is { id: string; status: "done" | "blocked"; note?: string } => Boolean(item));
  return rows.length ? rows : undefined;
}

function normalizeToolCall(value: unknown, index: number): { name: CutieToolName; arguments: Record<string, unknown>; summary?: string } {
  const record = asRecord(value);
  const args = asRecord(record.arguments);
  const summary = String(record.summary || "").trim();
  return {
    name: asToolName(record.name),
    arguments: args,
    ...(summary ? { summary } : {}),
  };
}

function collapseToolCallsToCanonicalAction(
  toolCalls: Array<{ name: CutieToolName; arguments: Record<string, unknown>; summary?: string }>
): { name: CutieToolName; arguments: Record<string, unknown>; summary?: string } {
  return toolCalls[0];
}

export class CutieStructuredProtocolError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function normalizeProtocolResponsePayload(payload: unknown): CutieStructuredResponse {
  const record = asRecord(payload);
  const nested = record.response && typeof record.response === "object" ? record.response : payload;
  const row = asRecord(nested);
  const type = String(row.type || "").trim();

  if (type === "final") {
    const text = String(row.text || row.final || "").trim();
    return {
      type: "final",
      final: text,
      ...(normalizeObjectives(row.objectives) ? { objectives: normalizeObjectives(row.objectives) } : {}),
    };
  }

  if (type === "tool_batch") {
    const toolCalls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
    if (!toolCalls.length) {
      throw new CutieStructuredProtocolError("cutie_tools_v2 tool_batch payload is missing toolCalls.");
    }
    const normalized = toolCalls.map((item, index) => normalizeToolCall(item, index));
    return {
      type: "tool_call",
      tool_call: collapseToolCallsToCanonicalAction(normalized),
    };
  }

  if (type === "tool_call") {
    const toolCall = row.tool_call && typeof row.tool_call === "object" ? row.tool_call : row;
    return {
      type: "tool_call",
      tool_call: normalizeToolCall(toolCall, 0),
    };
  }

  if (type === "tool_calls") {
    const toolCalls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    if (!toolCalls.length) {
      throw new CutieStructuredProtocolError("cutie_tools_v2 tool_calls payload is missing tool_calls.");
    }
    return {
      type: "tool_call",
      tool_call: collapseToolCallsToCanonicalAction(toolCalls.map((item, index) => normalizeToolCall(item, index))),
    };
  }

  throw new CutieStructuredProtocolError(`Unknown cutie_tools_v2 response type "${type || "missing"}".`);
}

export function parseStructuredStreamEvent(event: string, data: unknown): ParsedStreamEvent {
  const normalizedEvent = String(event || "").trim();
  if (
    normalizedEvent === "ack" ||
    normalizedEvent === "ping" ||
    normalizedEvent === "heartbeat" ||
    normalizedEvent === "keepalive" ||
    normalizedEvent === "status" ||
    normalizedEvent === "progress"
  ) {
    return { type: "noop" };
  }
  if (normalizedEvent === "assistant_delta" || normalizedEvent === "delta") {
    const payload = asRecord(data);
    const text = String(payload.text || payload.delta || payload.content || "");
    if (!text) {
      throw new CutieStructuredProtocolError(`${normalizedEvent} is missing text.`);
    }
    return { type: "assistant_delta", text };
  }
  if (normalizedEvent === "meta") {
    const payload = asRecord(data);
    return {
      type: "meta",
      ...(payload.usage && typeof payload.usage === "object" ? { usage: payload.usage as Record<string, unknown> } : {}),
      ...(typeof payload.model === "string" && payload.model.trim() ? { model: payload.model.trim() } : {}),
      ...(typeof payload.modelAdapter === "string"
        ? { modelAdapter: payload.modelAdapter.trim() as CutieModelAdapterKind }
        : {}),
      ...(payload.modelCapabilities && typeof payload.modelCapabilities === "object"
        ? { modelCapabilities: payload.modelCapabilities as CutieModelCapabilityProfile }
        : {}),
      ...(typeof payload.protocolMode === "string"
        ? { protocolMode: payload.protocolMode.trim() as CutieProtocolMode }
        : {}),
      ...(typeof payload.orchestratorContractVersion === "string"
        ? {
            orchestratorContractVersion: payload.orchestratorContractVersion.trim() as CutieOrchestratorContractVersion,
          }
        : {}),
      ...(typeof payload.portabilityMode === "string"
        ? { portabilityMode: payload.portabilityMode.trim() as CutiePortabilityMode }
        : {}),
      ...(typeof payload.transportModeUsed === "string"
        ? { transportModeUsed: payload.transportModeUsed.trim() as CutieProtocolMode }
        : {}),
      ...(typeof payload.normalizationSource === "string"
        ? { normalizationSource: payload.normalizationSource.trim() as CutieNormalizationSource }
        : {}),
      ...(typeof payload.normalizationTier === "string"
        ? { normalizationTier: payload.normalizationTier.trim() as CutieNormalizationTier }
        : {}),
      ...(typeof payload.artifactExtractionShape === "string"
        ? { artifactExtractionShape: payload.artifactExtractionShape.trim() as CutieArtifactExtractionShape }
        : {}),
      ...(typeof payload.fallbackModeUsed === "string"
        ? { fallbackModeUsed: payload.fallbackModeUsed.trim() as CutieFallbackModeUsed }
        : {}),
      ...(typeof payload.batchCollapsedToSingleAction === "boolean"
        ? { batchCollapsedToSingleAction: payload.batchCollapsedToSingleAction }
        : {}),
    };
  }
  if (normalizedEvent === "final" || normalizedEvent === "tool_batch") {
    return {
      type: "response",
      response: normalizeProtocolResponsePayload({
        type: normalizedEvent,
        ...asRecord(data),
      }),
    };
  }
  if (normalizedEvent === "error") {
    const message = String(asRecord(data).message || "").trim() || "Cutie model request failed.";
    return { type: "error", message };
  }
  throw new CutieStructuredProtocolError(`Unknown SSE event "${normalizedEvent || "missing"}" in cutie_tools_v2 stream.`);
}

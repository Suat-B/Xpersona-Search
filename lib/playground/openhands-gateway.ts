import type {
  PlaygroundAdapter,
  PlaygroundToolName,
  ToolCallContract,
  ToolResultContract,
} from "@/lib/playground/contracts";
import type { PlaygroundResolvedModelSelection } from "@/lib/playground/model-registry";
import { resolvePlaygroundModelToken } from "@/lib/playground/model-registry";
import type {
  AssistContextSelection,
  AssistConversationTurn,
  AssistPlan,
  AssistRuntimeInput,
  AssistTargetInference,
} from "@/lib/playground/orchestration";

type GatewayToolTraceEntry = {
  status: string;
  summary: string;
  toolCall?: { name?: string };
  toolResult?: ToolResultContract;
};

type OpenHandsGatewayRunRequest = {
  request: AssistRuntimeInput;
  tom?: {
    enabled: boolean;
    userKey?: string;
    sessionId?: string;
    traceId?: string;
  };
  targetInference: AssistTargetInference;
  contextSelection: AssistContextSelection;
  fallbackPlan: AssistPlan;
  toolTrace: GatewayToolTraceEntry[];
  loopSummary: { stepCount: number; mutationCount: number; repairCount: number };
  availableTools: PlaygroundToolName[];
  latestToolResult?: ToolResultContract | null;
  repairDirective?: {
    stage:
      | "post_inspection_mutation_required"
      | "target_path_repair"
      | "patch_repair"
      | "single_file_rewrite"
      | "pine_specialization";
    reason: string;
  } | null;
  modelSelection: PlaygroundResolvedModelSelection;
};

export type OpenHandsGatewayTurn = {
  runId: string;
  adapter: PlaygroundAdapter;
  final: string;
  logs: string[];
  toolCall?: ToolCallContract;
  version?: string | null;
};

export type OpenHandsGatewayHealth =
  | {
      status: "healthy";
      message: string;
      gatewayUrl: string;
    }
  | {
      status: "missing_config" | "unauthorized" | "unreachable";
      message: string;
      gatewayUrl?: string;
      details?: string;
    };

export class OpenHandsGatewayError extends Error {
  constructor(
    message: string,
    readonly code:
      | "OPENHANDS_GATEWAY_MISSING_CONFIG"
      | "OPENHANDS_GATEWAY_UNAUTHORIZED"
      | "OPENHANDS_GATEWAY_UNREACHABLE"
      | "OPENHANDS_GATEWAY_INVALID_RESPONSE",
    readonly status: number,
    readonly details?: string
  ) {
    super(message);
    this.name = "OpenHandsGatewayError";
  }
}

/** Node/undici often throws `TypeError: fetch failed` with syscall detail on `cause`. */
function extractFetchFailureDetail(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [];
  if (error.message) parts.push(error.message);
  const c = (error as Error & { cause?: unknown }).cause;
  if (c instanceof Error && c.message && !parts.includes(c.message)) {
    parts.push(c.message);
  }
  if (c && typeof c === "object" && c !== null && "code" in c) {
    const code = (c as { code?: string }).code;
    if (code) parts.push(`errno=${code}`);
  }
  return parts.length ? parts.join(" | ") : "unknown error";
}

function shortGatewayUrl(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return fullUrl.slice(0, 160);
  }
}

function describeGatewayFetchFailure(fullUrl: string, error: unknown): string {
  const detail = extractFetchFailureDetail(error);
  const target = shortGatewayUrl(fullUrl);
  return [
    `Could not connect to OpenHands gateway at ${target} (${detail}).`,
    "Set OPENHANDS_GATEWAY_URL to the gateway base URL (no trailing slash). Try http://127.0.0.1:8010 if localhost misbehaves.",
    "If the Next.js app runs inside Docker, use http://host.docker.internal:8010 (Windows/Mac) instead of localhost.",
    "From repo root: npm run openhands:gateway:docker — then curl http://127.0.0.1:8010/health on the same machine as Next.",
  ].join(" ");
}

function compactWhitespace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sanitizeRelativePath(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

function normalizeToolCall(value: unknown, availableTools: PlaygroundToolName[]): ToolCallContract | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = String(record.name || "").trim() as PlaygroundToolName;
  if (!availableTools.includes(name)) return null;

  const args =
    record.arguments && typeof record.arguments === "object"
      ? ({ ...(record.arguments as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (typeof args.path === "string") {
    const normalizedPath = sanitizeRelativePath(args.path);
    if (normalizedPath) {
      args.path = normalizedPath;
    } else if (name === "read_file" || name === "edit" || name === "write_file" || name === "mkdir") {
      return null;
    } else {
      delete args.path;
    }
  }

  if (name === "write_file" && typeof args.content === "string") {
    args.content = decodeLikelyEscapedMultilineText(args.content);
  }

  if (name === "edit" && typeof args.patch === "string") {
    args.patch = decodeLikelyEscapedMultilineText(args.patch);
  }

  const id = compactWhitespace(String(record.id || `openhands_${Date.now().toString(36)}`)).slice(0, 120);
  const kind =
    record.kind === "observe" || record.kind === "mutate" || record.kind === "command"
      ? record.kind
      : name === "edit" || name === "write_file" || name === "mkdir" || name === "create_checkpoint"
        ? "mutate"
        : name === "run_command"
          ? "command"
          : "observe";

  return {
    id,
    name,
    arguments: args,
    kind,
    summary: typeof record.summary === "string" ? record.summary.slice(0, 4_000) : undefined,
  };
}

function decodeLikelyEscapedMultilineText(value: string): string {
  const raw = String(value || "");
  if (!raw || /[\r\n]/.test(raw) || !/\\n|\\r|\\t|\\"/.test(raw)) return raw;
  const decoded = raw
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
  return decoded.includes("\n") || decoded !== raw ? decoded : raw;
}

function extractBalancedJsonObject(text: string): string | null {
  const input = String(text || "");
  const start = input.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

function parseJsonCandidate(text: string): Record<string, unknown> | null {
  const normalized = String(text || "").trim();
  const candidates = [
    normalized,
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(normalized)?.[1] || "",
    extractBalancedJsonObject(normalized) || "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function extractGatewayToolTurn(
  value: unknown,
  availableTools: PlaygroundToolName[],
  depth = 0
): { final: string; toolCall?: ToolCallContract } | null {
  if (depth > 3 || value == null) return null;

  if (typeof value === "string") {
    const parsed = parseJsonCandidate(value);
    if (!parsed) return null;
    return extractGatewayToolTurn(parsed, availableTools, depth + 1);
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const toolCall = normalizeToolCall(record.toolCall, availableTools);
  if (toolCall) {
    const nested =
      typeof record.final === "string" ? extractGatewayToolTurn(record.final, availableTools, depth + 1) : null;
    return {
      final:
        typeof record.final === "string"
          ? record.final.trim()
          : nested?.final || "",
      toolCall: nested?.toolCall || toolCall,
    };
  }

  for (const candidate of [record.final, record.message, record.content, record.response]) {
    const nested = extractGatewayToolTurn(candidate, availableTools, depth + 1);
    if (nested?.toolCall) return nested;
  }

  if (typeof record.final === "string" && record.final.trim()) {
    return { final: record.final.trim() };
  }

  return null;
}

function getOpenHandsGatewayUrl(): string | null {
  const value = String(process.env.OPENHANDS_GATEWAY_URL || "").trim();
  return value ? value.replace(/\/+$/, "") : null;
}

function getOpenHandsGatewayApiKey(): string | null {
  const value = String(process.env.OPENHANDS_GATEWAY_API_KEY || "").trim();
  return value || null;
}

/** OpenHands runs LLM turns that can take minutes; avoid client-side fetch closing the socket early. */
function getOpenHandsGatewayFetchTimeoutMs(): number {
  const raw = String(process.env.OPENHANDS_GATEWAY_FETCH_TIMEOUT_MS || "").trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 10_000) return Math.min(n, 600_000);
  return 300_000;
}

function gatewayPostInit(): { signal: AbortSignal | undefined } {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(getOpenHandsGatewayFetchTimeoutMs()) };
  }
  return { signal: undefined };
}

function buildGatewayPayload(input: OpenHandsGatewayRunRequest): Record<string, unknown> {
  const token = resolvePlaygroundModelToken(input.modelSelection.resolvedEntry);
  return {
    protocol: "xpersona_openhands_gateway_v1",
    request: {
      mode: input.request.mode,
      task: input.request.task,
      conversationHistory: (input.request.conversationHistory || []).map((turn: AssistConversationTurn) => ({
        role: turn.role,
        content: turn.content,
      })),
      retrievalHints: input.request.retrievalHints || null,
      context: input.request.context || null,
      clientTrace: input.request.clientTrace || null,
    },
    tom: input.tom
      ? {
          enabled: input.tom.enabled,
          userKey: input.tom.userKey || null,
          sessionId: input.tom.sessionId || null,
          traceId: input.tom.traceId || null,
        }
      : null,
    targetInference: input.targetInference,
    contextSelection: input.contextSelection,
    fallbackPlan: input.fallbackPlan,
    toolTrace: input.toolTrace,
    loopSummary: input.loopSummary,
    availableTools: input.availableTools,
    latestToolResult: input.latestToolResult || null,
    repairDirective: input.repairDirective || null,
    model: {
      alias: input.modelSelection.resolvedAlias,
      requested: input.modelSelection.requested,
      model: input.modelSelection.resolvedEntry.model,
      provider: input.modelSelection.resolvedEntry.provider,
      baseUrl: input.modelSelection.resolvedEntry.baseUrl,
      authSource: input.modelSelection.resolvedEntry.authSource,
      apiKey: token,
      capabilities: input.modelSelection.resolvedEntry.capabilities,
    },
  };
}

async function requestGatewayTurn(
  url: string,
  body: Record<string, unknown>,
  availableTools: PlaygroundToolName[]
): Promise<OpenHandsGatewayTurn> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getOpenHandsGatewayApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const { signal } = gatewayPostInit();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new OpenHandsGatewayError(
      describeGatewayFetchFailure(url, error),
      "OPENHANDS_GATEWAY_UNREACHABLE",
      503,
      extractFetchFailureDetail(error)
    );
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = raw || response.statusText || "request failed";
    if (response.status === 401 || response.status === 403) {
      throw new OpenHandsGatewayError(
        "OpenHands is configured but rejected the gateway request. Check OPENHANDS_GATEWAY_API_KEY and gateway auth.",
        "OPENHANDS_GATEWAY_UNAUTHORIZED",
        response.status,
        detail
      );
    }
    if (response.status === 502) {
      try {
        const parsed = JSON.parse(raw) as { error?: string; details?: string };
        if (typeof parsed?.error === "string" && parsed.error.trim()) {
          detail = parsed.details?.trim() ? `${parsed.error.trim()}: ${parsed.details.trim()}` : parsed.error.trim();
        }
      } catch {
        /* keep raw */
      }
      throw new OpenHandsGatewayError(
        `OpenHands gateway reported a turn error: ${detail}`,
        "OPENHANDS_GATEWAY_INVALID_RESPONSE",
        502,
        raw
      );
    }
    throw new OpenHandsGatewayError(
      "OpenHands is unavailable right now. Verify the gateway URL and make sure the OpenHands service is running.",
      "OPENHANDS_GATEWAY_UNREACHABLE",
      503,
      detail
    );
  }

  const parsed = (await response.json()) as Record<string, unknown>;
  const runId = compactWhitespace(String(parsed.runId || parsed.id || ""));
  if (!runId) {
    throw new OpenHandsGatewayError(
      "OpenHands returned an invalid response without a run identifier.",
      "OPENHANDS_GATEWAY_INVALID_RESPONSE",
      502
    );
  }

  const adapter =
    parsed.adapter === "native_tools" || parsed.adapter === "text_actions" || parsed.adapter === "deterministic_batch"
      ? parsed.adapter
      : "text_actions";
  const recovered = extractGatewayToolTurn(parsed.final, availableTools);
  const normalizedToolCall = normalizeToolCall(parsed.toolCall, availableTools);
  const toolCall = normalizedToolCall || recovered?.toolCall || null;
  const final =
    typeof parsed.final === "string"
      ? toolCall && recovered?.toolCall
        ? recovered.final
        : parsed.final.trim()
      : recovered?.final || "";
  const logs = Array.isArray(parsed.logs)
    ? parsed.logs.filter((value): value is string => typeof value === "string")
    : [];
  if (!normalizedToolCall && recovered?.toolCall) {
    logs.push("repair=final_toolcall_recovered");
  }

  return {
    runId,
    adapter,
    final,
    toolCall: toolCall || undefined,
    logs,
    version: typeof parsed.version === "string" ? parsed.version.trim() : null,
  };
}

export function isOpenHandsGatewayEnabled(): boolean {
  return Boolean(getOpenHandsGatewayUrl());
}

export async function startOpenHandsGatewayRun(input: OpenHandsGatewayRunRequest): Promise<OpenHandsGatewayTurn> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    throw new OpenHandsGatewayError(
      "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL before using hosted coding orchestration.",
      "OPENHANDS_GATEWAY_MISSING_CONFIG",
      503
    );
  }
  return requestGatewayTurn(`${baseUrl}/v1/runs/start`, buildGatewayPayload(input), input.availableTools);
}

export async function continueOpenHandsGatewayRun(input: {
  runId: string;
  payload: OpenHandsGatewayRunRequest;
}): Promise<OpenHandsGatewayTurn> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    throw new OpenHandsGatewayError(
      "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL before using hosted coding orchestration.",
      "OPENHANDS_GATEWAY_MISSING_CONFIG",
      503
    );
  }
  return requestGatewayTurn(
    `${baseUrl}/v1/runs/${encodeURIComponent(input.runId)}/continue`,
    buildGatewayPayload(input.payload),
    input.payload.availableTools
  );
}

export async function getOpenHandsGatewayHealth(): Promise<OpenHandsGatewayHealth> {
  const baseUrl = getOpenHandsGatewayUrl();
  if (!baseUrl) {
    return {
      status: "missing_config",
      message: "OpenHands is not configured. Set OPENHANDS_GATEWAY_URL.",
    };
  }

  const headers: Record<string, string> = {};
  const apiKey = getOpenHandsGatewayApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      headers,
    });
    if (response.ok) {
      return {
        status: "healthy",
        message: "OpenHands is connected.",
        gatewayUrl: baseUrl,
      };
    }

    const raw = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      return {
        status: "unauthorized",
        message: "OpenHands rejected the health check. Check gateway auth.",
        gatewayUrl: baseUrl,
        details: raw || response.statusText,
      };
    }

    return {
      status: "unreachable",
      message: "OpenHands did not respond successfully.",
      gatewayUrl: baseUrl,
      details: raw || response.statusText,
    };
  } catch (error) {
    const healthUrl = `${baseUrl}/health`;
    return {
      status: "unreachable",
      message: describeGatewayFetchFailure(healthUrl, error),
      gatewayUrl: baseUrl,
      details: extractFetchFailureDetail(error),
    };
  }
}

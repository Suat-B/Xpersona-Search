import { AuthHeadersInput, requestJson, requestSse, SseEvent } from "./http.js";
import { AssistMode, AssistRunEnvelope, BillingCycle, PlanTier, ToolResult } from "./types.js";

type ClientOptions = {
  baseUrl: string;
  auth: AuthHeadersInput;
};

type AssistInput = {
  task: string;
  mode: AssistMode;
  model?: string;
  reasoning?: string;
  historySessionId?: string;
  stream?: boolean;
  tom?: {
    enabled?: boolean;
  };
  mcp?: {
    mcpServers: Record<string, Record<string, unknown>>;
  };
};

type ExecuteAction =
  | { type: "command"; command: string; cwd?: string; timeoutMs?: number }
  | { type: "edit"; path: string; patch?: string; diff?: string }
  | { type: "rollback"; snapshotId: string };

type IndexChunk = {
  pathHash: string;
  chunkHash: string;
  pathDisplay: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type HostedAssistMode = "auto" | "plan" | "yolo";

export function toHostedAssistMode(mode: AssistMode): HostedAssistMode {
  if (mode === "generate" || mode === "debug") return "yolo";
  return mode;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 15))}\n...[truncated]`;
}

function sanitizeToolResultForContinue(toolResult: ToolResult): ToolResult {
  const next: ToolResult = {
    ...toolResult,
    summary: truncateText(toolResult.summary, 20_000) || toolResult.summary,
    ...(typeof toolResult.error === "string" ? { error: truncateText(toolResult.error, 4_000) } : {}),
  };
  if (toolResult.data && typeof toolResult.data === "object") {
    const data = { ...toolResult.data } as Record<string, unknown>;
    if (typeof data.stdout === "string") data.stdout = truncateText(data.stdout, 8_000) || "";
    if (typeof data.stderr === "string") data.stderr = truncateText(data.stderr, 8_000) || "";
    if (typeof data.content === "string") data.content = truncateText(data.content, 16_000) || "";
    next.data = data;
  }
  return next;
}

export class PlaygroundClient {
  private readonly baseUrl: string;
  private auth: AuthHeadersInput;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.auth = options.auth;
  }

  setAuth(auth: AuthHeadersInput): void {
    this.auth = auth;
  }

  async createSession(title?: string, mode?: AssistMode): Promise<string | null> {
    const res = await requestJson<{ success: true; data: { id: string } }>({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/sessions",
      method: "POST",
      body: { title, mode: mode ? toHostedAssistMode(mode) : undefined },
    });
    return res.data?.id ?? null;
  }

  async assistStream(input: AssistInput, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void> {
    await requestSse({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/assist",
      body: {
        task: input.task,
        mode: toHostedAssistMode(input.mode),
        model: input.model || "Binary IDE",
        stream: input.stream ?? true,
        historySessionId: input.historySessionId,
        ...(input.tom ? { tom: input.tom } : {}),
        ...(input.mcp ? { mcp: input.mcp } : {}),
        contextBudget: {
          strategy: "hybrid",
          maxTokens: 16384,
        },
      },
      onEvent,
    });
  }

  async assist(input: AssistInput): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/assist",
      method: "POST",
      body: {
        task: input.task,
        mode: toHostedAssistMode(input.mode),
        model: input.model || "Binary IDE",
        stream: false,
        historySessionId: input.historySessionId,
        ...(input.tom ? { tom: input.tom } : {}),
        ...(input.mcp ? { mcp: input.mcp } : {}),
      },
    });
  }

  async listSessions(limit = 20): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: `/api/v1/playground/sessions?limit=${encodeURIComponent(String(limit))}`,
      method: "GET",
    });
  }

  async getSessionMessages(sessionId: string, includeAgentEvents = true): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: `/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=${
        includeAgentEvents ? "true" : "false"
      }`,
      method: "GET",
    });
  }

  async replay(sessionId: string, workspaceFingerprint: string, mode: AssistMode = "plan"): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/replay",
      method: "POST",
      body: {
        sessionId,
        workspaceFingerprint,
        mode: toHostedAssistMode(mode),
      },
    });
  }

  async continueRun(runId: string, toolResult: ToolResult, sessionId?: string): Promise<AssistRunEnvelope> {
    const sanitizedToolResult = sanitizeToolResultForContinue(toolResult);
    const response = await requestJson<{ data?: AssistRunEnvelope } | AssistRunEnvelope>({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: `/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`,
      method: "POST",
      body: sessionId ? { toolResult: sanitizedToolResult, sessionId } : { toolResult: sanitizedToolResult },
    });
    const record = response as { data?: AssistRunEnvelope };
    return (record?.data || response) as AssistRunEnvelope;
  }

  async execute(sessionId: string | undefined, workspaceFingerprint: string, actions: ExecuteAction[]): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/execute",
      method: "POST",
      body: {
        sessionId,
        workspaceFingerprint,
        actions,
      },
    });
  }

  async indexUpsert(projectKey: string, chunks: IndexChunk[]): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/index/upsert",
      method: "POST",
      body: {
        projectKey,
        chunks,
      },
    });
  }

  async indexQuery(projectKey: string, query: string, limit = 8): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/index/query",
      method: "POST",
      body: {
        projectKey,
        query,
        limit,
      },
    });
  }

  async usage(): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/hf/usage",
      method: "GET",
    });
  }

  async checkout(tier: PlanTier = "builder", billing: BillingCycle = "monthly"): Promise<unknown> {
    return requestJson({
      baseUrl: this.baseUrl,
      auth: this.auth,
      path: "/api/v1/playground/checkout-link",
      method: "POST",
      body: { tier, billing },
    });
  }
}

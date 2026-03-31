import { requestJson, requestSse } from "./http.js";
import { AssistMode, AssistRunEnvelope, AuthHeadersInput, HostedAssistMode, SseEvent, ToolResult } from "./types.js";

export function toHostedAssistMode(mode: AssistMode): HostedAssistMode {
  if (mode === "generate" || mode === "debug") return "yolo";
  return mode;
}

export class BinaryHostedClient {
  private readonly baseUrl: string;
  private readonly auth?: AuthHeadersInput;

  constructor(input: { baseUrl: string; auth?: AuthHeadersInput }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.auth = input.auth;
  }

  async createSession(title?: string, mode?: AssistMode): Promise<string | null> {
    const response = await requestJson<{ success: true; data: { id: string } }>({
      url: `${this.baseUrl}/api/v1/playground/sessions`,
      auth: this.auth,
      method: "POST",
      body: { title, mode: mode ? toHostedAssistMode(mode) : undefined },
    });
    return response.data?.id ?? null;
  }

  async assistStream(
    input: { task: string; mode: AssistMode; model?: string; historySessionId?: string },
    onEvent: (event: SseEvent) => void | Promise<void>
  ): Promise<void> {
    await requestSse({
      url: `${this.baseUrl}/api/v1/playground/assist`,
      auth: this.auth,
      method: "POST",
      body: {
        task: input.task,
        mode: toHostedAssistMode(input.mode),
        model: input.model || "Binary IDE",
        stream: true,
        historySessionId: input.historySessionId,
        contextBudget: {
          strategy: "hybrid",
          maxTokens: 16384,
        },
      },
      onEvent,
    });
  }

  async continueRun(runId: string, toolResult: ToolResult, sessionId?: string): Promise<AssistRunEnvelope> {
    const response = await requestJson<{ data?: AssistRunEnvelope } | AssistRunEnvelope>({
      url: `${this.baseUrl}/api/v1/playground/runs/${encodeURIComponent(runId)}/continue`,
      auth: this.auth,
      method: "POST",
      body: sessionId ? { toolResult, sessionId } : { toolResult },
    });
    const record = response as { data?: AssistRunEnvelope };
    return (record?.data || response) as AssistRunEnvelope;
  }

  async usage(): Promise<unknown> {
    return requestJson({
      url: `${this.baseUrl}/api/v1/hf/usage`,
      auth: this.auth,
      method: "GET",
    });
  }
}

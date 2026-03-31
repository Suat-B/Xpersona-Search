import { requestJson, requestSse } from "./http.js";
import {
  BinaryHostAssistRequest,
  BinaryHostAuthStatus,
  BinaryHostHealth,
  BinaryHostPreferences,
  BinaryHostRunControlAction,
  BinaryHostRunEventsResponse,
  BinaryHostRunRecord,
  BinaryHostRunSummary,
  BinaryHostTrustGrant,
  SseEvent,
} from "./types.js";

export class BinaryLocalHostClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get url(): string {
    return this.baseUrl;
  }

  async health(): Promise<BinaryHostHealth> {
    return requestJson<BinaryHostHealth>({
      url: `${this.baseUrl}/v1/healthz`,
      method: "GET",
    });
  }

  async authStatus(): Promise<BinaryHostAuthStatus> {
    return requestJson<BinaryHostAuthStatus>({
      url: `${this.baseUrl}/v1/auth/status`,
      method: "GET",
    });
  }

  async setApiKey(apiKey: string): Promise<BinaryHostAuthStatus> {
    return requestJson<BinaryHostAuthStatus>({
      url: `${this.baseUrl}/v1/auth/api-key`,
      method: "POST",
      body: { apiKey },
    });
  }

  async clearApiKey(): Promise<BinaryHostAuthStatus> {
    return requestJson<BinaryHostAuthStatus>({
      url: `${this.baseUrl}/v1/auth/api-key`,
      method: "DELETE",
    });
  }

  async preferences(): Promise<BinaryHostPreferences> {
    return requestJson<BinaryHostPreferences>({
      url: `${this.baseUrl}/v1/preferences`,
      method: "GET",
    });
  }

  async updatePreferences(patch: Partial<BinaryHostPreferences>): Promise<BinaryHostPreferences> {
    return requestJson<BinaryHostPreferences>({
      url: `${this.baseUrl}/v1/preferences`,
      method: "POST",
      body: patch,
    });
  }

  async trustWorkspace(input: {
    path: string;
    mutate?: boolean;
    commands?: "allow" | "prompt";
    network?: "allow" | "deny";
    elevated?: "allow" | "deny";
  }): Promise<BinaryHostTrustGrant[]> {
    return requestJson<BinaryHostTrustGrant[]>({
      url: `${this.baseUrl}/v1/workspaces/trust`,
      method: "POST",
      body: input,
    });
  }

  async assistStream(
    input: BinaryHostAssistRequest,
    onEvent: (event: SseEvent) => void | Promise<void>
  ): Promise<void> {
    await requestSse({
      url: `${this.baseUrl}/v1/runs/assist`,
      method: "POST",
      body: input,
      onEvent,
    });
  }

  async startDetachedRun(input: BinaryHostAssistRequest): Promise<BinaryHostRunSummary> {
    return requestJson<BinaryHostRunSummary>({
      url: `${this.baseUrl}/v1/runs/assist`,
      method: "POST",
      body: {
        ...input,
        detach: true,
      },
    });
  }

  async listRuns(limit = 20): Promise<{ runs: BinaryHostRunSummary[] }> {
    return requestJson<{ runs: BinaryHostRunSummary[] }>({
      url: `${this.baseUrl}/v1/runs?limit=${encodeURIComponent(String(limit))}`,
      method: "GET",
    });
  }

  async getRun(runId: string): Promise<BinaryHostRunRecord> {
    return requestJson<BinaryHostRunRecord>({
      url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}`,
      method: "GET",
    });
  }

  async getRunEvents(runId: string, after = 0): Promise<BinaryHostRunEventsResponse> {
    return requestJson<BinaryHostRunEventsResponse>({
      url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async controlRun(runId: string, action: BinaryHostRunControlAction, note?: string): Promise<BinaryHostRunSummary> {
    return requestJson<BinaryHostRunSummary>({
      url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/control`,
      method: "POST",
      body: note ? { action, note } : { action },
    });
  }

  async exportRun(runId: string): Promise<BinaryHostRunRecord> {
    return requestJson<BinaryHostRunRecord>({
      url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/export`,
      method: "GET",
    });
  }
}

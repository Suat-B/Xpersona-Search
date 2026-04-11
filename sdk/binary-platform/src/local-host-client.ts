import { requestJson, requestSse } from "./http.js";
import {
  BinaryAgentJob,
  BinaryAgentJobEventsResponse,
  BinaryAgentProbeEventsResponse,
  BinaryAgentProbeSession,
  BinaryAutomationDefinition,
  BinaryAutomationEventsResponse,
  BinaryOpenHandsCapabilities,
  BinaryOrchestrationPolicy,
  BinaryRemoteRuntimeHealth,
  BinaryWebhookSubscription,
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

  async openHandsCapabilities(workspaceRoot?: string): Promise<BinaryOpenHandsCapabilities> {
    const suffix =
      typeof workspaceRoot === "string" && workspaceRoot.trim()
        ? `?workspaceRoot=${encodeURIComponent(workspaceRoot.trim())}`
        : "";
    return requestJson<BinaryOpenHandsCapabilities>({
      url: `${this.baseUrl}/v1/openhands/capabilities${suffix}`,
      method: "GET",
    });
  }

  async orchestrationPolicy(): Promise<BinaryOrchestrationPolicy> {
    return requestJson<BinaryOrchestrationPolicy>({
      url: `${this.baseUrl}/v1/orchestration/policy`,
      method: "GET",
    });
  }

  async updateOrchestrationPolicy(
    patch: Partial<BinaryOrchestrationPolicy>
  ): Promise<BinaryOrchestrationPolicy> {
    return requestJson<BinaryOrchestrationPolicy>({
      url: `${this.baseUrl}/v1/orchestration/policy`,
      method: "PATCH",
      body: patch,
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

  async streamRun(
    runId: string,
    onEvent: (event: SseEvent) => void | Promise<void>,
    after = 0
  ): Promise<void> {
    await requestSse({
      url: `${this.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stream?after=${encodeURIComponent(String(after))}`,
      method: "GET",
      onEvent,
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

  async createAgentProbeSession(input: {
    title?: string;
    model?: string;
    workspaceRoot?: string;
    message?: string;
  }): Promise<BinaryAgentProbeSession> {
    return requestJson<BinaryAgentProbeSession>({
      url: `${this.baseUrl}/v1/debug/agent-sessions`,
      method: "POST",
      body: input,
    });
  }

  async getAgentProbeSession(sessionId: string): Promise<BinaryAgentProbeSession> {
    return requestJson<BinaryAgentProbeSession>({
      url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}`,
      method: "GET",
    });
  }

  async submitAgentProbeMessage(
    sessionId: string,
    input: { message: string }
  ): Promise<BinaryAgentProbeSession> {
    return requestJson<BinaryAgentProbeSession>({
      url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/messages`,
      method: "POST",
      body: input,
    });
  }

  async getAgentProbeEvents(sessionId: string, after = 0): Promise<BinaryAgentProbeEventsResponse> {
    return requestJson<BinaryAgentProbeEventsResponse>({
      url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async controlAgentProbeSession(
    sessionId: string,
    action: "pause" | "resume" | "close"
  ): Promise<BinaryAgentProbeSession> {
    return requestJson<BinaryAgentProbeSession>({
      url: `${this.baseUrl}/v1/debug/agent-sessions/${encodeURIComponent(sessionId)}/control`,
      method: "POST",
      body: { action },
    });
  }

  async createAgentJob(input: BinaryHostAssistRequest): Promise<BinaryAgentJob> {
    return requestJson<BinaryAgentJob>({
      url: `${this.baseUrl}/v1/agents/jobs`,
      method: "POST",
      body: input,
    });
  }

  async listAgentJobs(limit = 20): Promise<{ jobs: BinaryAgentJob[] }> {
    return requestJson<{ jobs: BinaryAgentJob[] }>({
      url: `${this.baseUrl}/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`,
      method: "GET",
    });
  }

  async getAgentJob(jobId: string): Promise<BinaryAgentJob> {
    return requestJson<BinaryAgentJob>({
      url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
    });
  }

  async getAgentJobEvents(jobId: string, after = 0): Promise<BinaryAgentJobEventsResponse> {
    return requestJson<BinaryAgentJobEventsResponse>({
      url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async streamAgentJob(
    jobId: string,
    onEvent: (event: SseEvent) => void | Promise<void>,
    after = 0
  ): Promise<void> {
    await requestSse({
      url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}/stream?after=${encodeURIComponent(String(after))}`,
      method: "GET",
      onEvent,
    });
  }

  async controlAgentJob(
    jobId: string,
    action: "pause" | "resume" | "cancel",
    note?: string
  ): Promise<BinaryAgentJob> {
    return requestJson<BinaryAgentJob>({
      url: `${this.baseUrl}/v1/agents/jobs/${encodeURIComponent(jobId)}/control`,
      method: "POST",
      body: note ? { action, note } : { action },
    });
  }

  async remoteAgentHealth(): Promise<BinaryRemoteRuntimeHealth> {
    return requestJson<BinaryRemoteRuntimeHealth>({
      url: `${this.baseUrl}/v1/agents/remote/health`,
      method: "GET",
    });
  }

  async listAutomations(): Promise<{ automations: BinaryAutomationDefinition[] }> {
    return requestJson<{ automations: BinaryAutomationDefinition[] }>({
      url: `${this.baseUrl}/v1/automations`,
      method: "GET",
    });
  }

  async saveAutomation(
    input: Partial<BinaryAutomationDefinition> & Pick<BinaryAutomationDefinition, "name" | "prompt" | "trigger">
  ): Promise<BinaryAutomationDefinition> {
    return requestJson<BinaryAutomationDefinition>({
      url: `${this.baseUrl}/v1/automations`,
      method: "POST",
      body: input,
    });
  }

  async getAutomation(automationId: string): Promise<BinaryAutomationDefinition> {
    return requestJson<BinaryAutomationDefinition>({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}`,
      method: "GET",
    });
  }

  async updateAutomation(
    automationId: string,
    patch: Partial<BinaryAutomationDefinition>
  ): Promise<BinaryAutomationDefinition> {
    return requestJson<BinaryAutomationDefinition>({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}`,
      method: "PATCH",
      body: patch,
    });
  }

  async controlAutomation(
    automationId: string,
    action: "pause" | "resume"
  ): Promise<BinaryAutomationDefinition> {
    return requestJson<BinaryAutomationDefinition>({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/control`,
      method: "POST",
      body: { action },
    });
  }

  async runAutomation(automationId: string): Promise<BinaryHostRunSummary> {
    return requestJson<BinaryHostRunSummary>({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/run`,
      method: "POST",
      body: {},
    });
  }

  async getAutomationEvents(automationId: string, after = 0): Promise<BinaryAutomationEventsResponse> {
    return requestJson<BinaryAutomationEventsResponse>({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async streamAutomationEvents(
    automationId: string,
    onEvent: (event: SseEvent) => void | Promise<void>,
    after = 0
  ): Promise<void> {
    await requestSse({
      url: `${this.baseUrl}/v1/automations/${encodeURIComponent(automationId)}/stream?after=${encodeURIComponent(String(after))}`,
      method: "GET",
      onEvent,
    });
  }

  async listWebhookSubscriptions(): Promise<{ subscriptions: BinaryWebhookSubscription[] }> {
    return requestJson<{ subscriptions: BinaryWebhookSubscription[] }>({
      url: `${this.baseUrl}/v1/webhooks/subscriptions`,
      method: "GET",
    });
  }

  async saveWebhookSubscription(
    input: Partial<BinaryWebhookSubscription> & Pick<BinaryWebhookSubscription, "url">
  ): Promise<BinaryWebhookSubscription> {
    return requestJson<BinaryWebhookSubscription>({
      url: `${this.baseUrl}/v1/webhooks/subscriptions`,
      method: "POST",
      body: input,
    });
  }
}

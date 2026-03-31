import { CliHttpError, requestJson, requestSse, type SseEvent } from "./http.js";
import { AssistMode } from "./types.js";

export type LocalHostHealth = {
  ok: true;
  service: "binary-host";
  version: string;
  transport: "localhost-http";
  secureStorageAvailable: boolean;
};

export type LocalHostAuthStatus = {
  hasApiKey: boolean;
  maskedApiKey?: string | null;
  storageMode: "secure" | "file" | "none";
  configPath: string;
};

export type LocalHostTrustGrant = {
  path: string;
  mutate: boolean;
  commands: "allow" | "prompt";
  network?: "allow" | "deny";
  elevated?: "allow" | "deny";
  grantedAt: string;
};

export type LocalHostWorkspaceTrustMode =
  | "untrusted"
  | "trusted_read_only"
  | "trusted_full_access"
  | "trusted_prompt_commands";

export type LocalHostRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "takeover_required";

export type LocalHostRunControlAction =
  | "pause"
  | "resume"
  | "cancel"
  | "repair"
  | "takeover"
  | "retry_last_turn";

export type LocalHostBudgetState = {
  maxSteps?: number;
  usedSteps: number;
  remainingSteps?: number;
  maxMutations?: number;
  usedMutations: number;
  remainingMutations?: number;
  exhausted: boolean;
  reason?: string;
};

export type LocalHostCheckpointState = {
  count: number;
  lastCheckpointAt?: string;
  lastCheckpointSummary?: string;
};

export type LocalHostRunSummary = {
  id: string;
  status: LocalHostRunStatus;
  createdAt: string;
  updatedAt: string;
  traceId: string;
  sessionId?: string;
  runId?: string;
  automationId?: string;
  automationTriggerKind?: LocalHostAutomationTriggerKind;
  leaseId?: string;
  heartbeatAt?: string;
  lastToolAt?: string;
  resumeToken: string;
  workspaceRoot?: string;
  workspaceTrustMode: LocalHostWorkspaceTrustMode;
  request: LocalHostAssistRequest;
  client: {
    surface: "desktop" | "cli" | "vsix" | "unknown";
    version?: string;
  };
  budgetState?: LocalHostBudgetState | null;
  checkpointState?: LocalHostCheckpointState | null;
  takeoverReason?: string;
  error?: string;
  eventCount: number;
};

export type LocalHostRunRecord = LocalHostRunSummary & {
  finalEnvelope?: Record<string, unknown>;
  controlHistory: Array<{ action: LocalHostRunControlAction; note?: string | null; at: string }>;
  toolResults: Array<Record<string, unknown>>;
  checkpoints: Array<{ capturedAt: string; summary: string; step?: number }>;
  events: Array<{ seq: number; capturedAt: string; event: SseEvent }>;
};

export type LocalHostRunEventsResponse = {
  run: LocalHostRunSummary;
  events: Array<{ seq: number; capturedAt: string; event: SseEvent }>;
  done: boolean;
};

export type LocalHostPreferences = {
  baseUrl: string;
  trustedWorkspaces: LocalHostTrustGrant[];
  recentSessions: Array<{ sessionId: string; runId?: string; updatedAt: string; workspaceRoot?: string }>;
  artifactHistory: Array<{ id: string; label: string; url?: string; createdAt: string }>;
  preferredTransport: "host" | "direct";
  automations?: LocalHostAutomationDefinition[];
  webhookSubscriptions?: LocalHostWebhookSubscription[];
};

export type LocalHostAutomationPolicy = "autonomous" | "observe_only" | "approval_before_mutation";
export type LocalHostAutomationTriggerKind = "manual" | "schedule_nl" | "file_event" | "process_event" | "notification";

export type LocalHostAutomationTrigger =
  | {
      kind: "manual";
      workspaceRoot?: string;
    }
  | {
      kind: "schedule_nl";
      scheduleText: string;
      workspaceRoot?: string;
    }
  | {
      kind: "file_event";
      workspaceRoot: string;
      includes?: string[];
      excludes?: string[];
    }
  | {
      kind: "process_event";
      query: string;
      workspaceRoot?: string;
    }
  | {
      kind: "notification";
      topic?: string;
      query?: string;
      workspaceRoot?: string;
    };

export type LocalHostAutomationDefinition = {
  id: string;
  name: string;
  prompt: string;
  status: "active" | "paused";
  trigger: LocalHostAutomationTrigger;
  policy: LocalHostAutomationPolicy;
  workspaceRoot?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastTriggerAt?: string;
  lastRunId?: string;
  lastTriggerSummary?: string;
  nextRunAt?: string;
  lastDeliveryAt?: string;
  lastDeliveryError?: string;
  deliveryHealth?: "healthy" | "failing" | "idle";
};

export type LocalHostAutomationEvent = {
  seq: number;
  capturedAt: string;
  event: SseEvent;
};

export type LocalHostWebhookSubscription = {
  id: string;
  url: string;
  status: "active" | "paused";
  secret?: string;
  automationId?: string;
  events?: string[];
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  failureCount?: number;
};

export type LocalHostAutomationEventsResponse = {
  automation: LocalHostAutomationDefinition | null;
  events: LocalHostAutomationEvent[];
};

export type LocalHostAssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  historySessionId?: string;
  tom?: {
    enabled?: boolean;
  };
  workspaceRoot?: string;
  detach?: boolean;
  automationId?: string;
  automationTriggerKind?: LocalHostAutomationTriggerKind;
  automationEventId?: string;
  client?: {
    surface: "desktop" | "cli" | "vsix" | "unknown";
    version?: string;
  };
};

export class LocalHostClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get url(): string {
    return this.baseUrl;
  }

  async health(): Promise<LocalHostHealth> {
    return requestJson<LocalHostHealth>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/healthz",
      method: "GET",
    });
  }

  async checkHealth(): Promise<LocalHostHealth | null> {
    try {
      return await this.health();
    } catch (error) {
      if (error instanceof CliHttpError) return null;
      if (error instanceof Error) return null;
      return null;
    }
  }

  async authStatus(): Promise<LocalHostAuthStatus> {
    return requestJson<LocalHostAuthStatus>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/auth/status",
      method: "GET",
    });
  }

  async setApiKey(apiKey: string): Promise<LocalHostAuthStatus> {
    return requestJson<LocalHostAuthStatus>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/auth/api-key",
      method: "POST",
      body: { apiKey },
    });
  }

  async clearApiKey(): Promise<LocalHostAuthStatus> {
    return requestJson<LocalHostAuthStatus>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/auth/api-key",
      method: "DELETE",
    });
  }

  async preferences(): Promise<LocalHostPreferences> {
    return requestJson<LocalHostPreferences>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/preferences",
      method: "GET",
    });
  }

  async updatePreferences(patch: Partial<LocalHostPreferences>): Promise<LocalHostPreferences> {
    return requestJson<LocalHostPreferences>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/preferences",
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
  }): Promise<LocalHostTrustGrant[]> {
    return requestJson<LocalHostTrustGrant[]>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/workspaces/trust",
      method: "POST",
      body: input,
    });
  }

  async assistStream(input: LocalHostAssistRequest, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void> {
    await requestSse({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/runs/assist",
      body: input,
      onEvent,
    });
  }

  async startDetachedRun(input: LocalHostAssistRequest): Promise<LocalHostRunSummary> {
    return requestJson<LocalHostRunSummary>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/runs/assist",
      method: "POST",
      body: {
        ...input,
        detach: true,
      },
    });
  }

  async listRuns(limit = 20): Promise<{ runs: LocalHostRunSummary[] }> {
    return requestJson<{ runs: LocalHostRunSummary[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs?limit=${encodeURIComponent(String(limit))}`,
      method: "GET",
    });
  }

  async getRun(runId: string): Promise<LocalHostRunRecord> {
    return requestJson<LocalHostRunRecord>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs/${encodeURIComponent(runId)}`,
      method: "GET",
    });
  }

  async getRunEvents(runId: string, after = 0): Promise<LocalHostRunEventsResponse> {
    return requestJson<LocalHostRunEventsResponse>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async streamRun(runId: string, onEvent: (event: SseEvent) => void | Promise<void>, after = 0): Promise<void> {
    await requestSse({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs/${encodeURIComponent(runId)}/stream?after=${encodeURIComponent(String(after))}`,
      method: "GET",
      onEvent,
    });
  }

  async controlRun(runId: string, action: LocalHostRunControlAction, note?: string): Promise<LocalHostRunSummary> {
    return requestJson<LocalHostRunSummary>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs/${encodeURIComponent(runId)}/control`,
      method: "POST",
      body: note ? { action, note } : { action },
    });
  }

  async exportRun(runId: string): Promise<LocalHostRunRecord> {
    return requestJson<LocalHostRunRecord>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/runs/${encodeURIComponent(runId)}/export`,
      method: "GET",
    });
  }

  async listAutomations(): Promise<{ automations: LocalHostAutomationDefinition[] }> {
    return requestJson<{ automations: LocalHostAutomationDefinition[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/automations",
      method: "GET",
    });
  }

  async saveAutomation(
    input: Partial<LocalHostAutomationDefinition> & Pick<LocalHostAutomationDefinition, "name" | "prompt" | "trigger">
  ): Promise<LocalHostAutomationDefinition> {
    return requestJson<LocalHostAutomationDefinition>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/automations",
      method: "POST",
      body: input,
    });
  }

  async getAutomation(id: string): Promise<LocalHostAutomationDefinition> {
    return requestJson<LocalHostAutomationDefinition>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}`,
      method: "GET",
    });
  }

  async updateAutomation(id: string, patch: Partial<LocalHostAutomationDefinition>): Promise<LocalHostAutomationDefinition> {
    return requestJson<LocalHostAutomationDefinition>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: patch,
    });
  }

  async controlAutomation(id: string, action: "pause" | "resume"): Promise<LocalHostAutomationDefinition> {
    return requestJson<LocalHostAutomationDefinition>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}/control`,
      method: "POST",
      body: { action },
    });
  }

  async runAutomation(id: string): Promise<LocalHostRunSummary> {
    return requestJson<LocalHostRunSummary>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}/run`,
      method: "POST",
      body: {},
    });
  }

  async getAutomationEvents(id: string, after = 0): Promise<LocalHostAutomationEventsResponse> {
    return requestJson<LocalHostAutomationEventsResponse>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async listWebhookSubscriptions(): Promise<{ subscriptions: LocalHostWebhookSubscription[] }> {
    return requestJson<{ subscriptions: LocalHostWebhookSubscription[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/webhooks/subscriptions",
      method: "GET",
    });
  }

  async saveWebhookSubscription(
    input: Partial<LocalHostWebhookSubscription> & Pick<LocalHostWebhookSubscription, "url">
  ): Promise<LocalHostWebhookSubscription> {
    return requestJson<LocalHostWebhookSubscription>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/webhooks/subscriptions",
      method: "POST",
      body: input,
    });
  }
}

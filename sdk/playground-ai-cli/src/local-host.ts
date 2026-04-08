import { CliHttpError, requestJson, requestSse, type SseEvent } from "./http.js";
import { AssistMode } from "./types.js";

export type LocalHostHealth = {
  ok: true;
  service: "binary-host";
  version: string;
  transport: "localhost-http";
  secureStorageAvailable: boolean;
  openhandsRuntime?: {
    readiness: "ready" | "limited" | "repair_needed";
    runtimeKind: "docker" | "local-python" | "remote" | "reduced-local" | "unknown";
    runtimeProfile: "full" | "code-only" | "chat-only" | "unavailable";
    gatewayUrl: string;
    version?: string | null;
    pythonVersion?: string | null;
    packageFamily?: "openhands" | "openhands-sdk" | "unknown";
    packageVersion?: string | null;
    supportedTools: string[];
    degradedReasons: string[];
    availableActions: string[];
    message: string;
    selectedAt?: string;
    lastHealthyAt?: string;
    currentModelCandidate?: LocalHostModelCandidate | null;
    lastProviderFailureReason?: LocalHostProviderFailureReason | null;
    fallbackAvailable?: boolean;
    lastFallbackRecovered?: boolean;
    lastPersistenceDir?: string | null;
  } | null;
};

export type LocalHostProviderFailureReason =
  | "provider_credits_exhausted"
  | "router_blocked"
  | "tool_schema_incompatible"
  | "transient_api_failure"
  | "unknown_provider_failure";

export type LocalHostModelCandidate = {
  alias?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
};

export type LocalHostExecutionLane = "local_interactive" | "openhands_headless" | "openhands_remote";

export type LocalHostPluginPack = {
  id: "web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice";
  title: string;
  description: string;
  source: "binary_managed" | "repo_local" | "requested";
  status: "available" | "missing";
  loadedLazily: boolean;
  skillCount: number;
  mcpServerCount: number;
};

export type LocalHostSkillSource = {
  id: string;
  label: string;
  kind: "repo_local" | "user" | "org";
  path?: string;
  available: boolean;
  loadedLazily: boolean;
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
  executionLane?: LocalHostExecutionLane;
  pluginPacks?: LocalHostPluginPack[];
  skillSources?: LocalHostSkillSource[];
  conversationId?: string | null;
  persistenceDir?: string | null;
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
  defaultProviderId?: LocalHostProviderId;
  automations?: LocalHostAutomationDefinition[];
  webhookSubscriptions?: LocalHostWebhookSubscription[];
  connections?: LocalHostConnectionView[];
};

export type LocalHostConnectionTransport = "http" | "sse";
export type LocalHostConnectionAuthMode = "none" | "bearer" | "api-key" | "oauth";
export type LocalHostConnectionStatus = "connected" | "disabled" | "needs_auth" | "failed_test";
export type LocalHostConnectionSource = "starter" | "guided" | "imported";

export type LocalHostConnectionView = {
  id: string;
  name: string;
  transport: LocalHostConnectionTransport;
  url: string;
  authMode: LocalHostConnectionAuthMode;
  enabled: boolean;
  source: LocalHostConnectionSource;
  createdAt: string;
  updatedAt: string;
  headerName?: string;
  publicHeaders?: Record<string, string>;
  importedFrom?: string;
  oauthSupported?: boolean;
  lastValidatedAt?: string;
  lastValidationOk?: boolean;
  lastValidationError?: string;
  status: LocalHostConnectionStatus;
  hasSecret: boolean;
};

export type LocalHostConnectionDraft = {
  id?: string;
  name: string;
  transport: LocalHostConnectionTransport;
  url: string;
  authMode: LocalHostConnectionAuthMode;
  enabled?: boolean;
  source?: LocalHostConnectionSource;
  headerName?: string;
  publicHeaders?: Record<string, string>;
  secretHeaders?: Record<string, string>;
  bearerToken?: string;
  apiKey?: string;
  oauthSupported?: boolean;
  importedFrom?: string;
};

export type LocalHostProviderId =
  | "openai"
  | "chatgpt_portal"
  | "qwen_dashscope"
  | "qwen_portal"
  | "openrouter"
  | "anthropic"
  | "gemini"
  | "groq"
  | "github_models"
  | "azure_openai"
  | "vertex_ai";

export type LocalHostProviderAuthStrategy = "api_key" | "oauth_pkce" | "oauth_device" | "browser_session";
export type LocalHostProviderConnectionMode =
  | "direct_oauth_pkce"
  | "direct_oauth_device"
  | "hub_oauth"
  | "portal_session"
  | "local_credential_adapter"
  | "api_key_only"
  | "unsupported";
export type LocalHostProviderOauthCapability =
  | "none"
  | "pkce_public_client"
  | "device_code"
  | "brokered_confidential_client";
export type LocalHostProviderModelCoverageMode = "provider_direct" | "hub_catalog";

export type LocalHostProviderCatalogEntry = {
  id: LocalHostProviderId;
  displayName: string;
  authStrategy: LocalHostProviderAuthStrategy;
  connectionMode: LocalHostProviderConnectionMode;
  oauthCapability: LocalHostProviderOauthCapability;
  modelCoverageMode: LocalHostProviderModelCoverageMode;
  runtimeKind: "openai_compatible" | "anthropic_native";
  validationKind: "openai_models" | "openai_chat_probe" | "anthropic_models";
  defaultBaseUrl: string;
  defaultModel: string;
  browserConnectUrl: string;
  browserDocsUrl: string;
  apiKeyLabel: string;
  accountLabel: string;
  availabilityReason?: string;
  supportsRevocation?: boolean;
  supportsDynamicModelCatalog?: boolean;
  supportsLocalImport?: boolean;
  modelFamilies?: string[];
  beta?: boolean;
};

export type LocalHostProviderProfile = {
  id: LocalHostProviderId;
  displayName: string;
  authStrategy: LocalHostProviderAuthStrategy;
  connectionMode: LocalHostProviderConnectionMode;
  oauthCapability: LocalHostProviderOauthCapability;
  modelCoverageMode: LocalHostProviderModelCoverageMode;
  runtimeKind: "openai_compatible" | "anthropic_native";
  validationKind: "openai_models" | "openai_chat_probe" | "anthropic_models";
  browserConnectUrl: string;
  browserDocsUrl: string;
  defaultBaseUrl: string;
  defaultModel: string;
  supportsBrowserAuth: boolean;
  supportsRevocation: boolean;
  supportsDynamicModelCatalog: boolean;
  supportsLocalImport: boolean;
  configuredBaseUrl?: string;
  configuredModel?: string;
  connected: boolean;
  authReady: boolean;
  runtimeReady: boolean;
  enabled: boolean;
  status: LocalHostConnectionStatus;
  lastValidatedAt?: string;
  lastError?: string;
  isDefault: boolean;
  connectionId?: string;
  hasSecret: boolean;
  availabilityReason?: string;
  linkedAccountLabel?: string;
  linkedAt?: string;
  lastRefreshedAt?: string;
  authHealth?: "ready" | "needs_reauth" | "refresh_failed" | "expired" | "blocked";
  refreshFailureCount?: number;
  runtimeReadinessReason?: string;
  routeKind?: string;
  routeLabel?: string;
  routeReason?: string;
  modelFamilies?: string[];
  availableModels?: string[];
};

export type LocalHostProviderOAuthSession = {
  sessionId: string;
  providerId: LocalHostProviderId;
  status: "pending_browser" | "awaiting_callback" | "connected" | "failed" | "cancelled";
  authorizeUrl?: string;
  verificationUri?: string;
  userCode?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type LocalHostProviderBrowserSession = {
  sessionId: string;
  providerId: LocalHostProviderId;
  status: "pending_browser" | "awaiting_import" | "importing" | "connected" | "failed" | "cancelled";
  launchUrl: string;
  importPathHints?: string[];
  note?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
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

export type LocalHostAgentProbeTurn = {
  id: string;
  userMessage: string;
  assistantMessage?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  error?: string;
  runId?: string;
  modelCandidate?: LocalHostModelCandidate | null;
  fallbackAttempt?: number;
  failureReason?: LocalHostProviderFailureReason | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
};

export type LocalHostAgentProbeEvent = {
  id: string;
  seq: number;
  capturedAt: string;
  event: SseEvent;
};

export type LocalHostAgentProbeSession = {
  id: string;
  status: "active" | "paused" | "failed";
  createdAt: string;
  updatedAt: string;
  title: string;
  model?: string;
  workspaceRoot?: string;
  gatewayRunId?: string;
  conversationId?: string | null;
  persistenceDir?: string | null;
  currentModelCandidate?: LocalHostModelCandidate | null;
  lastFailureReason?: LocalHostProviderFailureReason | null;
  fallbackAvailable: boolean;
  lastFallbackRecovered: boolean;
  turnCount: number;
  turns: LocalHostAgentProbeTurn[];
  events: LocalHostAgentProbeEvent[];
};

export type LocalHostAgentProbeEventsResponse = {
  session: LocalHostAgentProbeSession | null;
  events: LocalHostAgentProbeEvent[];
  done: boolean;
};

export type LocalHostAgentJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "takeover_required";

export type LocalHostAgentJob = {
  id: string;
  status: LocalHostAgentJobStatus;
  createdAt: string;
  updatedAt: string;
  task: string;
  model: string;
  workspaceRoot?: string;
  runId?: string;
  traceId?: string;
  sessionId?: string;
  conversationId?: string | null;
  persistenceDir?: string | null;
  requestedExecutionLane: LocalHostExecutionLane;
  executionLane: LocalHostExecutionLane;
  pluginPacks: LocalHostPluginPack[];
  skillSources: LocalHostSkillSource[];
  controlHistory: Array<{ action: "pause" | "resume" | "cancel"; at: string; note?: string | null }>;
  events: Array<{ seq: number; capturedAt: string; event: SseEvent }>;
  error?: string;
};

export type LocalHostAgentJobEventsResponse = {
  job: LocalHostAgentJob | null;
  events: Array<{ seq: number; capturedAt: string; event: SseEvent }>;
  done: boolean;
};

export type LocalHostRemoteRuntimeHealth = {
  configured: boolean;
  available: boolean;
  executionLane: "openhands_remote";
  gatewayUrl?: string;
  status: "ready" | "degraded" | "unavailable";
  message: string;
  compatibility: "gateway_compatible" | "agent_server" | "unknown";
  checkedAt: string;
  details?: string;
};

export type LocalHostAssistRequest = {
  task: string;
  mode: AssistMode;
  model: string;
  chatModelSource?: "platform" | "user_connected";
  fallbackToPlatformModel?: boolean;
  historySessionId?: string;
  tom?: {
    enabled?: boolean;
  };
  workspaceRoot?: string;
  detach?: boolean;
  automationId?: string;
  automationTriggerKind?: LocalHostAutomationTriggerKind;
  automationEventId?: string;
  executionLane?: LocalHostExecutionLane;
  pluginPacks?: Array<LocalHostPluginPack["id"]>;
  expectedLongRun?: boolean;
  requireIsolation?: boolean;
  debugTracing?: boolean;
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

  async listConnections(): Promise<{ connections: LocalHostConnectionView[] }> {
    return requestJson<{ connections: LocalHostConnectionView[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/connections",
      method: "GET",
    });
  }

  async saveConnection(input: LocalHostConnectionDraft): Promise<{
    connection: LocalHostConnectionView;
    storageMode: "secure" | "file";
    secureStorageAvailable: boolean;
  }> {
    return requestJson<{
      connection: LocalHostConnectionView;
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/connections",
      method: "POST",
      body: input,
    });
  }

  async testConnection(id: string): Promise<{
    connection: LocalHostConnectionView;
    test: { ok: boolean; status: number | null; message: string };
  }> {
    return requestJson<{
      connection: LocalHostConnectionView;
      test: { ok: boolean; status: number | null; message: string };
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/connections/${encodeURIComponent(id)}/test`,
      method: "POST",
    });
  }

  async enableConnection(id: string): Promise<{ connection: LocalHostConnectionView }> {
    return requestJson<{ connection: LocalHostConnectionView }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/connections/${encodeURIComponent(id)}/enable`,
      method: "POST",
    });
  }

  async disableConnection(id: string): Promise<{ connection: LocalHostConnectionView }> {
    return requestJson<{ connection: LocalHostConnectionView }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/connections/${encodeURIComponent(id)}/disable`,
      method: "POST",
    });
  }

  async removeConnection(id: string): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/connections/${encodeURIComponent(id)}`,
      method: "DELETE",
    });
  }

  async importConnections(raw: string, importedFrom?: string): Promise<{ connections: LocalHostConnectionView[] }> {
    return requestJson<{ connections: LocalHostConnectionView[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/connections/import",
      method: "POST",
      body: importedFrom ? { raw, importedFrom } : { raw },
    });
  }

  async listProviderCatalog(): Promise<{ providers: LocalHostProviderCatalogEntry[] }> {
    return requestJson<{ providers: LocalHostProviderCatalogEntry[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/catalog",
      method: "GET",
    });
  }

  async listProviders(): Promise<{ providers: LocalHostProviderProfile[] }> {
    return requestJson<{ providers: LocalHostProviderProfile[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers",
      method: "GET",
    });
  }

  async connectProviderApiKey(input: {
    providerId: LocalHostProviderId;
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
    setDefault?: boolean;
  }): Promise<{
    provider: LocalHostProviderProfile;
    storageMode: "secure" | "file";
    secureStorageAvailable: boolean;
    availableModels: string[];
  }> {
    return requestJson<{
      provider: LocalHostProviderProfile;
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
      availableModels: string[];
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/api-key",
      method: "POST",
      body: input,
    });
  }

  async openProviderBrowser(providerId: LocalHostProviderId): Promise<{ ok: true; providerId: LocalHostProviderId; url: string }> {
    return requestJson<{ ok: true; providerId: LocalHostProviderId; url: string }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/open-browser",
      method: "POST",
      body: { providerId },
    });
  }

  async importProviderLocalAuth(input: {
    providerId: LocalHostProviderId;
    baseUrl?: string;
    defaultModel?: string;
    setDefault?: boolean;
  }): Promise<{
    provider: LocalHostProviderProfile;
    storageMode: "secure" | "file";
    secureStorageAvailable: boolean;
  }> {
    return requestJson<{
      provider: LocalHostProviderProfile;
      storageMode: "secure" | "file";
      secureStorageAvailable: boolean;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/import-local",
      method: "POST",
      body: input,
    });
  }

  async startProviderBrowserSession(input: {
    providerId: LocalHostProviderId;
    baseUrl?: string;
    defaultModel?: string;
    setDefault?: boolean;
  }): Promise<{
    ok: true;
    providerId: LocalHostProviderId;
    session: LocalHostProviderBrowserSession;
    launchUrl: string;
  }> {
    return requestJson<{
      ok: true;
      providerId: LocalHostProviderId;
      session: LocalHostProviderBrowserSession;
      launchUrl: string;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/browser/start",
      method: "POST",
      body: input,
    });
  }

  async pollProviderBrowserSession(sessionId: string): Promise<{
    session: LocalHostProviderBrowserSession;
    provider?: LocalHostProviderProfile | null;
  }> {
    return requestJson<{
      session: LocalHostProviderBrowserSession;
      provider?: LocalHostProviderProfile | null;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/browser/poll",
      method: "POST",
      body: { sessionId },
    });
  }

  async startProviderOAuth(input: {
    providerId: LocalHostProviderId;
    baseUrl?: string;
    defaultModel?: string;
    setDefault?: boolean;
  }): Promise<{
    ok: true;
    providerId: LocalHostProviderId;
    sessionId: string;
    status: LocalHostProviderOAuthSession["status"];
    launchUrl: string;
    verificationUri?: string;
    userCode?: string;
  }> {
    return requestJson<{
      ok: true;
      providerId: LocalHostProviderId;
      sessionId: string;
      status: LocalHostProviderOAuthSession["status"];
      launchUrl: string;
      verificationUri?: string;
      userCode?: string;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/oauth/start",
      method: "POST",
      body: input,
    });
  }

  async pollProviderOAuth(sessionId: string): Promise<{
    session: LocalHostProviderOAuthSession;
    provider?: LocalHostProviderProfile | null;
  }> {
    return requestJson<{
      session: LocalHostProviderOAuthSession;
      provider?: LocalHostProviderProfile | null;
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/providers/connect/oauth/poll",
      method: "POST",
      body: { sessionId },
    });
  }

  async testProvider(providerId: LocalHostProviderId): Promise<{
    provider: LocalHostProviderProfile;
    test: { ok: boolean; status: number | null; message: string; availableModels?: string[] };
  }> {
    return requestJson<{
      provider: LocalHostProviderProfile;
      test: { ok: boolean; status: number | null; message: string; availableModels?: string[] };
    }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/providers/${encodeURIComponent(providerId)}/test`,
      method: "POST",
    });
  }

  async refreshProvider(providerId: LocalHostProviderId): Promise<{ provider: LocalHostProviderProfile }> {
    return requestJson<{ provider: LocalHostProviderProfile }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/providers/${encodeURIComponent(providerId)}/refresh`,
      method: "POST",
    });
  }

  async setDefaultProvider(providerId: LocalHostProviderId): Promise<{ providers: LocalHostProviderProfile[] }> {
    return requestJson<{ providers: LocalHostProviderProfile[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/providers/${encodeURIComponent(providerId)}/default`,
      method: "POST",
    });
  }

  async disconnectProvider(providerId: LocalHostProviderId): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/providers/${encodeURIComponent(providerId)}`,
      method: "DELETE",
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

  async createAgentProbeSession(input: {
    title?: string;
    model?: string;
    workspaceRoot?: string;
    message?: string;
  }): Promise<LocalHostAgentProbeSession> {
    return requestJson<LocalHostAgentProbeSession>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/debug/agent-sessions",
      method: "POST",
      body: input,
    });
  }

  async getAgentProbeSession(id: string): Promise<LocalHostAgentProbeSession> {
    return requestJson<LocalHostAgentProbeSession>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}`,
      method: "GET",
    });
  }

  async submitAgentProbeMessage(id: string, input: { message: string }): Promise<LocalHostAgentProbeSession> {
    return requestJson<LocalHostAgentProbeSession>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/messages`,
      method: "POST",
      body: input,
    });
  }

  async getAgentProbeEvents(id: string, after = 0): Promise<LocalHostAgentProbeEventsResponse> {
    return requestJson<LocalHostAgentProbeEventsResponse>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async controlAgentProbeSession(
    id: string,
    action: "pause" | "resume" | "close"
  ): Promise<LocalHostAgentProbeSession> {
    return requestJson<LocalHostAgentProbeSession>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/debug/agent-sessions/${encodeURIComponent(id)}/control`,
      method: "POST",
      body: { action },
    });
  }

  async createAgentJob(input: LocalHostAssistRequest): Promise<LocalHostAgentJob> {
    return requestJson<LocalHostAgentJob>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/agents/jobs",
      method: "POST",
      body: input,
    });
  }

  async listAgentJobs(limit = 20): Promise<{ jobs: LocalHostAgentJob[] }> {
    return requestJson<{ jobs: LocalHostAgentJob[] }>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/agents/jobs?limit=${encodeURIComponent(String(limit))}`,
      method: "GET",
    });
  }

  async getAgentJob(id: string): Promise<LocalHostAgentJob> {
    return requestJson<LocalHostAgentJob>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/agents/jobs/${encodeURIComponent(id)}`,
      method: "GET",
    });
  }

  async getAgentJobEvents(id: string, after = 0): Promise<LocalHostAgentJobEventsResponse> {
    return requestJson<LocalHostAgentJobEventsResponse>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/agents/jobs/${encodeURIComponent(id)}/events?after=${encodeURIComponent(String(after))}`,
      method: "GET",
    });
  }

  async controlAgentJob(
    id: string,
    action: "pause" | "resume" | "cancel",
    note?: string
  ): Promise<LocalHostAgentJob> {
    return requestJson<LocalHostAgentJob>({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/agents/jobs/${encodeURIComponent(id)}/control`,
      method: "POST",
      body: note ? { action, note } : { action },
    });
  }

  async getRemoteAgentHealth(): Promise<LocalHostRemoteRuntimeHealth> {
    return requestJson<LocalHostRemoteRuntimeHealth>({
      baseUrl: this.baseUrl,
      auth: {},
      path: "/v1/agents/remote/health",
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

  async streamAutomationEvents(
    id: string,
    onEvent: (event: SseEvent) => void | Promise<void>,
    after = 0
  ): Promise<void> {
    await requestSse({
      baseUrl: this.baseUrl,
      auth: {},
      path: `/v1/automations/${encodeURIComponent(id)}/stream?after=${encodeURIComponent(String(after))}`,
      method: "GET",
      onEvent,
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

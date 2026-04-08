import { type SseEvent } from "./http.js";
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
export type LocalHostProviderFailureReason = "provider_credits_exhausted" | "router_blocked" | "tool_schema_incompatible" | "transient_api_failure" | "unknown_provider_failure";
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
export type LocalHostWorkspaceTrustMode = "untrusted" | "trusted_read_only" | "trusted_full_access" | "trusted_prompt_commands";
export type LocalHostRunStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "takeover_required";
export type LocalHostRunControlAction = "pause" | "resume" | "cancel" | "repair" | "takeover" | "retry_last_turn";
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
    controlHistory: Array<{
        action: LocalHostRunControlAction;
        note?: string | null;
        at: string;
    }>;
    toolResults: Array<Record<string, unknown>>;
    checkpoints: Array<{
        capturedAt: string;
        summary: string;
        step?: number;
    }>;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
};
export type LocalHostRunEventsResponse = {
    run: LocalHostRunSummary;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
    done: boolean;
};
export type LocalHostPreferences = {
    baseUrl: string;
    trustedWorkspaces: LocalHostTrustGrant[];
    recentSessions: Array<{
        sessionId: string;
        runId?: string;
        updatedAt: string;
        workspaceRoot?: string;
    }>;
    artifactHistory: Array<{
        id: string;
        label: string;
        url?: string;
        createdAt: string;
    }>;
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
export type LocalHostProviderId = "openai" | "chatgpt_portal" | "qwen_dashscope" | "qwen_portal" | "openrouter" | "anthropic" | "gemini" | "groq" | "github_models" | "azure_openai" | "vertex_ai";
export type LocalHostProviderAuthStrategy = "api_key" | "oauth_pkce" | "oauth_device" | "browser_session";
export type LocalHostProviderConnectionMode = "direct_oauth_pkce" | "direct_oauth_device" | "hub_oauth" | "portal_session" | "local_credential_adapter" | "api_key_only" | "unsupported";
export type LocalHostProviderOauthCapability = "none" | "pkce_public_client" | "device_code" | "brokered_confidential_client";
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
export type LocalHostAutomationTrigger = {
    kind: "manual";
    workspaceRoot?: string;
} | {
    kind: "schedule_nl";
    scheduleText: string;
    workspaceRoot?: string;
} | {
    kind: "file_event";
    workspaceRoot: string;
    includes?: string[];
    excludes?: string[];
} | {
    kind: "process_event";
    query: string;
    workspaceRoot?: string;
} | {
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
export type LocalHostAgentJobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "takeover_required";
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
    controlHistory: Array<{
        action: "pause" | "resume" | "cancel";
        at: string;
        note?: string | null;
    }>;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
    error?: string;
};
export type LocalHostAgentJobEventsResponse = {
    job: LocalHostAgentJob | null;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
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
export declare class LocalHostClient {
    private readonly baseUrl;
    constructor(baseUrl: string);
    get url(): string;
    health(): Promise<LocalHostHealth>;
    checkHealth(): Promise<LocalHostHealth | null>;
    authStatus(): Promise<LocalHostAuthStatus>;
    setApiKey(apiKey: string): Promise<LocalHostAuthStatus>;
    clearApiKey(): Promise<LocalHostAuthStatus>;
    preferences(): Promise<LocalHostPreferences>;
    updatePreferences(patch: Partial<LocalHostPreferences>): Promise<LocalHostPreferences>;
    listConnections(): Promise<{
        connections: LocalHostConnectionView[];
    }>;
    saveConnection(input: LocalHostConnectionDraft): Promise<{
        connection: LocalHostConnectionView;
        storageMode: "secure" | "file";
        secureStorageAvailable: boolean;
    }>;
    testConnection(id: string): Promise<{
        connection: LocalHostConnectionView;
        test: {
            ok: boolean;
            status: number | null;
            message: string;
        };
    }>;
    enableConnection(id: string): Promise<{
        connection: LocalHostConnectionView;
    }>;
    disableConnection(id: string): Promise<{
        connection: LocalHostConnectionView;
    }>;
    removeConnection(id: string): Promise<{
        ok: true;
    }>;
    importConnections(raw: string, importedFrom?: string): Promise<{
        connections: LocalHostConnectionView[];
    }>;
    listProviderCatalog(): Promise<{
        providers: LocalHostProviderCatalogEntry[];
    }>;
    listProviders(): Promise<{
        providers: LocalHostProviderProfile[];
    }>;
    connectProviderApiKey(input: {
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
    }>;
    openProviderBrowser(providerId: LocalHostProviderId): Promise<{
        ok: true;
        providerId: LocalHostProviderId;
        url: string;
    }>;
    importProviderLocalAuth(input: {
        providerId: LocalHostProviderId;
        baseUrl?: string;
        defaultModel?: string;
        setDefault?: boolean;
    }): Promise<{
        provider: LocalHostProviderProfile;
        storageMode: "secure" | "file";
        secureStorageAvailable: boolean;
    }>;
    startProviderBrowserSession(input: {
        providerId: LocalHostProviderId;
        baseUrl?: string;
        defaultModel?: string;
        setDefault?: boolean;
    }): Promise<{
        ok: true;
        providerId: LocalHostProviderId;
        session: LocalHostProviderBrowserSession;
        launchUrl: string;
    }>;
    pollProviderBrowserSession(sessionId: string): Promise<{
        session: LocalHostProviderBrowserSession;
        provider?: LocalHostProviderProfile | null;
    }>;
    startProviderOAuth(input: {
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
    }>;
    pollProviderOAuth(sessionId: string): Promise<{
        session: LocalHostProviderOAuthSession;
        provider?: LocalHostProviderProfile | null;
    }>;
    testProvider(providerId: LocalHostProviderId): Promise<{
        provider: LocalHostProviderProfile;
        test: {
            ok: boolean;
            status: number | null;
            message: string;
            availableModels?: string[];
        };
    }>;
    refreshProvider(providerId: LocalHostProviderId): Promise<{
        provider: LocalHostProviderProfile;
    }>;
    setDefaultProvider(providerId: LocalHostProviderId): Promise<{
        providers: LocalHostProviderProfile[];
    }>;
    disconnectProvider(providerId: LocalHostProviderId): Promise<{
        ok: true;
    }>;
    trustWorkspace(input: {
        path: string;
        mutate?: boolean;
        commands?: "allow" | "prompt";
        network?: "allow" | "deny";
        elevated?: "allow" | "deny";
    }): Promise<LocalHostTrustGrant[]>;
    assistStream(input: LocalHostAssistRequest, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void>;
    startDetachedRun(input: LocalHostAssistRequest): Promise<LocalHostRunSummary>;
    listRuns(limit?: number): Promise<{
        runs: LocalHostRunSummary[];
    }>;
    getRun(runId: string): Promise<LocalHostRunRecord>;
    getRunEvents(runId: string, after?: number): Promise<LocalHostRunEventsResponse>;
    streamRun(runId: string, onEvent: (event: SseEvent) => void | Promise<void>, after?: number): Promise<void>;
    controlRun(runId: string, action: LocalHostRunControlAction, note?: string): Promise<LocalHostRunSummary>;
    exportRun(runId: string): Promise<LocalHostRunRecord>;
    createAgentProbeSession(input: {
        title?: string;
        model?: string;
        workspaceRoot?: string;
        message?: string;
    }): Promise<LocalHostAgentProbeSession>;
    getAgentProbeSession(id: string): Promise<LocalHostAgentProbeSession>;
    submitAgentProbeMessage(id: string, input: {
        message: string;
    }): Promise<LocalHostAgentProbeSession>;
    getAgentProbeEvents(id: string, after?: number): Promise<LocalHostAgentProbeEventsResponse>;
    controlAgentProbeSession(id: string, action: "pause" | "resume" | "close"): Promise<LocalHostAgentProbeSession>;
    createAgentJob(input: LocalHostAssistRequest): Promise<LocalHostAgentJob>;
    listAgentJobs(limit?: number): Promise<{
        jobs: LocalHostAgentJob[];
    }>;
    getAgentJob(id: string): Promise<LocalHostAgentJob>;
    getAgentJobEvents(id: string, after?: number): Promise<LocalHostAgentJobEventsResponse>;
    controlAgentJob(id: string, action: "pause" | "resume" | "cancel", note?: string): Promise<LocalHostAgentJob>;
    getRemoteAgentHealth(): Promise<LocalHostRemoteRuntimeHealth>;
    listAutomations(): Promise<{
        automations: LocalHostAutomationDefinition[];
    }>;
    saveAutomation(input: Partial<LocalHostAutomationDefinition> & Pick<LocalHostAutomationDefinition, "name" | "prompt" | "trigger">): Promise<LocalHostAutomationDefinition>;
    getAutomation(id: string): Promise<LocalHostAutomationDefinition>;
    updateAutomation(id: string, patch: Partial<LocalHostAutomationDefinition>): Promise<LocalHostAutomationDefinition>;
    controlAutomation(id: string, action: "pause" | "resume"): Promise<LocalHostAutomationDefinition>;
    runAutomation(id: string): Promise<LocalHostRunSummary>;
    getAutomationEvents(id: string, after?: number): Promise<LocalHostAutomationEventsResponse>;
    streamAutomationEvents(id: string, onEvent: (event: SseEvent) => void | Promise<void>, after?: number): Promise<void>;
    listWebhookSubscriptions(): Promise<{
        subscriptions: LocalHostWebhookSubscription[];
    }>;
    saveWebhookSubscription(input: Partial<LocalHostWebhookSubscription> & Pick<LocalHostWebhookSubscription, "url">): Promise<LocalHostWebhookSubscription>;
}

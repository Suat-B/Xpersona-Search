export type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type HostedAssistMode = "auto" | "plan" | "yolo";
export type BinaryAdapterMode = "auto" | "force_binary_tool_adapter";
export type BinaryLatencyPolicy = "default" | "detached_15s_cap";
export type BinaryModelRoutingMode = "single_fixed_free";
export type BinaryDesktopProofMode = "adaptive" | "strict";
export type BinaryOrchestrationLatencyBudgets = {
    interactive: number;
    desktop: number;
    deepCode: number;
};
export type BinaryOrchestrationPolicy = {
    mode: "force_binary_tool_adapter";
    detachedFirstTurnBudgetMs: number;
    smallModelAllowlist: string[];
    modelRoutingMode: BinaryModelRoutingMode;
    fixedModelAlias?: string;
    fallbackEnabled: boolean;
    latencyBudgetsMs: BinaryOrchestrationLatencyBudgets;
    desktopProofMode: BinaryDesktopProofMode;
};
export type PlaygroundToolName = "list_files" | "read_file" | "search_workspace" | "get_diagnostics" | "git_status" | "git_diff" | "create_checkpoint" | "edit" | "write_file" | "mkdir" | "run_command" | "get_workspace_memory" | (string & {});
export type ToolCall = {
    id: string;
    name: PlaygroundToolName;
    arguments: Record<string, unknown>;
    kind?: "observe" | "mutate" | "command";
    summary?: string;
};
export type ToolResult = {
    toolCallId: string;
    name: PlaygroundToolName;
    ok: boolean;
    blocked?: boolean;
    summary: string;
    data?: Record<string, unknown>;
    error?: string;
    createdAt?: string;
};
export type PendingToolCall = {
    step: number;
    adapter: string;
    requiresClientExecution: boolean;
    toolCall: ToolCall;
    availableTools?: PlaygroundToolName[];
    createdAt: string;
};
export type LoopState = {
    protocol: string;
    status: "idle" | "pending_tool" | "running" | "completed" | "failed";
    stepCount: number;
    mutationCount: number;
    repeatedCallCount: number;
    repairCount: number;
    maxSteps: number;
    maxMutations: number;
    lastToolCallKey?: string;
};
export type ProgressState = {
    status: "running" | "stalled" | "repairing" | "completed" | "failed";
    lastMeaningfulProgressAtStep: number;
    lastMeaningfulProgressSummary: string;
    stallCount: number;
    stallReason?: string;
    nextDeterministicAction?: string;
    pendingToolCallSignature?: string;
};
export type ObjectiveState = {
    status: "in_progress" | "satisfied" | "blocked";
    goalType: "code_edit" | "command_run" | "plan" | "unknown";
    targetPath?: string;
    requiredProof: string[];
    observedProof: string[];
    missingProof: string[];
};
export type ValidationPlan = {
    scope: "none" | "targeted";
    checks: string[];
    touchedFiles: string[];
    reason: string;
};
export type BinaryRunLatencyMetadata = {
    queueDelayMs?: number;
    ttfrMs?: number;
    firstToolMs?: number;
    plannerLatencyMs?: number;
    providerLatencyMs?: number;
    totalRunMs?: number;
    fallbackCount?: number;
};
export type AssistRunEnvelope = {
    sessionId?: string;
    traceId?: string;
    targetAppIntent?: string;
    targetResolvedApp?: string;
    focusRecoveryAttempted?: boolean;
    recoverySuppressedReason?: string;
    verificationRequired?: boolean;
    verificationPassed?: boolean;
    cleanupClosedCount?: number;
    adapterMode?: BinaryAdapterMode;
    latencyPolicy?: BinaryLatencyPolicy;
    smallModelForced?: boolean;
    modelRoutingMode?: BinaryModelRoutingMode;
    fixedModelAlias?: string;
    fallbackEnabled?: boolean;
    budgetProfile?: string;
    firstTurnBudgetMs?: number;
    timeoutPolicy?: string;
    queueDelayMs?: number;
    ttfrMs?: number;
    firstToolMs?: number;
    plannerLatencyMs?: number;
    providerLatencyMs?: number;
    totalRunMs?: number;
    fallbackCount?: number;
    coercionApplied?: boolean;
    seedToolInjected?: boolean;
    invalidToolNameRecovered?: boolean;
    executionLane?: BinaryExecutionLane;
    runtimeTarget?: "local_native" | "sandbox" | "remote";
    toolBackend?: "openhands_native" | "binary_host";
    pluginPacks?: BinaryPluginPack[];
    skillSources?: BinarySkillSource[];
    conversationId?: string | null;
    persistenceDir?: string | null;
    jsonlPath?: string | null;
    decision?: {
        mode: string;
        reason: string;
        confidence: number;
    };
    plan?: unknown;
    actions?: unknown[];
    final?: string;
    validationPlan?: ValidationPlan;
    targetInference?: {
        path?: string;
        confidence?: number;
        source?: string;
    };
    contextSelection?: {
        files?: Array<{
            path: string;
            reason: string;
            score?: number;
        }>;
        snippets?: number;
        usedCloudIndex?: boolean;
    };
    completionStatus?: "complete" | "incomplete";
    missingRequirements?: string[];
    modelAlias?: string;
    orchestrator?: "in_house" | "openhands";
    orchestratorVersion?: string | null;
    approvalState?: "autonomous" | "required" | "granted" | "denied" | "not_required";
    worldContextUsed?: {
        provided: boolean;
        tier?: string | null;
    };
    runId?: string;
    orchestrationProtocol?: string;
    adapter?: string;
    loopState?: LoopState | null;
    progressState?: ProgressState | null;
    objectiveState?: ObjectiveState | null;
    pendingToolCall?: PendingToolCall | null;
    toolTrace?: unknown[];
    reviewState?: Record<string, unknown> | null;
    receipt?: Record<string, unknown> | null;
};
export type ApiFailure = {
    success?: false;
    error?: string | {
        code?: string;
        message?: string;
    };
    code?: string;
    message?: string;
    details?: unknown;
};
export type AuthHeadersInput = {
    apiKey?: string;
    bearer?: string;
};
export type BinaryHostSurface = "desktop" | "cli" | "vsix" | "unknown";
export type BinaryHostClientInfo = {
    surface: BinaryHostSurface;
    version?: string;
};
export type BinaryAutomationPolicy = "autonomous" | "observe_only" | "approval_before_mutation";
export type BinaryAutomationTrigger = {
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
    workspaceRoot?: string;
    query: string;
} | {
    kind: "notification";
    workspaceRoot?: string;
    topic?: string;
    query?: string;
};
export type BinaryAutomationDefinition = {
    id: string;
    name: string;
    prompt: string;
    status: "active" | "paused";
    trigger: BinaryAutomationTrigger;
    policy: BinaryAutomationPolicy;
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
export type BinaryAutomationRunSummary = {
    automationId: string;
    runId: string;
    status: BinaryHostRunStatus;
    queuedAt: string;
    startedAt?: string;
    completedAt?: string;
    failedAt?: string;
};
export type BinaryAutomationEvent = SseEvent & {
    id: string;
    seq: number;
    capturedAt: string;
    scope: "automation" | "run" | "delivery";
    automationId?: string;
    runId?: string;
    triggerKind?: BinaryAutomationTrigger["kind"];
    source: "automation_runtime" | "scheduler" | "file_watch" | "process_watch" | "notification" | "host";
    severity: "info" | "warn" | "error";
};
export type BinaryWebhookSubscription = {
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
export type BinaryHostAuthStatus = {
    hasApiKey: boolean;
    maskedApiKey?: string | null;
    storageMode: "secure" | "file" | "none";
    configPath: string;
};
export type BinaryHostTrustGrant = {
    path: string;
    mutate: boolean;
    commands: "allow" | "prompt";
    network?: "allow" | "deny";
    elevated?: "allow" | "deny";
    grantedAt: string;
};
export type BinaryHostWorkspaceTrustMode = "untrusted" | "trusted_read_only" | "trusted_full_access" | "trusted_prompt_commands";
export type BinaryHostRunStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "takeover_required";
export type BinaryHostRunControlAction = "pause" | "resume" | "cancel" | "repair" | "takeover" | "retry_last_turn";
export type BinaryHostBudgetState = {
    maxSteps?: number;
    usedSteps: number;
    remainingSteps?: number;
    maxMutations?: number;
    usedMutations: number;
    remainingMutations?: number;
    exhausted: boolean;
    reason?: string;
};
export type BinaryHostCheckpointState = {
    count: number;
    lastCheckpointAt?: string;
    lastCheckpointSummary?: string;
};
export type BinaryHostLeaseState = {
    leaseId: string;
    workerId: string;
    startedAt: string;
    heartbeatAt: string;
    lastToolAt?: string;
};
export type BinaryHostRunTimingState = BinaryRunLatencyMetadata & {
    startedAt: string;
    firstVisibleTextAt?: string;
    firstToolRequestAt?: string;
    firstToolResultAt?: string;
    finalAt?: string;
    selectedSpeedProfile: "fast" | "balanced" | "thorough";
    selectedLatencyTier?: "fast" | "balanced" | "thorough";
    taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    startupPhase?: "fast_start" | "context_enrichment" | "full_run";
    startupPhaseDurations?: Record<string, number>;
    escalatedRoute?: boolean;
    escalationCount?: number;
    actionLatencyMs?: number;
};
export type BinaryHostExecutionState = BinaryRunLatencyMetadata & {
    adapterMode?: BinaryAdapterMode;
    latencyPolicy?: BinaryLatencyPolicy;
    timeoutPolicy?: string;
    budgetProfile?: string;
    firstTurnBudgetMs?: number;
    smallModelForced?: boolean;
    modelRoutingMode?: BinaryModelRoutingMode;
    fixedModelAlias?: string;
    fallbackEnabled?: boolean;
    coercionApplied?: boolean;
    seedToolInjected?: boolean;
    invalidToolNameRecovered?: boolean;
    targetAppIntent?: string;
    targetResolvedApp?: string;
    focusRecoveryAttempted?: boolean;
    recoverySuppressedReason?: string;
    verificationRequired?: boolean;
    verificationPassed?: boolean;
    cleanupClosedCount?: number;
    actionLatencyMs?: number;
};
export type BinaryHostRunControlEntry = {
    action: BinaryHostRunControlAction;
    note?: string | null;
    at: string;
};
export type BinaryHostPreferences = {
    baseUrl: string;
    trustedWorkspaces: BinaryHostTrustGrant[];
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
    orchestrationPolicy?: BinaryOrchestrationPolicy;
    automations?: BinaryAutomationDefinition[];
    webhookSubscriptions?: BinaryWebhookSubscription[];
};
export type BinaryHostAssistRequest = {
    task: string;
    mode: AssistMode;
    model: string;
    historySessionId?: string;
    workspaceRoot?: string;
    detach?: boolean;
    automationId?: string;
    automationTriggerKind?: BinaryAutomationTrigger["kind"];
    automationEventId?: string;
    executionLane?: BinaryExecutionLane;
    pluginPacks?: Array<BinaryPluginPack["id"]>;
    expectedLongRun?: boolean;
    requireIsolation?: boolean;
    debugTracing?: boolean;
    client?: BinaryHostClientInfo;
};
export type BinaryProviderFailureReason = "provider_credits_exhausted" | "router_blocked" | "tool_schema_incompatible" | "transient_api_failure" | "unknown_provider_failure";
export type BinaryModelCandidate = {
    alias?: string;
    model?: string;
    provider?: string;
    baseUrl?: string;
};
export type BinaryExecutionLane = "local_interactive" | "openhands_headless" | "openhands_remote";
export type BinaryPluginPack = {
    id: "web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice";
    title: string;
    description: string;
    source: "binary_managed" | "repo_local" | "requested";
    status: "available" | "missing";
    loadedLazily: boolean;
    skillCount: number;
    mcpServerCount: number;
};
export type BinarySkillSource = {
    id: string;
    label: string;
    kind: "repo_local" | "user" | "org";
    path?: string;
    available: boolean;
    loadedLazily: boolean;
};
export type BinaryHostHealth = {
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
        currentModelCandidate?: BinaryModelCandidate | null;
        lastProviderFailureReason?: BinaryProviderFailureReason | null;
        fallbackAvailable?: boolean;
        lastFallbackRecovered?: boolean;
        lastPersistenceDir?: string | null;
    } | null;
};
export type BinaryHostRunRecord = {
    id: string;
    status: BinaryHostRunStatus;
    createdAt: string;
    updatedAt: string;
    traceId: string;
    sessionId?: string;
    runId?: string;
    leaseId?: string;
    heartbeatAt?: string;
    lastToolAt?: string;
    resumeToken: string;
    workspaceRoot?: string;
    workspaceTrustMode: BinaryHostWorkspaceTrustMode;
    automationId?: string;
    automationTriggerKind?: BinaryAutomationTrigger["kind"];
    automationEventId?: string;
    executionLane?: BinaryExecutionLane;
    pluginPacks?: BinaryPluginPack[];
    skillSources?: BinarySkillSource[];
    conversationId?: string | null;
    persistenceDir?: string | null;
    client: BinaryHostClientInfo;
    request: BinaryHostAssistRequest;
    budgetState?: BinaryHostBudgetState | null;
    checkpointState?: BinaryHostCheckpointState | null;
    leaseState?: BinaryHostLeaseState | null;
    timingState?: BinaryHostRunTimingState | null;
    lastExecutionState?: BinaryHostExecutionState | null;
    lastPendingToolCallSignature?: string;
    repeatedPendingSignatureCount?: number;
    observationOnlyStreak?: number;
    takeoverReason?: string;
    finalEnvelope?: AssistRunEnvelope;
    error?: string;
    controlHistory: BinaryHostRunControlEntry[];
    toolResults: ToolResult[];
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
export type BinaryHostRunSummary = Pick<BinaryHostRunRecord, "id" | "status" | "createdAt" | "updatedAt" | "traceId" | "sessionId" | "runId" | "leaseId" | "heartbeatAt" | "lastToolAt" | "resumeToken" | "workspaceRoot" | "workspaceTrustMode" | "automationId" | "automationTriggerKind" | "automationEventId" | "executionLane" | "pluginPacks" | "skillSources" | "conversationId" | "persistenceDir" | "client" | "request" | "budgetState" | "checkpointState" | "timingState" | "lastExecutionState" | "takeoverReason" | "error"> & {
    eventCount: number;
};
export type BinaryHostRunEventsResponse = {
    run: BinaryHostRunSummary;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
    done: boolean;
};
export type BinaryAutomationEventsResponse = {
    automation: BinaryAutomationDefinition;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: BinaryAutomationEvent;
    }>;
};
export type BinaryAgentProbeTurn = {
    id: string;
    userMessage: string;
    assistantMessage?: string;
    status: "running" | "completed" | "failed";
    createdAt: string;
    completedAt?: string;
    error?: string;
    runId?: string;
    modelCandidate?: BinaryModelCandidate | null;
    fallbackAttempt?: number;
    failureReason?: BinaryProviderFailureReason | null;
    persistenceDir?: string | null;
    conversationId?: string | null;
};
export type BinaryAgentProbeSession = {
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
    currentModelCandidate?: BinaryModelCandidate | null;
    lastFailureReason?: BinaryProviderFailureReason | null;
    fallbackAvailable: boolean;
    lastFallbackRecovered: boolean;
    turnCount: number;
    turns: BinaryAgentProbeTurn[];
    events: BinaryAgentProbeEvent[];
};
export type BinaryAgentProbeEvent = {
    id: string;
    seq: number;
    capturedAt: string;
    event: SseEvent;
};
export type BinaryAgentProbeEventsResponse = {
    session: BinaryAgentProbeSession | null;
    events: BinaryAgentProbeEvent[];
    done: boolean;
};
export type BinaryAgentJobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "takeover_required";
export type BinaryAgentJob = {
    id: string;
    status: BinaryAgentJobStatus;
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
    requestedExecutionLane: BinaryExecutionLane;
    executionLane: BinaryExecutionLane;
    pluginPacks: BinaryPluginPack[];
    skillSources: BinarySkillSource[];
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
export type BinaryAgentJobEventsResponse = {
    job: BinaryAgentJob | null;
    events: Array<{
        seq: number;
        capturedAt: string;
        event: SseEvent;
    }>;
    done: boolean;
};
export type BinaryRemoteRuntimeHealth = {
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
export type SseEvent = {
    event?: string;
    data?: unknown;
    [key: string]: unknown;
};

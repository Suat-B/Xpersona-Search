type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type HostedAssistRequest = {
    task: string;
    mode: AssistMode;
    model: string;
    imageInputs?: Array<{
        mimeType?: string;
        dataUrl?: string;
        base64?: string;
        url?: string;
        caption?: string;
        name?: string;
        source?: string;
    }>;
    speedProfile?: "fast" | "balanced" | "thorough";
    startupPhase?: "fast_start" | "context_enrichment" | "full_run";
    routePolicy?: {
        turnBudgetMs?: number;
        maxIterations?: number;
        stallTimeoutMs?: number;
        missionFirstBrowser?: boolean;
    };
    chatModelSource?: "platform" | "user_connected";
    fallbackToPlatformModel?: boolean;
    historySessionId?: string;
    execution?: {
        lane?: "local_interactive" | "openhands_headless" | "openhands_remote";
        pluginPacks?: Array<{
            id: string;
            title?: string;
        }>;
        skillSources?: Array<{
            id: string;
            kind?: string;
            path?: string;
        }>;
        traceId?: string;
        traceSampled?: boolean;
    };
    tom?: {
        enabled?: boolean;
    };
    mcp?: {
        mcpServers: Record<string, Record<string, unknown>>;
    };
    context?: Record<string, unknown>;
    clientCapabilities?: {
        toolLoop?: boolean;
        supportedTools?: string[];
        autoExecute?: boolean;
        supportsNativeToolResults?: boolean;
    };
    userConnectedModels?: Array<{
        alias: string;
        provider: string;
        displayName: string;
        model: string;
        baseUrl: string;
        apiKey: string;
        authSource: "user_connected";
        candidateSource: "user_connected";
        preferred?: boolean;
        latencyTier?: "fast" | "balanced" | "thorough";
        reasoningDefault?: "low" | "medium" | "high";
        intendedUse?: "chat" | "action" | "repair";
    }>;
};
export type HostedToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    kind?: "observe" | "mutate" | "command";
    summary?: string;
};
export type HostedPendingToolCall = {
    step: number;
    adapter: string;
    requiresClientExecution: boolean;
    toolCall: HostedToolCall;
    availableTools?: string[];
    createdAt: string;
};
export type HostedToolResult = {
    toolCallId: string;
    name: string;
    ok: boolean;
    blocked?: boolean;
    summary: string;
    data?: Record<string, unknown>;
    error?: string;
    createdAt?: string;
};
export type HostedAssistRunEnvelope = {
    sessionId?: string;
    traceId?: string;
    executionLane?: "local_interactive" | "openhands_headless" | "openhands_remote";
    pluginPacks?: unknown[];
    skillSources?: unknown[];
    conversationId?: string | null;
    persistenceDir?: string | null;
    jsonlPath?: string | null;
    final?: string;
    completionStatus?: "complete" | "incomplete";
    runId?: string;
    adapter?: string;
    pendingToolCall?: HostedPendingToolCall | null;
    receipt?: Record<string, unknown> | null;
    reviewState?: Record<string, unknown> | null;
    loopState?: {
        stepCount?: number;
        mutationCount?: number;
        maxSteps?: number;
        maxMutations?: number;
        repeatedCallCount?: number;
        repairCount?: number;
        status?: string;
    } | null;
    progressState?: {
        status?: string;
        stallReason?: string;
        nextDeterministicAction?: string;
    } | null;
    missingRequirements?: string[];
    [key: string]: unknown;
};
export type HostedAgentProbeRequest = {
    message: string;
    model?: string;
    gatewayRunId?: string;
    workspaceRoot?: string;
    context?: Record<string, unknown>;
    conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
    tom?: {
        enabled?: boolean;
        userKey?: string;
        sessionId?: string;
        traceId?: string;
    };
};
export type HostedAgentProbeResponse = {
    runId: string;
    final: string;
    logs: string[];
    adapter?: string;
    toolCall?: HostedToolCall;
    version?: string | null;
    modelCandidate?: Record<string, unknown> | null;
    fallbackAttempt?: number;
    failureReason?: string | null;
    persistenceDir?: string | null;
    conversationId?: string | null;
    fallbackTrail?: Array<Record<string, unknown>>;
};
type FetchLike = typeof fetch;
export declare function streamHostedAssist(input: {
    baseUrl: string;
    apiKey: string;
    request: HostedAssistRequest;
    onEvent: (event: Record<string, unknown>) => Promise<void> | void;
}, options?: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
    streamIdleTimeoutMs?: number;
}): Promise<HostedAssistRunEnvelope>;
export declare function continueHostedRun(input: {
    baseUrl: string;
    apiKey: string;
    runId: string;
    toolResult: HostedToolResult;
    sessionId?: string;
}, options?: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
}): Promise<HostedAssistRunEnvelope>;
export declare function runHostedAgentProbe(input: {
    baseUrl: string;
    apiKey: string;
    request: HostedAgentProbeRequest;
}, options?: {
    fetchImpl?: FetchLike;
    fetchTimeoutMs?: number;
}): Promise<HostedAgentProbeResponse>;
export {};

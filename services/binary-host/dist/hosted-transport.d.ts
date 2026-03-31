type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type HostedAssistRequest = {
    task: string;
    mode: AssistMode;
    model: string;
    historySessionId?: string;
    context?: Record<string, unknown>;
    clientCapabilities?: {
        toolLoop?: boolean;
        supportedTools?: string[];
        autoExecute?: boolean;
        supportsNativeToolResults?: boolean;
    };
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
export {};

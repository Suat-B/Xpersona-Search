export type BinaryProviderFailureReason = "provider_credits_exhausted" | "router_blocked" | "tool_schema_incompatible" | "transient_api_failure" | "unknown_provider_failure";
export type BinaryModelCandidate = {
    alias?: string;
    model?: string;
    provider?: string;
    baseUrl?: string;
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
    event: Record<string, unknown>;
};
type ProbeExecutionResult = {
    runId: string;
    final: string;
    logs: string[];
    modelCandidate?: BinaryModelCandidate | null;
    fallbackAttempt?: number;
    failureReason?: string | null;
    persistenceDir?: string | null;
    conversationId?: string | null;
    fallbackTrail?: Array<Record<string, unknown>>;
};
export declare class AgentProbeManager {
    private readonly storagePath;
    private state;
    constructor(storagePath: string);
    initialize(): Promise<void>;
    createSession(input: {
        title?: string;
        model?: string;
        workspaceRoot?: string;
    }): Promise<BinaryAgentProbeSession>;
    getSession(sessionId: string): Promise<BinaryAgentProbeSession | null>;
    getSessionEvents(sessionId: string, after?: number): Promise<{
        session: BinaryAgentProbeSession | null;
        events: BinaryAgentProbeEvent[];
        done: boolean;
    }>;
    controlSession(sessionId: string, action: "pause" | "resume" | "close"): Promise<BinaryAgentProbeSession | null>;
    submitMessage(sessionId: string, input: {
        message: string;
    }, executor: (input: {
        message: string;
        model?: string;
        gatewayRunId?: string;
        conversationHistory: Array<{
            role: "user" | "assistant";
            content: string;
        }>;
        workspaceRoot?: string;
    }) => Promise<ProbeExecutionResult>): Promise<BinaryAgentProbeSession | null>;
    private appendEvent;
    private persist;
}
export {};

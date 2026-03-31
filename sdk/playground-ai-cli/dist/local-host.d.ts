import { type SseEvent } from "./http.js";
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
};
export type LocalHostAssistRequest = {
    task: string;
    mode: AssistMode;
    model: string;
    historySessionId?: string;
    workspaceRoot?: string;
    detach?: boolean;
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
    controlRun(runId: string, action: LocalHostRunControlAction, note?: string): Promise<LocalHostRunSummary>;
    exportRun(runId: string): Promise<LocalHostRunRecord>;
}

import { AuthHeadersInput, SseEvent } from "./http.js";
import { AssistMode, AssistRunEnvelope, BillingCycle, PlanTier, ToolResult } from "./types.js";
type ClientOptions = {
    baseUrl: string;
    auth: AuthHeadersInput;
};
type AssistInput = {
    task: string;
    mode: AssistMode;
    model?: string;
    reasoning?: string;
    historySessionId?: string;
    stream?: boolean;
};
type ExecuteAction = {
    type: "command";
    command: string;
    cwd?: string;
    timeoutMs?: number;
} | {
    type: "edit";
    path: string;
    patch?: string;
    diff?: string;
} | {
    type: "rollback";
    snapshotId: string;
};
type IndexChunk = {
    pathHash: string;
    chunkHash: string;
    pathDisplay: string;
    content: string;
    metadata?: Record<string, unknown>;
};
export type HostedAssistMode = "auto" | "plan" | "yolo";
export declare function toHostedAssistMode(mode: AssistMode): HostedAssistMode;
export declare class PlaygroundClient {
    private readonly baseUrl;
    private auth;
    constructor(options: ClientOptions);
    setAuth(auth: AuthHeadersInput): void;
    createSession(title?: string, mode?: AssistMode): Promise<string | null>;
    assistStream(input: AssistInput, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void>;
    assist(input: AssistInput): Promise<unknown>;
    listSessions(limit?: number): Promise<unknown>;
    getSessionMessages(sessionId: string, includeAgentEvents?: boolean): Promise<unknown>;
    replay(sessionId: string, workspaceFingerprint: string, mode?: AssistMode): Promise<unknown>;
    continueRun(runId: string, toolResult: ToolResult, sessionId?: string): Promise<AssistRunEnvelope>;
    execute(sessionId: string | undefined, workspaceFingerprint: string, actions: ExecuteAction[]): Promise<unknown>;
    indexUpsert(projectKey: string, chunks: IndexChunk[]): Promise<unknown>;
    indexQuery(projectKey: string, query: string, limit?: number): Promise<unknown>;
    usage(): Promise<unknown>;
    checkout(tier?: PlanTier, billing?: BillingCycle): Promise<unknown>;
}
export {};

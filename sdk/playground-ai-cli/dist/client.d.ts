import { SseEvent } from "./http.js";
import { AssistMode, BillingCycle, PlanTier } from "./types.js";
type ClientOptions = {
    baseUrl: string;
    apiKey: string;
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
export declare class PlaygroundClient {
    private readonly baseUrl;
    private readonly apiKey;
    constructor(options: ClientOptions);
    createSession(title?: string, mode?: AssistMode): Promise<string | null>;
    assistStream(input: AssistInput, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void>;
    assist(input: AssistInput): Promise<unknown>;
    listSessions(limit?: number): Promise<unknown>;
    getSessionMessages(sessionId: string, includeAgentEvents?: boolean): Promise<unknown>;
    replay(sessionId: string, workspaceFingerprint: string, mode?: AssistMode): Promise<unknown>;
    execute(sessionId: string | undefined, workspaceFingerprint: string, actions: ExecuteAction[]): Promise<unknown>;
    indexUpsert(projectKey: string, chunks: IndexChunk[]): Promise<unknown>;
    indexQuery(projectKey: string, query: string, limit?: number): Promise<unknown>;
    usage(): Promise<unknown>;
    checkout(tier?: PlanTier, billing?: BillingCycle): Promise<unknown>;
}
export {};

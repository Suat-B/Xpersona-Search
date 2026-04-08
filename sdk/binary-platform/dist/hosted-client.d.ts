import { AssistMode, AssistRunEnvelope, AuthHeadersInput, HostedAssistMode, SseEvent, ToolResult } from "./types.js";
export declare function toHostedAssistMode(mode: AssistMode): HostedAssistMode;
export declare class BinaryHostedClient {
    private readonly baseUrl;
    private readonly auth?;
    constructor(input: {
        baseUrl: string;
        auth?: AuthHeadersInput;
    });
    createSession(title?: string, mode?: AssistMode): Promise<string | null>;
    assistStream(input: {
        task: string;
        mode: AssistMode;
        model?: string;
        historySessionId?: string;
    }, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void>;
    continueRun(runId: string, toolResult: ToolResult, sessionId?: string): Promise<AssistRunEnvelope>;
    usage(): Promise<unknown>;
}

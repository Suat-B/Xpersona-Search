type SessionStatus = "running" | "exited" | "failed";
export type InteractiveTerminalSessionView = {
    sessionId: string;
    cwd: string;
    shell: string;
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string;
    status: SessionStatus;
    exitCode: number | null;
    cursor: number;
    name?: string;
};
type StartSessionInput = {
    cwd?: string;
    shell?: string;
    name?: string;
    waitForMs?: number;
    timeoutMs?: number;
};
type ReadSessionInput = {
    sessionId: string;
    afterCursor?: number;
    waitForMs?: number;
    timeoutMs?: number;
    maxChars?: number;
    markRead?: boolean;
};
type SendInput = {
    sessionId: string;
    input: string;
    appendNewline?: boolean;
    waitForMs?: number;
    timeoutMs?: number;
    maxChars?: number;
};
export declare class InteractiveTerminalRuntime {
    private readonly sessions;
    startSession(input: StartSessionInput): Promise<{
        session: InteractiveTerminalSessionView;
        output: string;
        truncated: boolean;
    }>;
    listSessions(): InteractiveTerminalSessionView[];
    getSession(sessionId: string): InteractiveTerminalSessionView | null;
    sendInput(input: SendInput): Promise<{
        session: InteractiveTerminalSessionView;
        output: string;
        truncated: boolean;
    }>;
    readOutput(input: ReadSessionInput): Promise<{
        session: InteractiveTerminalSessionView;
        output: string;
        truncated: boolean;
    }>;
    terminateSession(sessionId: string): Promise<InteractiveTerminalSessionView>;
    private appendChunk;
    private currentCursor;
    private sliceBuffer;
    private waitForQuiet;
    private requireSession;
    private toView;
}
export {};

import type { HostedChatMessage, HostedHistoryItem, RequestAuth } from "./types";
export declare class HostedSessionHistoryService<Mode extends string = string> {
    private readonly getBaseApiUrl;
    private readonly fallbackMode;
    constructor(getBaseApiUrl: () => string, fallbackMode: Mode);
    list(auth: RequestAuth, limit?: number): Promise<HostedHistoryItem<Mode>[]>;
    loadMessages(auth: RequestAuth, sessionId: string): Promise<HostedChatMessage[]>;
}

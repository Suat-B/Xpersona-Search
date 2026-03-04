export declare class CliHttpError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(message: string, status: number, details?: unknown);
}
export type JsonRequestInput = {
    baseUrl: string;
    apiKey: string;
    path: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
};
export declare function requestJson<T>(input: JsonRequestInput): Promise<T>;
export type SseEvent = {
    event?: string;
    data?: unknown;
    [key: string]: unknown;
};
export type StreamRequestInput = {
    baseUrl: string;
    apiKey: string;
    path: string;
    body: unknown;
    onEvent: (event: SseEvent) => void | Promise<void>;
};
export declare function requestSse(input: StreamRequestInput): Promise<void>;

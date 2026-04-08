export declare class CliHttpError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(message: string, status: number, details?: unknown);
}
export type AuthHeadersInput = {
    apiKey?: string;
    bearer?: string;
};
export type JsonRequestInput = {
    baseUrl: string;
    auth: AuthHeadersInput;
    path: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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
    auth: AuthHeadersInput;
    path: string;
    method?: "GET" | "POST";
    body?: unknown;
    onEvent: (event: SseEvent) => void | Promise<void>;
};
export declare function requestSse(input: StreamRequestInput): Promise<void>;

import { AuthHeadersInput, SseEvent } from "./types.js";
export declare class BinaryPlatformHttpError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(message: string, status: number, details?: unknown);
}
export declare function requestJson<T>(input: {
    url: string;
    auth?: AuthHeadersInput;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
}): Promise<T>;
export declare function requestSse(input: {
    url: string;
    auth?: AuthHeadersInput;
    method?: "GET" | "POST";
    body?: unknown;
    onEvent: (event: SseEvent) => void | Promise<void>;
}): Promise<void>;

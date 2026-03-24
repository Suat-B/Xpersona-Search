import type { RequestAuth } from "./types";
export declare function requestJson<T>(method: string, url: string, auth?: RequestAuth | null, body?: unknown, options?: {
    signal?: AbortSignal;
}): Promise<T>;
export declare function streamJsonEvents(method: string, url: string, auth: RequestAuth | null | undefined, body: unknown, onEvent: (event: string, data: unknown) => void | Promise<void>, options?: {
    signal?: AbortSignal;
}): Promise<void>;

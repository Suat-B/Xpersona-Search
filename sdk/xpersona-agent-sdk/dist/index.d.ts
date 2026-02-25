export type ApiMeta = {
    requestId: string;
    version: "v1";
    timestamp: string;
};
export type ApiSuccess<T> = {
    success: true;
    data: T;
    meta: ApiMeta;
};
export type ApiError = {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
};
export type ApiErrorEnvelope = {
    success: false;
    error: ApiError;
    meta: ApiMeta;
};
export type SearchOutcomePayload = {
    querySignature: string;
    selectedResultId: string;
    outcome: "success" | "failure" | "timeout";
    taskType?: string;
    query?: string;
    failureCode?: "auth" | "rate_limit" | "tool_error" | "schema_mismatch";
    executionPath?: "single" | "delegated" | "bundled";
    budgetExceeded?: boolean;
    latencyMs?: number;
    costUsd?: number;
    modelUsed?: string;
    tokensInput?: number;
    tokensOutput?: number;
};
export type RequestOptions = {
    idempotencyKey?: string;
    fetchImpl?: typeof fetch;
};
export type ReportOptions = {
    idempotencyKey?: string;
    idempotencyPrefix?: string;
    fetchImpl?: typeof fetch;
};
export type ClientConfig = {
    apiKey: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
};
export declare class XpersonaClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly fetchImpl;
    constructor(config: ClientConfig);
    postSearchOutcome(payload: SearchOutcomePayload, options?: RequestOptions): Promise<ApiSuccess<Record<string, unknown>>>;
    reportSearchOutcome(payload: SearchOutcomePayload, options?: ReportOptions): Promise<ApiSuccess<Record<string, unknown>>>;
}

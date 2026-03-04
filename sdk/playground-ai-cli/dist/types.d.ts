export type AssistMode = "auto" | "plan" | "yolo" | "generate" | "debug";
export type BillingCycle = "monthly" | "yearly";
export type PlanTier = "starter" | "builder" | "studio";
export type CliConfig = {
    baseUrl: string;
    apiKey?: string;
    mode?: AssistMode;
    model?: string;
    reasoning?: "low" | "medium" | "high" | "max";
    includeIdeContext?: boolean;
};
export type ApiSuccess<T> = {
    success: true;
    data: T;
    requestId?: string;
};
export type ApiFailure = {
    success?: false;
    error?: string | {
        code?: string;
        message?: string;
    };
    code?: string;
    message?: string;
    details?: unknown;
};

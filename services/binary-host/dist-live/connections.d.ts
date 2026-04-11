export type BinaryConnectionTransport = "http" | "sse";
export type BinaryConnectionAuthMode = "none" | "bearer" | "api-key" | "oauth";
export type BinaryConnectionSource = "starter" | "guided" | "imported";
export type BinaryConnectionStatus = "connected" | "disabled" | "needs_auth" | "failed_test";
export type BinaryConnectionAuthHealth = "ready" | "needs_reauth" | "refresh_failed" | "expired" | "blocked";
export type BinaryProviderId = "openai" | "chatgpt_portal" | "qwen_dashscope" | "qwen_portal" | "openrouter" | "anthropic" | "gemini" | "groq" | "github_models" | "azure_openai" | "vertex_ai";
export type BinaryProviderAuthStrategy = "api_key" | "oauth_pkce" | "oauth_device" | "browser_session";
export type BinaryProviderConnectionMode = "direct_oauth_pkce" | "direct_oauth_device" | "hub_oauth" | "portal_session" | "local_credential_adapter" | "api_key_only" | "unsupported";
export type BinaryProviderOauthCapability = "none" | "pkce_public_client" | "device_code" | "brokered_confidential_client";
export type BinaryProviderModelCoverageMode = "provider_direct" | "hub_catalog";
export type BinaryConnectionRecord = {
    id: string;
    name: string;
    transport: BinaryConnectionTransport;
    url: string;
    authMode: BinaryConnectionAuthMode;
    enabled: boolean;
    source: BinaryConnectionSource;
    createdAt: string;
    updatedAt: string;
    headerName?: string;
    publicHeaders?: Record<string, string>;
    importedFrom?: string;
    oauthSupported?: boolean;
    lastValidatedAt?: string;
    lastValidationOk?: boolean;
    lastValidationError?: string;
    providerId?: BinaryProviderId;
    providerAuthStrategy?: BinaryProviderAuthStrategy;
    defaultBaseUrl?: string;
    defaultModel?: string;
    preferredForModels?: boolean;
    linkedAccountLabel?: string;
    linkedAt?: string;
    lastRefreshedAt?: string;
    authHealth?: BinaryConnectionAuthHealth;
    refreshFailureCount?: number;
    lastAuthError?: string;
    runtimeReady?: boolean;
    runtimeReadinessReason?: string;
    routeKind?: string;
    routeLabel?: string;
    routeReason?: string;
    modelFamilies?: string[];
    availableModels?: string[];
};
export type BinaryConnectionSecretRecord = {
    bearerToken?: string;
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    scopes?: string[];
    idToken?: string;
    accountHint?: string;
    tenantHint?: string;
    tokenType?: string;
    sessionToken?: string;
    cookieJarRef?: string;
    importedFrom?: string;
    secretHeaders?: Record<string, string>;
};
export type BinaryConnectionView = BinaryConnectionRecord & {
    status: BinaryConnectionStatus;
    hasSecret: boolean;
};
export type ConnectionDraftInput = {
    id?: string;
    name?: string;
    transport?: unknown;
    url?: unknown;
    authMode?: unknown;
    enabled?: unknown;
    source?: unknown;
    headerName?: unknown;
    publicHeaders?: unknown;
    oauthSupported?: unknown;
    importedFrom?: unknown;
};
export type ImportedConnectionDefinition = {
    record: Omit<BinaryConnectionRecord, "id" | "createdAt" | "updatedAt" | "lastValidatedAt" | "lastValidationOk" | "lastValidationError">;
    secret: BinaryConnectionSecretRecord;
};
export declare function validateConnectionDraft(input: ConnectionDraftInput): {
    ok: true;
    draft: {
        id?: string;
        name: string;
        transport: BinaryConnectionTransport;
        url: string;
        authMode: BinaryConnectionAuthMode;
        enabled: boolean;
        source: BinaryConnectionSource;
        headerName?: string;
        publicHeaders?: Record<string, string>;
        oauthSupported?: boolean;
        importedFrom?: string;
    };
} | {
    ok: false;
    message: string;
};
export declare function connectionHasRequiredSecret(record: Pick<BinaryConnectionRecord, "authMode">, secret: BinaryConnectionSecretRecord | null | undefined): boolean;
export declare function getConnectionStatus(record: Pick<BinaryConnectionRecord, "enabled" | "authMode" | "lastValidationOk" | "lastValidationError">, secret: BinaryConnectionSecretRecord | null | undefined): BinaryConnectionStatus;
export declare function buildConnectionView(record: BinaryConnectionRecord, secret: BinaryConnectionSecretRecord | null | undefined): BinaryConnectionView;
export declare function materializeConnectionForOpenHands(record: BinaryConnectionRecord, secret: BinaryConnectionSecretRecord | null | undefined): Record<string, unknown> | null;
export declare function buildOpenHandsMcpConfig(records: BinaryConnectionRecord[], secrets: Record<string, BinaryConnectionSecretRecord | null | undefined>): {
    mcpServers: Record<string, Record<string, unknown>>;
} | undefined;
export declare function importConnectionsFromMcpJson(raw: string, importedFrom?: string): {
    ok: true;
    definitions: ImportedConnectionDefinition[];
} | {
    ok: false;
    message: string;
};

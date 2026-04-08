import type { BinaryProviderId } from "./connections.js";
export type OAuthSessionStatus = "pending_browser" | "awaiting_callback" | "connected" | "failed" | "cancelled";
export type OAuthProviderRuntimeConfig = {
    providerId: BinaryProviderId;
    clientId: string;
    clientSecret?: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    revocationEndpoint?: string;
    deviceAuthorizationEndpoint?: string;
    scopes: string[];
    redirectUri: string;
    extraAuthorizationParams?: Record<string, string>;
    extraTokenParams?: Record<string, string>;
};
export type OAuthSessionTokenSet = {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    scopes?: string[];
    idToken?: string;
    accountHint?: string;
    tenantHint?: string;
    tokenType?: string;
};
export type OAuthStartSessionInput = {
    providerId: BinaryProviderId;
    config: OAuthProviderRuntimeConfig;
    metadata?: Record<string, unknown>;
};
export type OAuthPollView = {
    sessionId: string;
    providerId: BinaryProviderId;
    status: OAuthSessionStatus;
    authorizeUrl?: string;
    verificationUri?: string;
    userCode?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
};
export type StoredOAuthSession = OAuthPollView & {
    state: string;
    codeVerifier?: string;
    tokenSet?: OAuthSessionTokenSet;
    metadata?: Record<string, unknown>;
    config: OAuthProviderRuntimeConfig;
};
export declare class OAuthSessionManager {
    private readonly sessions;
    private readonly sessionsByState;
    startPkceSession(input: OAuthStartSessionInput): OAuthPollView;
    startDeviceSession(input: OAuthStartSessionInput): Promise<OAuthPollView>;
    getSession(sessionId: string): StoredOAuthSession | null;
    getPollView(sessionId: string): OAuthPollView | null;
    completeCallback(callbackUrl: URL): Promise<StoredOAuthSession>;
    refreshSessionToken(input: {
        sessionOrConfig: StoredOAuthSession | OAuthProviderRuntimeConfig;
        refreshToken: string;
    }): Promise<OAuthSessionTokenSet>;
    revokeSessionToken(input: {
        sessionOrConfig: StoredOAuthSession | OAuthProviderRuntimeConfig;
        token: string;
    }): Promise<void>;
    markSessionCancelled(sessionId: string): void;
    deleteSession(sessionId: string): void;
    private toPollView;
}

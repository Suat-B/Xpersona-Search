import type { BinaryConnectionSecretRecord, BinaryProviderId } from "./connections.js";
export type BrowserProviderSessionStatus = "pending_browser" | "awaiting_import" | "importing" | "connected" | "failed" | "cancelled";
export type BrowserProviderSessionView = {
    sessionId: string;
    providerId: BinaryProviderId;
    status: BrowserProviderSessionStatus;
    launchUrl: string;
    importPathHints?: string[];
    note?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
};
export type ImportedBrowserProviderAuth = {
    providerId: BinaryProviderId;
    secret: BinaryConnectionSecretRecord;
    importedFrom: string;
    linkedAccountLabel?: string;
};
type StoredBrowserProviderSession = BrowserProviderSessionView & {
    linkedAccountLabel?: string;
    importedAuth?: ImportedBrowserProviderAuth;
    metadata?: Record<string, unknown>;
};
export declare class BrowserSessionManager {
    private readonly sessions;
    start(providerId: BinaryProviderId, metadata?: Record<string, unknown>): BrowserProviderSessionView;
    get(sessionId: string): StoredBrowserProviderSession | null;
    getView(sessionId: string): BrowserProviderSessionView | null;
    tryImport(providerId: BinaryProviderId): Promise<ImportedBrowserProviderAuth | null>;
    poll(sessionId: string): Promise<StoredBrowserProviderSession | null>;
    cancel(sessionId: string): BrowserProviderSessionView | null;
    getImportedAuth(sessionId: string): ImportedBrowserProviderAuth | null;
    getMetadata(sessionId: string): Record<string, unknown> | null;
    private toView;
}
export {};

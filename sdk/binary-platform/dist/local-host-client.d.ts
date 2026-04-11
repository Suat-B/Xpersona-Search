import { BinaryAgentJob, BinaryAgentJobEventsResponse, BinaryAgentProbeEventsResponse, BinaryAgentProbeSession, BinaryAutomationDefinition, BinaryAutomationEventsResponse, BinaryOpenHandsCapabilities, BinaryOrchestrationPolicy, BinaryRemoteRuntimeHealth, BinaryWebhookSubscription, BinaryHostAssistRequest, BinaryHostAuthStatus, BinaryHostHealth, BinaryHostPreferences, BinaryHostRunControlAction, BinaryHostRunEventsResponse, BinaryHostRunRecord, BinaryHostRunSummary, BinaryHostTrustGrant, SseEvent } from "./types.js";
export declare class BinaryLocalHostClient {
    private readonly baseUrl;
    constructor(baseUrl?: string);
    get url(): string;
    health(): Promise<BinaryHostHealth>;
    authStatus(): Promise<BinaryHostAuthStatus>;
    setApiKey(apiKey: string): Promise<BinaryHostAuthStatus>;
    clearApiKey(): Promise<BinaryHostAuthStatus>;
    preferences(): Promise<BinaryHostPreferences>;
    openHandsCapabilities(workspaceRoot?: string): Promise<BinaryOpenHandsCapabilities>;
    orchestrationPolicy(): Promise<BinaryOrchestrationPolicy>;
    updateOrchestrationPolicy(patch: Partial<BinaryOrchestrationPolicy>): Promise<BinaryOrchestrationPolicy>;
    updatePreferences(patch: Partial<BinaryHostPreferences>): Promise<BinaryHostPreferences>;
    trustWorkspace(input: {
        path: string;
        mutate?: boolean;
        commands?: "allow" | "prompt";
        network?: "allow" | "deny";
        elevated?: "allow" | "deny";
    }): Promise<BinaryHostTrustGrant[]>;
    assistStream(input: BinaryHostAssistRequest, onEvent: (event: SseEvent) => void | Promise<void>): Promise<void>;
    startDetachedRun(input: BinaryHostAssistRequest): Promise<BinaryHostRunSummary>;
    listRuns(limit?: number): Promise<{
        runs: BinaryHostRunSummary[];
    }>;
    getRun(runId: string): Promise<BinaryHostRunRecord>;
    getRunEvents(runId: string, after?: number): Promise<BinaryHostRunEventsResponse>;
    streamRun(runId: string, onEvent: (event: SseEvent) => void | Promise<void>, after?: number): Promise<void>;
    controlRun(runId: string, action: BinaryHostRunControlAction, note?: string): Promise<BinaryHostRunSummary>;
    exportRun(runId: string): Promise<BinaryHostRunRecord>;
    createAgentProbeSession(input: {
        title?: string;
        model?: string;
        workspaceRoot?: string;
        message?: string;
    }): Promise<BinaryAgentProbeSession>;
    getAgentProbeSession(sessionId: string): Promise<BinaryAgentProbeSession>;
    submitAgentProbeMessage(sessionId: string, input: {
        message: string;
    }): Promise<BinaryAgentProbeSession>;
    getAgentProbeEvents(sessionId: string, after?: number): Promise<BinaryAgentProbeEventsResponse>;
    controlAgentProbeSession(sessionId: string, action: "pause" | "resume" | "close"): Promise<BinaryAgentProbeSession>;
    createAgentJob(input: BinaryHostAssistRequest): Promise<BinaryAgentJob>;
    listAgentJobs(limit?: number): Promise<{
        jobs: BinaryAgentJob[];
    }>;
    getAgentJob(jobId: string): Promise<BinaryAgentJob>;
    getAgentJobEvents(jobId: string, after?: number): Promise<BinaryAgentJobEventsResponse>;
    streamAgentJob(jobId: string, onEvent: (event: SseEvent) => void | Promise<void>, after?: number): Promise<void>;
    controlAgentJob(jobId: string, action: "pause" | "resume" | "cancel", note?: string): Promise<BinaryAgentJob>;
    remoteAgentHealth(): Promise<BinaryRemoteRuntimeHealth>;
    listAutomations(): Promise<{
        automations: BinaryAutomationDefinition[];
    }>;
    saveAutomation(input: Partial<BinaryAutomationDefinition> & Pick<BinaryAutomationDefinition, "name" | "prompt" | "trigger">): Promise<BinaryAutomationDefinition>;
    getAutomation(automationId: string): Promise<BinaryAutomationDefinition>;
    updateAutomation(automationId: string, patch: Partial<BinaryAutomationDefinition>): Promise<BinaryAutomationDefinition>;
    controlAutomation(automationId: string, action: "pause" | "resume"): Promise<BinaryAutomationDefinition>;
    runAutomation(automationId: string): Promise<BinaryHostRunSummary>;
    getAutomationEvents(automationId: string, after?: number): Promise<BinaryAutomationEventsResponse>;
    streamAutomationEvents(automationId: string, onEvent: (event: SseEvent) => void | Promise<void>, after?: number): Promise<void>;
    listWebhookSubscriptions(): Promise<{
        subscriptions: BinaryWebhookSubscription[];
    }>;
    saveWebhookSubscription(input: Partial<BinaryWebhookSubscription> & Pick<BinaryWebhookSubscription, "url">): Promise<BinaryWebhookSubscription>;
}

export type BinaryAutomationPolicy = "autonomous" | "observe_only" | "approval_before_mutation";
export type BinaryAutomationTriggerKind = "manual" | "schedule_nl" | "file_event" | "process_event" | "notification";
export type BinaryAutomationTrigger = {
    kind: "manual";
    workspaceRoot?: string;
} | {
    kind: "schedule_nl";
    scheduleText: string;
    workspaceRoot?: string;
} | {
    kind: "file_event";
    workspaceRoot: string;
    includes?: string[];
    excludes?: string[];
} | {
    kind: "process_event";
    workspaceRoot?: string;
    query: string;
} | {
    kind: "notification";
    workspaceRoot?: string;
    topic?: string;
    query?: string;
};
export type BinaryAutomationDefinition = {
    id: string;
    name: string;
    prompt: string;
    status: "active" | "paused";
    trigger: BinaryAutomationTrigger;
    policy: BinaryAutomationPolicy;
    workspaceRoot?: string;
    model?: string;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    lastTriggerAt?: string;
    lastRunId?: string;
    lastTriggerSummary?: string;
    nextRunAt?: string;
    lastDeliveryAt?: string;
    lastDeliveryError?: string;
    deliveryHealth?: "healthy" | "failing" | "idle";
};
export type BinaryWebhookSubscription = {
    id: string;
    url: string;
    status: "active" | "paused";
    secret?: string;
    automationId?: string;
    events?: string[];
    createdAt: string;
    updatedAt: string;
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    failureCount?: number;
};
export type StoredAutomationEvent = {
    seq: number;
    capturedAt: string;
    event: Record<string, unknown>;
};
type RuntimeConfig = {
    automations: BinaryAutomationDefinition[];
    webhookSubscriptions: BinaryWebhookSubscription[];
    trustedWorkspaceRoots: string[];
};
type QueueRunResult = {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
};
type AutomationRuntimeInput = {
    storagePath: string;
    readConfig: () => Promise<RuntimeConfig>;
    writeConfig: (config: RuntimeConfig) => Promise<void>;
    queueAutomationRun: (input: {
        automation: BinaryAutomationDefinition;
        triggerSummary: string;
        triggerKind: BinaryAutomationTriggerKind;
        eventId: string;
        workspaceRoot?: string;
    }) => Promise<QueueRunResult>;
    getDesktopSnapshot: () => Promise<{
        activeWindow?: {
            id?: string;
            title?: string;
            app?: string;
        };
    }>;
    fetchImpl?: typeof fetch;
};
export declare function interpretAutomationSchedule(scheduleText: string, now?: Date, lastTriggeredAt?: string): string | null;
export declare function legacyAgentToAutomation(input: {
    id: string;
    name: string;
    prompt: string;
    status: "active" | "paused";
    trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification";
    scheduleMinutes?: number;
    workspaceRoot?: string;
    model?: string;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
}): BinaryAutomationDefinition;
export declare function automationToLegacyAgent(automation: BinaryAutomationDefinition): {
    id: string;
    name: string;
    prompt: string;
    status: "active" | "paused";
    trigger: "manual" | "scheduled" | "file_event" | "process_event" | "notification";
    scheduleMinutes?: number;
    workspaceRoot?: string;
    model?: string;
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
};
export declare class AutomationRuntime {
    private readonly input;
    private readonly fetchImpl;
    private state;
    private initialized;
    private schedulerTimer;
    private processTimer;
    private deliveryTimer;
    private readonly watchers;
    private readonly fileDebounce;
    constructor(input: AutomationRuntimeInput);
    initialize(): Promise<void>;
    start(): Promise<void>;
    refreshConfig(): Promise<void>;
    stop(): Promise<void>;
    listAutomations(): Promise<BinaryAutomationDefinition[]>;
    getAutomation(id: string): Promise<BinaryAutomationDefinition | null>;
    saveAutomation(raw: Partial<BinaryAutomationDefinition> & Pick<BinaryAutomationDefinition, "name" | "prompt" | "trigger">): Promise<BinaryAutomationDefinition>;
    controlAutomation(id: string, action: "pause" | "resume"): Promise<BinaryAutomationDefinition | null>;
    listWebhookSubscriptions(): Promise<BinaryWebhookSubscription[]>;
    saveWebhookSubscription(raw: Partial<BinaryWebhookSubscription> & Pick<BinaryWebhookSubscription, "url">): Promise<BinaryWebhookSubscription>;
    runAutomation(id: string, triggerSummary?: string): Promise<QueueRunResult | null>;
    ingestNotification(input: {
        topic?: string;
        summary?: string;
        automationId?: string;
        payload?: Record<string, unknown>;
    }): Promise<{
        triggeredAutomationIds: string[];
    }>;
    getAutomationEvents(automationId: string, after?: number): Promise<{
        automation: BinaryAutomationDefinition | null;
        events: StoredAutomationEvent[];
    }>;
    recordRunStarted(input: {
        automationId: string;
        runId: string;
    }): Promise<void>;
    recordRunCompleted(input: {
        automationId: string;
        runId: string;
        summary?: string;
    }): Promise<void>;
    recordRunFailed(input: {
        automationId: string;
        runId: string;
        summary?: string;
    }): Promise<void>;
    private applyRunResult;
    private normalizeTrigger;
    private decorateAutomationForReturn;
    private emitAutomationEvent;
    private enqueueDeliveries;
    private persistState;
    private triggerAutomation;
    private runSchedulerTick;
    private runProcessTick;
    private syncFileWatchers;
    private handleFileChange;
    private flushDeliveries;
}
export {};

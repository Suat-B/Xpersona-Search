import type { BinaryExecutionLane, BinaryPluginPack, BinarySkillSource } from "./openhands-capabilities.js";
export type BinaryAgentJobStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "takeover_required";
export type BinaryAgentJobControlAction = "pause" | "resume" | "cancel";
export type BinaryAgentJobEvent = {
    id: string;
    seq: number;
    capturedAt: string;
    event: Record<string, unknown>;
};
export type BinaryAgentJob = {
    id: string;
    status: BinaryAgentJobStatus;
    createdAt: string;
    updatedAt: string;
    task: string;
    model: string;
    workspaceRoot?: string;
    runId?: string;
    traceId?: string;
    sessionId?: string;
    conversationId?: string | null;
    persistenceDir?: string | null;
    jsonlPath?: string | null;
    delegationUsed?: boolean;
    delegationReason?: string;
    childCount?: number;
    completedChildren?: number;
    failedChildren?: number;
    childSummaries?: Array<{
        childId: string;
        status?: string;
        summary?: string;
        agentType?: string;
        traceId?: string;
        completedAt?: string;
    }>;
    runtimeTarget?: "local_native" | "sandbox" | "remote";
    requestedExecutionLane: BinaryExecutionLane;
    executionLane: BinaryExecutionLane;
    pluginPacks: BinaryPluginPack[];
    skillSources: BinarySkillSource[];
    controlHistory: Array<{
        action: BinaryAgentJobControlAction;
        at: string;
        note?: string | null;
    }>;
    events: BinaryAgentJobEvent[];
    error?: string;
};
export declare class AgentJobManager {
    private readonly storagePath;
    private state;
    constructor(storagePath: string);
    initialize(): Promise<void>;
    listJobs(limit?: number): Promise<BinaryAgentJob[]>;
    createJob(input: {
        task: string;
        model: string;
        workspaceRoot?: string;
        requestedExecutionLane: BinaryExecutionLane;
        executionLane: BinaryExecutionLane;
        pluginPacks: BinaryPluginPack[];
        skillSources: BinarySkillSource[];
        runId?: string;
        traceId?: string;
    }): Promise<BinaryAgentJob>;
    getJob(jobId: string): Promise<BinaryAgentJob | null>;
    getJobByRunId(runId: string): Promise<BinaryAgentJob | null>;
    getJobEvents(jobId: string, after?: number): Promise<{
        job: BinaryAgentJob | null;
        events: BinaryAgentJobEvent[];
        done: boolean;
    }>;
    recordControl(jobId: string, action: BinaryAgentJobControlAction, note?: string): Promise<BinaryAgentJob | null>;
    syncFromRun(run: {
        id: string;
        status: BinaryAgentJobStatus;
        updatedAt: string;
        traceId?: string;
        sessionId?: string;
        finalEnvelope?: Record<string, unknown> | null;
        lastExecutionState?: Record<string, unknown> | null;
        error?: string;
    }): Promise<void>;
    private appendEvent;
    private persist;
}

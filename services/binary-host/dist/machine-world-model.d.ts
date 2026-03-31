type WorldNodeType = "device" | "session" | "app" | "window" | "workspace" | "repo" | "terminal_session" | "command" | "browser" | "browser_page" | "domain" | "routine" | "artifact" | "memory";
type WorldEdgeType = "launched_by" | "belongs_to_workspace" | "active_in_session" | "depends_on" | "recently_used_with" | "verified_by" | "habitually_follows";
type WorldNode = {
    id: string;
    type: WorldNodeType;
    key: string;
    label: string;
    data: Record<string, unknown>;
    confidence: number;
    createdAt: string;
    updatedAt: string;
    lastObservedAt?: string;
};
type WorldEdge = {
    id: string;
    type: WorldEdgeType;
    from: string;
    to: string;
    data: Record<string, unknown>;
    weight: number;
    createdAt: string;
    updatedAt: string;
    lastObservedAt?: string;
};
type WorldChange = {
    id: string;
    at: string;
    kind: "snapshot_ingested" | "node_observed" | "edge_observed" | "tool_recorded" | "proof_recorded" | "memory_committed" | "routine_distilled";
    summary: string;
    runId?: string;
    nodeIds?: string[];
    edgeIds?: string[];
    proofId?: string;
    metadata?: Record<string, unknown>;
};
type WorldRoutine = {
    id: string;
    slug: string;
    label: string;
    description: string;
    triggers: string[];
    steps: string[];
    confidence: number;
    evidenceCount: number;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
};
type WorldProof = {
    id: string;
    label: string;
    summary: string;
    at: string;
    runId?: string;
    toolName?: string;
    nodeIds: string[];
    data: Record<string, unknown>;
};
type WorldMemoryCommit = {
    id: string;
    label: string;
    summary: string;
    at: string;
    scope: "machine" | "workspace" | "domain" | "run";
    tags: string[];
    data: Record<string, unknown>;
};
export type IngestSnapshotInput = {
    runId?: string;
    task?: string;
    workspaceRoot?: string;
    desktopContext?: Record<string, unknown> | null;
    browserContext?: Record<string, unknown> | null;
    focusLease?: {
        surface?: string;
        source?: string;
        expiresAt?: string;
    } | null;
};
export type RecordToolReceiptInput = {
    runId?: string;
    task?: string;
    workspaceRoot?: string;
    pendingToolCall: {
        toolCall: {
            id: string;
            name: string;
            arguments?: Record<string, unknown>;
            summary?: string;
        };
        step?: number;
    };
    toolResult: {
        name: string;
        ok: boolean;
        summary: string;
        data?: Record<string, unknown>;
        error?: string;
        createdAt?: string;
    };
};
export type WorldModelSummary = {
    graphVersion: number;
    nodeCount: number;
    edgeCount: number;
    routineCount: number;
    proofCount: number;
    memoryCommitCount: number;
    activeContext: {
        activeWindow?: string;
        activePage?: string;
        activeWorkspace?: string;
        activeRepo?: string;
        browserMode?: string;
        focusLeaseActive?: boolean;
    };
    affordanceSummary: {
        actionsAvailable: string[];
        backgroundSafe: string[];
        visibleRequired: string[];
        blocked: string[];
        highConfidence: string[];
    };
    recentChanges: WorldChange[];
    environmentFreshness: {
        lastUpdatedAt: string;
        stale: boolean;
    };
    machineRoutineIds: string[];
};
export declare class MachineWorldModelService {
    private readonly storagePath;
    private file;
    private loaded;
    private writeChain;
    constructor(storagePath: string);
    private buildEmpty;
    initialize(): Promise<void>;
    private persist;
    private touchGraph;
    private pushChange;
    private upsertNode;
    private upsertEdge;
    private addProof;
    private upsertRoutine;
    private setActiveState;
    private lookupLabel;
    private inferAffordances;
    ingestSnapshot(input: IngestSnapshotInput): Promise<void>;
    recordToolReceipt(input: RecordToolReceiptInput): Promise<void>;
    recordObservation(input: {
        label: string;
        summary: string;
        runId?: string;
        data?: Record<string, unknown>;
    }): Promise<{
        ok: true;
        observationId: string;
    }>;
    recordProof(input: {
        label: string;
        summary: string;
        runId?: string;
        toolName?: string;
        nodeIds?: string[];
        data?: Record<string, unknown>;
    }): Promise<WorldProof>;
    commitMemory(input: {
        label: string;
        summary: string;
        scope?: WorldMemoryCommit["scope"];
        tags?: string[];
        data?: Record<string, unknown>;
    }): Promise<WorldMemoryCommit>;
    getSummary(): Promise<WorldModelSummary>;
    getActiveContext(): Promise<Record<string, unknown>>;
    getRecentChanges(limit?: number): Promise<WorldChange[]>;
    queryGraph(input: {
        query?: string;
        type?: WorldNodeType | string;
        limit?: number;
    }): Promise<{
        nodes: WorldNode[];
        edges: WorldEdge[];
    }>;
    getNeighbors(nodeId: string, limit?: number): Promise<{
        node: WorldNode | null;
        neighbors: WorldNode[];
        edges: WorldEdge[];
    }>;
    getAffordances(): Promise<WorldModelSummary["affordanceSummary"]>;
    findRoutine(query: string, limit?: number): Promise<WorldRoutine[]>;
    scoreRoute(input: {
        routes: Array<{
            id?: string;
            kind?: string;
            steps?: string[];
            requiresVisibleInteraction?: boolean;
            confidence?: number;
        }>;
    }): Promise<Array<{
        id: string;
        score: number;
        reason: string;
    }>>;
    getStatus(): Promise<Record<string, unknown>>;
}
export {};

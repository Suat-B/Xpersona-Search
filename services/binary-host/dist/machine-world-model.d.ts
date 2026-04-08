export type WorldEntityType = "device" | "machine_root" | "drive" | "folder" | "user_session" | "app" | "window" | "workspace" | "repo" | "terminal_session" | "command" | "browser" | "browser_page" | "web_domain" | "routine" | "artifact" | "memory" | "goal" | "episode" | "external_system";
export type WorldRelationType = "launched_by" | "contains" | "belongs_to_workspace" | "active_in_session" | "depends_on" | "recently_used_with" | "verified_by" | "habitually_follows" | "tracks_goal" | "part_of_episode" | "supports_belief" | "supports_goal";
export type WorldEventKind = "migration.bootstrap" | "context.snapshot" | "tool.executed" | "proof.recorded" | "route.decision" | "route.outcome" | "goal.opened" | "goal.progressed" | "goal.blocked" | "goal.completed" | "focus.changed" | "belief.expired" | "episode.closed" | "memory.committed";
export type WorldEntity = {
    id: string;
    type: WorldEntityType;
    key: string;
    label: string;
    data: Record<string, unknown>;
    confidence: number;
    createdAt: string;
    updatedAt: string;
    lastObservedAt?: string;
};
export type WorldRelation = {
    id: string;
    type: WorldRelationType;
    from: string;
    to: string;
    data: Record<string, unknown>;
    weight: number;
    createdAt: string;
    updatedAt: string;
    lastObservedAt?: string;
};
export type WorldBelief = {
    id: string;
    subjectId: string;
    kind: string;
    value: unknown;
    confidence: number;
    evidenceIds: string[];
    provenance?: "snapshot" | "tool_result" | "proof" | "derived" | "manual";
    proofBacked?: boolean;
    decayHours?: number;
    status: "active" | "stale" | "expired" | "contradicted";
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type WorldEpisode = {
    id: string;
    kind: string;
    label: string;
    summary: string;
    status: "open" | "completed" | "blocked";
    entityIds: string[];
    goalIds: string[];
    evidenceIds: string[];
    tags: string[];
    successCount: number;
    failureCount: number;
    createdAt: string;
    updatedAt: string;
    endedAt?: string;
};
export type WorldGoal = {
    id: string;
    title: string;
    summary: string;
    status: "open" | "in_progress" | "blocked" | "completed";
    progress: number;
    confidence: number;
    runId?: string;
    entityIds: string[];
    evidenceIds: string[];
    subgoals: string[];
    blockedReason?: string;
    createdAt: string;
    updatedAt: string;
    lastProgressAt?: string;
};
export type WorldRoutine = {
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
export type WorldProof = {
    id: string;
    label: string;
    summary: string;
    at: string;
    runId?: string;
    toolName?: string;
    nodeIds: string[];
    data: Record<string, unknown>;
};
export type WorldMemoryCommit = {
    id: string;
    label: string;
    summary: string;
    at: string;
    scope: "machine" | "workspace" | "domain" | "run";
    tags: string[];
    data: Record<string, unknown>;
};
export type WorldPrediction = {
    id?: string;
    candidateId: string;
    score: number;
    heuristicScore?: number;
    adaptiveScore?: number;
    expectedOutcome: string;
    riskFactors: string[];
    requiredProof: string[];
    confidence: number;
    historicalSuccessRate?: number;
    freshnessPenalty?: number;
    contradictionPenalty?: number;
    proofBoost?: number;
    goalAlignment?: number;
    kind?: string;
    reason?: string;
    informedBy?: string[];
    evidenceIds?: string[];
    decisionFeatures?: Record<string, unknown>;
    preferred?: boolean;
};
export type WorldAttentionItem = {
    id: string;
    kind: "stale_belief" | "contradiction" | "blocked_goal" | "open_goal" | "uncertain_prediction";
    priority: number;
    summary: string;
    subjectId?: string;
    beliefId?: string;
    goalId?: string;
    episodeId?: string;
    updatedAt: string;
};
export type WorldExplanation = {
    claim: string;
    confidence: number;
    supportingBeliefs: Array<Pick<WorldBelief, "id" | "subjectId" | "kind" | "value" | "confidence" | "updatedAt">>;
    supportingEvents: Array<Pick<WorldEvent, "id" | "kind" | "at" | "summary">>;
    missingEvidence: string[];
    counterfactuals: string[];
};
export type WorldEvent = {
    id: string;
    kind: WorldEventKind;
    at: string;
    summary: string;
    runId?: string;
    subjectId?: string;
    payload: Record<string, unknown>;
};
export type WorldContextTier = "minimal" | "standard" | "full";
export type WorldRouteDecision = {
    id: string;
    at: string;
    runId?: string;
    candidateId: string;
    kind: string;
    task?: string;
    taskSpeedClass: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    contextTier: WorldContextTier;
    toolFamily: string;
    featureKey: string;
    heuristicScore: number;
    adaptiveScore: number;
    finalScore: number;
    confidence: number;
    evidenceIds: string[];
    decisionFeatures: Record<string, unknown>;
};
export type WorldRouteOutcome = {
    id: string;
    at: string;
    decisionId?: string;
    runId?: string;
    routeKind: string;
    featureKey: string;
    toolFamily: string;
    outcome: "success" | "blocked" | "fallback" | "verification_failure" | "focus_conflict" | "takeover_required" | "cancelled";
    advancedGoal: boolean;
    verificationStatus: "passed" | "failed" | "unknown";
    fallbackToRouteKind?: string;
    summary?: string;
};
export type WorldRouteStats = {
    routeKind: string;
    featureKey: string;
    attempts: number;
    successes: number;
    blocked: number;
    fallbacks: number;
    verificationFailures: number;
    focusConflicts: number;
    takeovers: number;
    cancels: number;
    successRate: number;
    historicalSuccessWeight: number;
    averageGoalAdvance: number;
    lastOutcomeAt?: string;
};
type WorldChange = {
    id: string;
    at: string;
    kind: "snapshot_ingested" | "node_observed" | "edge_observed" | "tool_recorded" | "proof_recorded" | "memory_committed" | "routine_distilled" | "goal_recorded" | "belief_updated" | "episode_recorded";
    summary: string;
    runId?: string;
    nodeIds?: string[];
    edgeIds?: string[];
    proofId?: string;
    metadata?: Record<string, unknown>;
};
export type IngestSnapshotInput = {
    runId?: string;
    task?: string;
    workspaceRoot?: string;
    machineRootPath?: string;
    focusedWorkspaceRoot?: string;
    focusedRepoRoot?: string;
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
export type RecordRouteDecisionInput = {
    runId?: string;
    task?: string;
    candidateId?: string;
    kind: string;
    taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
    contextTier?: WorldContextTier;
    toolFamily?: string;
    heuristicScore?: number;
    adaptiveScore?: number;
    finalScore?: number;
    confidence?: number;
    evidenceIds?: string[];
    decisionFeatures?: Record<string, unknown>;
};
export type RecordRouteOutcomeInput = {
    decisionId?: string;
    runId?: string;
    routeKind?: string;
    featureKey?: string;
    toolFamily?: string;
    outcome: "success" | "blocked" | "fallback" | "verification_failure" | "focus_conflict" | "takeover_required" | "cancelled";
    advancedGoal?: boolean;
    verificationStatus?: "passed" | "failed" | "unknown";
    fallbackToRouteKind?: string;
    summary?: string;
};
export type WorldModelSummary = {
    graphVersion: number;
    nodeCount: number;
    edgeCount: number;
    routineCount: number;
    proofCount: number;
    memoryCommitCount: number;
    beliefCount: number;
    goalCount: number;
    episodeCount: number;
    activeContext: {
        machineRoot?: string;
        homeRootPath?: string;
        focusedWorkspace?: string;
        focusedRepo?: string;
        activeWindow?: string;
        activePage?: string;
        activeWorkspace?: string;
        activeRepo?: string;
        browserMode?: string;
        focusLeaseActive?: boolean;
        activeGoals: string[];
    };
    knownDrives: string[];
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
    routeRecommendations: WorldPrediction[];
    distilledBeliefs: Array<Pick<WorldBelief, "id" | "subjectId" | "kind" | "value" | "confidence" | "updatedAt" | "status">>;
    activeGoals: Array<Pick<WorldGoal, "id" | "title" | "status" | "progress" | "confidence" | "blockedReason" | "updatedAt">>;
    recentEpisodes: Array<Pick<WorldEpisode, "id" | "kind" | "label" | "status" | "updatedAt" | "summary">>;
    attentionQueue: WorldAttentionItem[];
    selectedContextTier?: WorldContextTier;
    routeModelVersion: number;
    routeStatsAvailable: boolean;
};
export declare class MachineWorldModelService {
    private readonly storagePath;
    private file;
    private loaded;
    private writeChain;
    constructor(storagePath: string);
    private buildEmpty;
    private persist;
    private migrateLegacy;
    initialize(): Promise<void>;
    private touchGraph;
    private pushChange;
    private setLiveState;
    private lookupLabel;
    private upsertEntity;
    private upsertRelation;
    private upsertBelief;
    private upsertEpisode;
    private upsertGoal;
    private upsertRoutine;
    private upsertProof;
    private upsertMemory;
    private projectBootstrap;
    private projectContextSnapshot;
    private projectToolExecuted;
    private projectProofRecorded;
    private projectMemoryCommitted;
    private projectGoalOpened;
    private projectGoalProgressed;
    private projectGoalBlocked;
    private projectGoalCompleted;
    private projectFocusChanged;
    private projectBeliefExpired;
    private projectEpisodeClosed;
    private projectRouteDecision;
    private projectRouteOutcome;
    private applyEvent;
    private appendEvent;
    private expireBeliefsIfNeeded;
    rebuildViewsFromEvents(options?: {
        persist?: boolean;
    }): Promise<void>;
    ingestSnapshot(input: IngestSnapshotInput): Promise<WorldModelSummary>;
    recordToolReceipt(input: RecordToolReceiptInput): Promise<{
        event: WorldEvent;
        proof?: WorldProof;
        goal?: WorldGoal | null;
    }>;
    recordObservation(input: {
        label: string;
        summary: string;
        runId?: string;
        data?: Record<string, unknown>;
    }): Promise<{
        event: WorldEvent;
        belief: WorldBelief;
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
        scope: "machine" | "workspace" | "domain" | "run";
        tags?: string[];
        data?: Record<string, unknown>;
    }): Promise<WorldMemoryCommit>;
    registerGoal(input: {
        title: string;
        summary?: string;
        runId?: string;
        entityIds?: string[];
        progress?: number;
        confidence?: number;
        subgoals?: string[];
    }): Promise<WorldGoal>;
    getBeliefs(options?: {
        subjectId?: string;
        kind?: string;
        status?: WorldBelief["status"];
        limit?: number;
    }): Promise<WorldBelief[]>;
    getGoals(options?: {
        status?: WorldGoal["status"];
        runId?: string;
        limit?: number;
    }): Promise<WorldGoal[]>;
    queryEpisodes(options?: {
        query?: string;
        kind?: string;
        status?: WorldEpisode["status"];
        limit?: number;
    }): Promise<WorldEpisode[]>;
    private inferAffordances;
    private getAttentionQueueInternal;
    getAttentionQueue(options?: {
        limit?: number;
    }): Promise<WorldAttentionItem[]>;
    private getRouteRelevantBeliefs;
    private getRouteRelevantEvents;
    private buildRouteFeatureVector;
    private featureKeyForRoute;
    private getRouteStatsInternal;
    predictOutcomes(input?: {
        candidates?: Array<{
            id?: string;
            candidateId?: string;
            kind?: string;
            steps?: string[];
            requiresVisibleInteraction?: boolean;
            confidence?: number;
        }>;
        limit?: number;
        task?: string;
        taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
        contextTier?: WorldContextTier;
        toolFamily?: string;
    }): Promise<WorldPrediction[]>;
    explainRoute(input: {
        candidateId?: string;
        claim?: string;
        kind?: string;
    }): Promise<WorldExplanation>;
    getSummary(): Promise<WorldModelSummary>;
    getContextSlice(input?: {
        tier?: WorldContextTier;
        task?: string;
        taskSpeedClass?: "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
        toolFamily?: string;
    }): Promise<Record<string, unknown>>;
    getActiveContext(): Promise<Record<string, unknown>>;
    getRecentChanges(limit?: number): Promise<WorldChange[]>;
    recordRouteDecision(input: RecordRouteDecisionInput): Promise<WorldRouteDecision>;
    recordRouteOutcome(input: RecordRouteOutcomeInput): Promise<WorldRouteOutcome>;
    getRouteStats(input?: {
        kind?: string;
        featureKey?: string;
        limit?: number;
    }): Promise<WorldRouteStats[]>;
    queryGraph(input: {
        query?: string;
        type?: string;
        limit?: number;
    }): Promise<{
        nodes: WorldEntity[];
        edges: WorldRelation[];
    }>;
    getNeighbors(nodeId: string, limit?: number): Promise<{
        node: WorldEntity | null;
        neighbors: WorldEntity[];
        edges: WorldRelation[];
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
    }): Promise<WorldPrediction[]>;
    getStatus(): Promise<Record<string, unknown>>;
}
export {};

export type RepoStack = "node_js_ts" | "python" | "generic";
export type RepoRouteKind = "shell_route" | "browser_native_route" | "desktop_background_route" | "visible_desktop_fallback";
export type RepoVerificationStatus = "pending" | "running" | "passed" | "failed";
export type RepoQueryEngine = "heuristic" | "ast_grep" | "tree_sitter";
export type RepoSymbolRecord = {
    name: string;
    kind: "function" | "class" | "interface" | "type" | "variable" | "export" | "test" | "unknown";
    path: string;
    line?: number;
    exported?: boolean;
};
export type RepoValidationCheck = {
    id: string;
    label: string;
    command?: string;
    kind: "test" | "lint" | "typecheck" | "build" | "verify";
    status?: RepoVerificationStatus;
    reason?: string;
    engine?: "inferred" | "semgrep";
};
export type RepoValidationPlan = {
    status: RepoVerificationStatus;
    primaryCommand?: string;
    checks: RepoValidationCheck[];
    receipts: string[];
    reason: string;
    tooling?: {
        astGrepAvailable: boolean;
        semgrepAvailable: boolean;
    };
};
export type RepoSearchStrategy = {
    preferredToolOrder: string[];
    engineOrder: RepoQueryEngine[];
    guidance: string[];
    tooling: {
        astGrepAvailable: boolean;
        treeSitterAvailable: boolean;
        heuristicAvailable: true;
    };
};
export type RepoSummary = {
    contextVersion: number;
    workspaceRoot: string;
    summary: string;
    stack: RepoStack;
    primaryValidationCommand?: string;
    projectRoots: string[];
    hotspots: string[];
    likelyEntrypoints: string[];
    likelyTests: string[];
    symbolIndex: RepoSymbolRecord[];
    routeHints: {
        preferredRoute: RepoRouteKind;
        reason: string;
        informedBy: string[];
    };
    searchStrategy: RepoSearchStrategy;
    memory: {
        preferredValidationCommand?: string;
        preferredBranchPrefix?: string;
        knownRepairPatterns: string[];
        proofTemplates: string[];
    };
};
export type RepoQueryResult = {
    contextVersion: number;
    workspaceRoot: string;
    symbols: RepoSymbolRecord[];
    engine: RepoQueryEngine;
    fallbackReason?: string;
};
export type RepoReferenceResult = {
    symbol: string;
    references: Array<{
        path: string;
        line?: number;
        excerpt?: string;
    }>;
    engine: RepoQueryEngine;
    fallbackReason?: string;
};
export type RepoChangeImpactResult = {
    subject: string;
    impactedFiles: string[];
    impactedSymbols: string[];
    reason: string;
};
export type RepoVerificationReceipt = {
    id: string;
    label: string;
    summary: string;
    status: RepoVerificationStatus;
    command?: string;
    failureCategory?: string;
    targetHint?: string;
    at: string;
};
export type RecordVerificationInput = {
    label: string;
    summary: string;
    status: RepoVerificationStatus;
    command?: string;
    failureCategory?: string;
    targetHint?: string;
};
type CommandResult = {
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
};
type RepoModelDependencies = {
    commandRunner?: (command: string, args: string[], cwd: string, timeoutMs?: number) => Promise<CommandResult>;
};
export declare class RepoModelService {
    private readonly storagePath;
    private loaded;
    private writeChain;
    private file;
    private toolingSnapshot?;
    private readonly commandRunner;
    constructor(storagePath: string, deps?: RepoModelDependencies);
    initialize(): Promise<void>;
    private persist;
    private ensureRepoMemory;
    private isCommandAvailable;
    private getToolingSnapshot;
    private runAstGrepQuery;
    private buildScan;
    getSummary(workspaceRoot: string, task?: string): Promise<RepoSummary>;
    querySymbols(workspaceRoot: string, input: {
        query?: string;
        path?: string;
        limit?: number;
    }): Promise<RepoQueryResult>;
    findReferences(workspaceRoot: string, input: {
        symbol: string;
        limit?: number;
    }): Promise<RepoReferenceResult>;
    getChangeImpact(workspaceRoot: string, input: {
        path?: string;
        symbol?: string;
        limit?: number;
    }): Promise<RepoChangeImpactResult>;
    getValidationPlan(workspaceRoot: string, input?: {
        paths?: string[];
    }): Promise<RepoValidationPlan>;
    recordVerification(workspaceRoot: string, input: RecordVerificationInput): Promise<RepoVerificationReceipt>;
}
export {};

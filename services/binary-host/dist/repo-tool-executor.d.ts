import { RepoModelService } from "./repo-model.js";
type ToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
};
type PendingToolCall = {
    step: number;
    adapter: string;
    requiresClientExecution: boolean;
    toolCall: ToolCall;
    availableTools?: string[];
    createdAt: string;
};
type ToolResult = {
    toolCallId: string;
    name: string;
    ok: boolean;
    blocked?: boolean;
    summary: string;
    data?: Record<string, unknown>;
    error?: string;
    createdAt?: string;
};
export declare class RepoToolExecutor {
    private readonly repoModel;
    private readonly workspaceRoot;
    constructor(repoModel: RepoModelService, workspaceRoot: string);
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
}
export {};

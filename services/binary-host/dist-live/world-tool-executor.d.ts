import { MachineWorldModelService } from "./machine-world-model.js";
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
export declare class WorldToolExecutor {
    private readonly worldModel;
    constructor(worldModel: MachineWorldModelService);
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
}
export {};

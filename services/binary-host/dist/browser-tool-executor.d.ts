import { BrowserRuntimeController } from "./browser-runtime.js";
import type { MachineAutonomyPolicy } from "./machine-autonomy.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
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
export declare function collectBrowserContext(input: {
    runtime: BrowserRuntimeController;
    policy: MachineAutonomyPolicy;
    pageLimit?: number;
    elementLimit?: number;
    fast?: boolean;
}): Promise<Record<string, unknown>>;
export declare class BrowserToolExecutor {
    private readonly runtime;
    private readonly policy;
    private readonly executionController?;
    constructor(runtime: BrowserRuntimeController, policy: MachineAutonomyPolicy, executionController?: AutonomyExecutionController | undefined);
    private resolvePageId;
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
}
export {};

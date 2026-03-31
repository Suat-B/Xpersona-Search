import { MachineAutonomyController, type MachineAutonomyPolicy } from "./machine-autonomy.js";
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
export declare function collectDesktopContext(input: {
    machineAutonomyController: MachineAutonomyController;
    policy: MachineAutonomyPolicy;
    appLimit?: number;
    windowLimit?: number;
}): Promise<{
    platform: string;
    activeWindow?: {
        id?: string;
        title?: string;
        app?: string;
    };
    visibleWindows?: Array<{
        id?: string;
        title?: string;
        app?: string;
    }>;
    discoveredApps?: Array<{
        id: string;
        name: string;
        aliases: string[];
        source: string;
    }>;
}>;
export declare class DesktopToolExecutor {
    private readonly machineAutonomyController;
    private readonly policy;
    private readonly executionController?;
    constructor(machineAutonomyController: MachineAutonomyController, policy: MachineAutonomyPolicy, executionController?: AutonomyExecutionController | undefined);
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
}
export {};

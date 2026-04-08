import { MachineAutonomyController, type MachineAutonomyPolicy } from "./machine-autonomy.js";
import { AutonomyExecutionController } from "./autonomy-execution-controller.js";
import { NativeAppRuntime } from "./native-app-runtime.js";
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
type DesktopWindowSummary = {
    id: string;
    title: string;
    app: string;
};
type DesktopExecutorDependencies = {
    listWindows: () => Promise<DesktopWindowSummary[]>;
    getActiveWindow: () => Promise<DesktopWindowSummary | null>;
    focusWindow: (input: {
        windowId?: string;
        title?: string;
        app?: string;
    }) => Promise<string>;
};
export type DesktopCleanupSummary = {
    attempted: number;
    closed: number;
    failed: Array<{
        pid: number;
        error: string;
    }>;
    skipped: boolean;
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
    private readonly nativeAppRuntime?;
    private readonly task?;
    private readonly options?;
    private readonly launchedProcessIds;
    private readonly launchedWindowTargets;
    private readonly recoveryLaunchHistory;
    private readonly openedAppIntentKeys;
    private readonly deps;
    constructor(machineAutonomyController: MachineAutonomyController, policy: MachineAutonomyPolicy, executionController?: AutonomyExecutionController | undefined, nativeAppRuntime?: NativeAppRuntime | undefined, task?: string | undefined, options?: {
        autoCloseLaunchedApps?: boolean;
        deps?: Partial<DesktopExecutorDependencies>;
    } | undefined);
    private ensureNativeRuntime;
    private ensureNativeRuntimeAvailable;
    private buildNativeActionLabel;
    private shouldBlockIrreversibleAction;
    private buildNativeResult;
    private shouldAutoCloseLaunchedApps;
    private resolveTargetAppIntent;
    private buildDesktopIntentMetadata;
    private shouldPreferBackgroundExecution;
    private resolveMatchingWindowTarget;
    private launchAppForRecovery;
    private getRecoveryLaunchKey;
    private buildRecoverySuppressedReason;
    private markAppIntentOpened;
    private wasAppIntentOpened;
    private canAttemptRecoveryLaunch;
    private recordRecoveryLaunch;
    private tryFocusExistingWindowForIntent;
    private enforceWindowTarget;
    private captureWindowProcessIds;
    private detectNewLaunchProcessIds;
    private trackLaunchedProcesses;
    private rememberLaunchedWindowTarget;
    private detectLaunchedWindowTarget;
    private closeWindowTarget;
    cleanupLaunchedApps(): Promise<DesktopCleanupSummary>;
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
}
export {};

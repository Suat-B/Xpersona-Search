import type { MachineAutonomyPolicy } from "./machine-autonomy.js";
type ToolCall = {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    kind?: "observe" | "mutate" | "command";
    summary?: string;
};
type PendingToolCall = {
    step: number;
    adapter: string;
    requiresClientExecution: boolean;
    toolCall: ToolCall;
    availableTools?: string[];
    createdAt: string;
};
export type ExecutionVisibility = "background" | "low_focus" | "visible_required";
export type ForegroundDisruptionRisk = "none" | "low" | "medium" | "high";
export type InteractionMode = "terminal" | "structured_desktop" | "managed_browser" | "attached_browser" | "visible_desktop";
export type FocusPolicy = "never_steal" | "avoid_if_possible" | "allowed";
export type SessionPolicy = "attach_carefully" | "managed_only" | "live_session";
export type ExecutionLane = "terminal_background" | "structured_background" | "managed_session_background" | "attached_session_low_focus" | "visible_desktop_fallback";
export type FocusLease = {
    surface: "desktop" | "cli" | "unknown";
    source: string;
    active: boolean;
    updatedAt: string;
    expiresAt: string;
};
export type ExecutionPolicyDecision = {
    lane: ExecutionLane;
    executionVisibility: ExecutionVisibility;
    foregroundDisruptionRisk: ForegroundDisruptionRisk;
    interactionMode: InteractionMode;
    focusPolicy: FocusPolicy;
    sessionPolicy: SessionPolicy;
    backgroundSafe: boolean;
    requiresVisibleInteraction: boolean;
    focusLeaseActive: boolean;
    focusSuppressed: boolean;
    managedSessionPreferred: boolean;
    visibleFallbackReason?: string;
    summary: string;
};
export declare class AutonomyExecutionController {
    private readonly policy;
    private focusLease;
    constructor(policy: MachineAutonomyPolicy);
    updateFocusLease(input: {
        surface?: "desktop" | "cli" | "unknown";
        source?: string;
        leaseMs?: number;
        active?: boolean;
    }): FocusLease | null;
    getFocusLease(): FocusLease | null;
    decide(pendingToolCall: PendingToolCall): ExecutionPolicyDecision;
    buildReceipt(decision: ExecutionPolicyDecision, input?: {
        focusStolen?: boolean;
        sessionKind?: "managed" | "existing" | "none";
    }): Record<string, unknown>;
}
export {};

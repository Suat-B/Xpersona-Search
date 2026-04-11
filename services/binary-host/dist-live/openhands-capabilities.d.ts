export type BinaryExecutionLane = "local_interactive" | "openhands_headless" | "openhands_remote";
export type BinaryTaskSpeedClass = "chat_only" | "simple_action" | "tool_heavy" | "deep_code";
export type BinaryHostWorkspaceTrustMode = "untrusted" | "trusted_read_only" | "trusted_full_access" | "trusted_prompt_commands";
export type BinaryPluginPackId = "web-debug" | "qa-repair" | "dependency-maintenance" | "productivity-backoffice";
export type BinaryPluginPack = {
    id: BinaryPluginPackId;
    title: string;
    description: string;
    source: "binary_managed" | "repo_local" | "requested";
    status: "available" | "missing";
    loadedLazily: boolean;
    skillCount: number;
    mcpServerCount: number;
};
export type BinarySkillSource = {
    id: string;
    label: string;
    kind: "repo_local" | "user" | "org";
    path?: string;
    available: boolean;
    loadedLazily: boolean;
};
export type BinaryRemoteRuntimeHealth = {
    configured: boolean;
    available: boolean;
    executionLane: "openhands_remote";
    gatewayUrl?: string;
    status: "ready" | "degraded" | "unavailable";
    message: string;
    compatibility: "gateway_compatible" | "agent_server" | "unknown";
    checkedAt: string;
    details?: string;
};
type ResolveExecutionLaneInput = {
    task: string;
    workspaceTrustMode: BinaryHostWorkspaceTrustMode;
    taskSpeedClass: BinaryTaskSpeedClass;
    detach?: boolean;
    automationId?: string;
    automationTriggerKind?: string;
    probeSession?: boolean;
    expectedLongRun?: boolean;
    requireIsolation?: boolean;
    explicitLane?: BinaryExecutionLane;
    remoteConfigured?: boolean;
    nativeDesktopTask?: boolean;
    browserTask?: boolean;
};
export declare function resolveExecutionLane(input: ResolveExecutionLaneInput): {
    lane: BinaryExecutionLane;
    reason: string;
};
export declare function shouldEnableSampledTracing(input: {
    lane: BinaryExecutionLane;
    debugMode?: boolean;
    probeSession?: boolean;
    failed?: boolean;
}): boolean;
export declare function resolveOpenHandsSkillSources(workspaceRoot?: string): BinarySkillSource[];
export declare function resolveOpenHandsPluginPacks(input: {
    task: string;
    requestedPacks?: string[];
}): BinaryPluginPack[];
export declare function getRemoteRuntimeHealth(): Promise<BinaryRemoteRuntimeHealth>;
export {};

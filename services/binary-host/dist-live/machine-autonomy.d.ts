export type MachineAutonomyPolicy = {
    enabled: boolean;
    alwaysOn: boolean;
    allowAppLaunch: boolean;
    allowShellCommands: boolean;
    allowUrlOpen: boolean;
    allowFileOpen: boolean;
    allowDesktopObservation: boolean;
    allowBrowserNative: boolean;
    allowEventAgents: boolean;
    allowWholeMachineAccess: boolean;
    allowElevation: boolean;
    focusPolicy: "never_steal" | "avoid_if_possible" | "allowed";
    sessionPolicy: "attach_carefully" | "managed_only" | "live_session";
    allowVisibleFallback: boolean;
    autonomyPosture: "near_total" | "guarded";
    suppressForegroundWhileTyping: boolean;
    focusLeaseTtlMs: number;
    preferTerminalForCoding: boolean;
    browserAttachMode: "existing_or_managed" | "managed_only";
    allowedBrowsers: string[];
    blockedDomains: string[];
    elevatedTrustDomains: string[];
    updatedAt: string;
};
export type ParsedMachineAutonomyTask = {
    kind: "launch_app";
    query: string;
    originalTask: string;
} | null;
export type DiscoveredApp = {
    id: string;
    name: string;
    aliases: string[];
    platform: NodeJS.Platform;
    source: "windows_start_apps" | "windows_shortcut" | "windows_steam" | "windows_quick_alias" | "mac_applications";
    installLocation?: string;
    appId?: string;
    launch: {
        kind: "shell";
        target: string;
    } | {
        kind: "path";
        target: string;
    } | {
        kind: "bundle";
        target: string;
    };
};
export type AppLaunchResult = {
    app: DiscoveredApp;
    summary: string;
    command: string;
    createdAt: string;
};
export declare function defaultMachineAutonomyPolicy(): MachineAutonomyPolicy;
export declare function findBestAppMatch(apps: DiscoveredApp[], query: string, options?: {
    minScore?: number;
}): DiscoveredApp | null;
export declare function parseMachineAutonomyTask(task: string): ParsedMachineAutonomyTask;
export declare function parseSteamAppManifest(raw: string): {
    appId: string;
    name: string;
} | null;
export declare class MachineAutonomyController {
    private cache;
    listApps(options?: {
        forceRefresh?: boolean;
    }): Promise<{
        apps: DiscoveredApp[];
        indexedAt: string;
    }>;
    launchApp(query: string): Promise<AppLaunchResult>;
}

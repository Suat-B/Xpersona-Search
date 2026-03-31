import type { MachineAutonomyPolicy } from "./machine-autonomy.js";
type JsonRecord = Record<string, any>;
export type BrowserPageSummary = {
    id: string;
    title: string;
    url: string;
    origin: string;
    browserName: string;
    lane: "browser_native";
    active?: boolean;
};
export type BrowserElementSummary = {
    id: string;
    selector: string;
    label: string;
    text?: string;
    role?: string;
    tagName?: string;
    type?: string;
    href?: string;
    disabled?: boolean;
    visible?: boolean;
};
export type BrowserDomSnapshot = {
    snapshotId: string;
    pageId: string;
    url: string;
    title: string;
    interactiveElements: BrowserElementSummary[];
    workflowCheckpoint: string;
};
export type BrowserConsoleEntry = {
    at: string;
    level: string;
    text: string;
};
export type BrowserNetworkEntry = {
    at: string;
    phase: "request" | "response" | "failed";
    url: string;
    method?: string;
    status?: number;
    resourceType?: string;
    errorText?: string;
};
export type BrowserContextState = {
    mode: "unavailable" | "attached" | "managed";
    browserName?: string;
    activePage?: {
        id: string;
        title: string;
        url: string;
        origin: string;
        browserName: string;
    };
    openPages?: Array<{
        id: string;
        title: string;
        url: string;
        origin: string;
        browserName: string;
    }>;
    recentSnapshots?: Array<{
        snapshotId: string;
        pageId: string;
        url: string;
        title: string;
        capturedAt: string;
    }>;
    visibleInteractiveElements?: Array<{
        id: string;
        selector: string;
        label: string;
        role?: string;
        tagName?: string;
    }>;
    recentNetworkActivity?: BrowserNetworkEntry[];
    recentConsoleMessages?: BrowserConsoleEntry[];
    sessionHint?: {
        attachedToExistingSession: boolean;
        authenticatedLikely: boolean;
    };
};
export declare class BrowserRuntimeController {
    private session;
    private browserConnection;
    private readonly pageStates;
    private readonly pageSessionIds;
    private readonly elementRefs;
    private readonly snapshots;
    private lastActivePageId;
    getStatus(policy: MachineAutonomyPolicy): Promise<JsonRecord>;
    collectContext(policy: MachineAutonomyPolicy, input?: {
        pageLimit?: number;
        elementLimit?: number;
    }): Promise<BrowserContextState>;
    listPages(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary[]>;
    getActivePage(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary | null>;
    openPage(policy: MachineAutonomyPolicy, url: string): Promise<BrowserPageSummary>;
    focusPage(policy: MachineAutonomyPolicy, pageId: string): Promise<BrowserPageSummary>;
    navigate(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        url: string;
    }): Promise<BrowserPageSummary>;
    snapshotDom(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        query?: string;
        limit?: number;
    }): Promise<BrowserDomSnapshot>;
    queryElements(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        query?: string;
        limit?: number;
    }): Promise<{
        page: BrowserPageSummary | null;
        matches: BrowserElementSummary[];
    }>;
    readText(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        elementId?: string;
        selector?: string;
    }): Promise<JsonRecord>;
    readFormState(policy: MachineAutonomyPolicy, input: {
        pageId: string;
    }): Promise<JsonRecord>;
    click(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        elementId?: string;
        selector?: string;
    }): Promise<JsonRecord>;
    type(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        text: string;
        elementId?: string;
        selector?: string;
    }): Promise<JsonRecord>;
    pressKeys(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        keys: string[];
    }): Promise<JsonRecord>;
    scroll(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        deltaY?: number;
        elementId?: string;
        selector?: string;
    }): Promise<JsonRecord>;
    waitFor(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        durationMs?: number;
        selector?: string;
        text?: string;
        urlIncludes?: string;
        titleIncludes?: string;
    }): Promise<JsonRecord>;
    capturePage(policy: MachineAutonomyPolicy, input: {
        pageId: string;
    }): Promise<JsonRecord>;
    getNetworkActivity(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        limit?: number;
    }): Promise<BrowserNetworkEntry[]>;
    getConsoleMessages(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        limit?: number;
    }): Promise<BrowserConsoleEntry[]>;
    private ensureSession;
    private ensureBrowserConnection;
    private ensurePageSession;
    private ensurePageState;
    private sendPageCommand;
    private evaluate;
    private storeElementRefs;
    private resolveSelector;
    private assertUrlAllowed;
    private pruneSnapshots;
}
export {};

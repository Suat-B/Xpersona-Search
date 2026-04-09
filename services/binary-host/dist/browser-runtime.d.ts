import type { MachineAutonomyPolicy } from "./machine-autonomy.js";
type JsonRecord = Record<string, any>;
type BrowserMissionLeaseState = "active" | "completed" | "conflicted" | "released";
export type BrowserMissionLease = {
    leaseId: string;
    missionKind: string;
    pageId: string;
    sessionMode: "attached" | "managed" | "profile";
    startedAt: string;
    updatedAt: string;
    state: BrowserMissionLeaseState;
    expectedUrl?: string;
    expectedOrigin?: string;
    lastObservedUrl?: string;
    lastObservedTitle?: string;
    conflictDetected: boolean;
    conflictReason?: string;
};
export declare function buildBrowserSiteSearchUrl(baseUrl: string, query: string): string | null;
export declare function inferBrowserMissionUrlFromQuery(query: string): string | null;
export declare function stripBrowserSiteHintFromQuery(query: string, baseUrl?: string): string;
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
    score?: number;
};
export type BrowserDomSnapshot = {
    snapshotId: string;
    pageId: string;
    url: string;
    title: string;
    interactiveElements: BrowserElementSummary[];
    workflowCheckpoint: string;
};
export type BrowserMissionResult = {
    searchPage: BrowserPageSummary;
    finalPage: BrowserPageSummary | null;
    clickedResult: BrowserElementSummary | null;
    candidates: BrowserElementSummary[];
    directSearchUrl?: string;
    missionLease?: BrowserMissionLease;
};
export type BrowserMissionField = {
    label?: string;
    name?: string;
    query?: string;
    value?: string;
    checked?: boolean;
    required?: boolean;
    kind?: string;
};
export type BrowserMatchedField = {
    fieldLabel: string;
    selector: string;
    type?: string;
    name?: string;
    label?: string;
};
export type BrowserLoginMissionResult = {
    startPage: BrowserPageSummary;
    finalPage: BrowserPageSummary | null;
    authenticated: boolean;
    submitted: boolean;
    actions: string[];
    matchedFields: BrowserMatchedField[];
    missingFields: string[];
    missionLease?: BrowserMissionLease;
};
export type BrowserFormMissionResult = {
    page: BrowserPageSummary;
    finalPage: BrowserPageSummary | null;
    submitted: boolean;
    actions: string[];
    matchedFields: BrowserMatchedField[];
    missingFields: string[];
    missionLease?: BrowserMissionLease;
};
export type BrowserExtractDecisionResult = {
    page: BrowserPageSummary;
    finalPage: BrowserPageSummary | null;
    bestCandidate: BrowserElementSummary | null;
    candidates: BrowserElementSummary[];
    clicked: boolean;
    selectedOption?: string;
    missionLease?: BrowserMissionLease;
};
export type BrowserRecoverWorkflowResult = {
    page: BrowserPageSummary;
    finalPage: BrowserPageSummary | null;
    recovered: boolean;
    actionTaken?: string;
    matchedElement?: BrowserElementSummary | null;
    candidates: BrowserElementSummary[];
    missionLease?: BrowserMissionLease;
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
    mode: "unavailable" | "attached" | "managed" | "profile";
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
    activeMissionLease?: {
        leaseId: string;
        missionKind: string;
        pageId: string;
        state: BrowserMissionLeaseState;
        conflictDetected: boolean;
        conflictReason?: string;
        sessionMode: "attached" | "managed" | "profile";
        startedAt: string;
        updatedAt: string;
    };
};
export declare function rankBrowserResultCandidates(matches: BrowserElementSummary[], query: string, pageUrl?: string): BrowserElementSummary[];
export declare class BrowserRuntimeController {
    private session;
    private browserConnection;
    private readonly pageStates;
    private readonly pageSessionIds;
    private readonly elementRefs;
    private readonly snapshots;
    private readonly pageLeases;
    private readonly actionLoops;
    private lastActivePageId;
    private sessionModeOverride;
    private loopActionKey;
    private beginLoopAction;
    private markLoopActionSuccess;
    private pruneLoopState;
    getStatus(policy: MachineAutonomyPolicy): Promise<JsonRecord>;
    currentSessionKind(): "managed" | "existing" | "none";
    runWithSessionPreference<T>(mode: "managed_only" | "reuse_first" | null, action: () => Promise<T>): Promise<T>;
    collectContext(policy: MachineAutonomyPolicy, input?: {
        pageLimit?: number;
        elementLimit?: number;
    }): Promise<BrowserContextState>;
    listPages(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary[]>;
    getActivePage(policy: MachineAutonomyPolicy): Promise<BrowserPageSummary | null>;
    private getPageById;
    getPageSummary(policy: MachineAutonomyPolicy, pageId: string): Promise<BrowserPageSummary | null>;
    getMissionLease(pageId: string): BrowserMissionLease | null;
    assertPageTarget(policy: MachineAutonomyPolicy, input: {
        pageId: string;
        targetOrigin?: string;
        pageLeaseId?: string;
    }): Promise<BrowserPageSummary>;
    private resolveMissionResultPage;
    private getActiveMissionLease;
    private createMissionLease;
    private touchMissionLease;
    private markMissionLeaseConflict;
    private finalizeMissionLease;
    private runMissionWithLease;
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
    private resolveMissionPage;
    private normalizeFormControls;
    private matchMissionFields;
    private setMissionControlValue;
    private clickBestQueryElement;
    private waitForMissionOutcome;
    private waitForMissionResults;
    private collectMissionCandidates;
    searchAndOpenBestResult(policy: MachineAutonomyPolicy, input: {
        url?: string;
        pageId?: string;
        query: string;
        resultQuery?: string;
        limit?: number;
    }): Promise<BrowserMissionResult>;
    loginAndContinue(policy: MachineAutonomyPolicy, input: {
        url?: string;
        pageId?: string;
        username?: string;
        password?: string;
        submitQuery?: string;
        continueQuery?: string;
        waitForText?: string;
        waitForUrlIncludes?: string;
    }): Promise<BrowserLoginMissionResult>;
    completeForm(policy: MachineAutonomyPolicy, input: {
        url?: string;
        pageId?: string;
        fields: BrowserMissionField[];
        submit?: boolean;
        submitQuery?: string;
        waitForText?: string;
        waitForUrlIncludes?: string;
    }): Promise<BrowserFormMissionResult>;
    extractAndDecide(policy: MachineAutonomyPolicy, input: {
        url?: string;
        pageId?: string;
        query: string;
        options?: string[];
        action?: "none" | "click_best";
        limit?: number;
    }): Promise<BrowserExtractDecisionResult>;
    recoverWorkflow(policy: MachineAutonomyPolicy, input: {
        url?: string;
        pageId?: string;
        goal?: string;
        preferredActionQuery?: string;
        waitForText?: string;
        waitForUrlIncludes?: string;
        limit?: number;
    }): Promise<BrowserRecoverWorkflowResult>;
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
    private resetPageTracking;
    private ensurePageState;
    private sendPageCommand;
    private evaluate;
    private storeElementRefs;
    private resolveSelector;
    private resolveSelectorCandidates;
    private evaluateWithSelectorFallback;
    private inferSelectorFromRecentSnapshot;
    private assertUrlAllowed;
    private pruneSnapshots;
}
export {};

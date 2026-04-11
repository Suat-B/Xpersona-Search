export type NativeAppStatus = {
    platform: string;
    available: boolean;
    version: string;
    pythonCommand?: string;
    pythonVersion?: string;
    lastLaunchError?: string;
    scriptPath?: string;
};
export type NativeAppControlSelector = {
    automationId?: string;
    name?: string;
    text?: string;
    controlType?: string;
    className?: string;
    index?: number;
};
export type NativeAppWindowTarget = {
    sessionId?: string;
    app?: string;
    title?: string;
    windowId?: string;
    allowBackground?: boolean;
};
export type NativeAppQueryResult = {
    sessionId: string;
    appName?: string;
    windowId?: string;
    windowTitle?: string;
    adapterId?: string;
    controls: Array<Record<string, unknown>>;
    confidence?: number;
    fallbackMode?: string;
    focusStolen?: boolean;
};
type NativeAppActionResult = {
    sessionId: string;
    appName?: string;
    windowId?: string;
    windowTitle?: string;
    adapterId?: string;
    selector?: NativeAppControlSelector;
    matchedControl?: Record<string, unknown>;
    confidence?: number;
    fallbackMode?: string;
    focusStolen?: boolean;
    value?: Record<string, unknown>;
    changed?: boolean;
    keys?: string;
};
export declare class NativeAppRuntime {
    private child;
    private readBuffer;
    private readonly pending;
    private readonly sessions;
    private lastStatusProbeAt;
    private status;
    private readonly pythonSitePackages;
    getStatus(): Promise<NativeAppStatus>;
    listWindows(): Promise<Record<string, unknown>>;
    getActiveWindow(): Promise<Record<string, unknown>>;
    queryControls(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        limit?: number;
        timeoutMs?: number;
    }): Promise<NativeAppQueryResult>;
    readControl(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        timeoutMs?: number;
    }): Promise<NativeAppActionResult>;
    invokeControl(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        timeoutMs?: number;
    }): Promise<NativeAppActionResult>;
    typeIntoControl(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        text: string;
        append?: boolean;
    }): Promise<NativeAppActionResult>;
    selectOption(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        optionText: string;
    }): Promise<NativeAppActionResult>;
    toggleControl(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        desiredState?: boolean;
    }): Promise<NativeAppActionResult>;
    sendShortcut(input: NativeAppWindowTarget & {
        keys: string;
        timeoutMs?: number;
    }): Promise<NativeAppActionResult>;
    waitForControl(input: NativeAppWindowTarget & {
        query?: string;
        selector?: NativeAppControlSelector;
        timeoutMs?: number;
    }): Promise<NativeAppActionResult>;
    private callAction;
    private resolveSession;
    private upsertSession;
    private buildTargetPayload;
    private toRecord;
    private toSelector;
    private ping;
    private ensureStarted;
    private handleResponseLine;
    private restartSidecar;
    private shouldRetryAfterTransportFailure;
    private callOnce;
    private call;
    private resolveMethodTimeoutMs;
    private ensurePythonDependenciesInstalled;
    private checkPythonModuleAvailable;
}
export {};

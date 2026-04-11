"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_2 = require("electron");
const CODEX_CHANNELS = {
    showContextMenu: "codex_desktop:show-context-menu",
    showApplicationMenu: "codex_desktop:show-application-menu",
    getSentryInitOptions: "codex_desktop:get-sentry-init-options",
    getBuildFlavor: "codex_desktop:get-build-flavor",
    getSystemThemeVariant: "codex_desktop:get-system-theme-variant",
    getFastModeRolloutMetrics: "codex_desktop:get-fast-mode-rollout-metrics",
    systemThemeVariantUpdated: "codex_desktop:system-theme-variant-updated",
    triggerSentryTest: "codex_desktop:trigger-sentry-test",
    messageFromView: "codex_desktop:message-from-view",
    messageForView: "codex_desktop:message-for-view",
    workerFromView: "codex_desktop:worker:from-view",
    workerForView: "codex_desktop:worker:for-view",
};
function subscribe(channel, callback) {
    const listener = (_event, ...args) => {
        callback((args[0] ?? {}));
    };
    electron_2.ipcRenderer.on(channel, listener);
    return () => {
        electron_2.ipcRenderer.removeListener(channel, listener);
    };
}
const sentryInitOptions = electron_2.ipcRenderer.sendSync(CODEX_CHANNELS.getSentryInitOptions);
const buildFlavor = String(electron_2.ipcRenderer.sendSync(CODEX_CHANNELS.getBuildFlavor) || "prod");
let systemThemeVariant = String(electron_2.ipcRenderer.sendSync(CODEX_CHANNELS.getSystemThemeVariant) || "dark");
const workerSubscribers = new Map();
const workerListenerById = new Map();
function subscribeToWorkerMessages(workerId, callback) {
    const existing = workerSubscribers.get(workerId) || new Set();
    existing.add(callback);
    workerSubscribers.set(workerId, existing);
    if (!workerListenerById.has(workerId)) {
        const listener = (_event, packet) => {
            const byId = workerSubscribers.get(workerId);
            if (!byId || byId.size === 0)
                return;
            const maybePacket = packet && typeof packet === "object" ? packet : null;
            const payload = maybePacket && "payload" in maybePacket ? maybePacket.payload : packet;
            byId.forEach((subscriber) => subscriber(payload));
        };
        workerListenerById.set(workerId, listener);
        electron_2.ipcRenderer.on(`${CODEX_CHANNELS.workerForView}:${workerId}`, listener);
    }
    return () => {
        const byId = workerSubscribers.get(workerId);
        if (!byId)
            return;
        byId.delete(callback);
        if (byId.size > 0)
            return;
        workerSubscribers.delete(workerId);
        const listener = workerListenerById.get(workerId);
        if (!listener)
            return;
        electron_2.ipcRenderer.removeListener(`${CODEX_CHANNELS.workerForView}:${workerId}`, listener);
        workerListenerById.delete(workerId);
    };
}
electron_2.contextBridge.exposeInMainWorld("binaryDesktop", {
    runtimeInfo: () => electron_2.ipcRenderer.invoke("binary:runtime-info"),
    openHandsCapabilities: () => electron_2.ipcRenderer.invoke("binary:host:openhands-capabilities"),
    getHostPreferences: () => electron_2.ipcRenderer.invoke("binary:host:get-preferences"),
    setHostPreferences: (patch) => electron_2.ipcRenderer.invoke("binary:host:set-preferences", patch),
    chooseWorkspace: () => electron_2.ipcRenderer.invoke("binary:choose-workspace"),
    chooseBinaryFile: () => electron_2.ipcRenderer.invoke("binary:choose-binary-file"),
    readTextFile: (filePath) => electron_2.ipcRenderer.invoke("binary:read-text-file", filePath),
    openExternal: (url) => electron_2.ipcRenderer.invoke("binary:open-external", url),
    overlayGetState: () => electron_2.ipcRenderer.invoke("binary:overlay:get-state"),
    overlaySetState: (patch) => electron_2.ipcRenderer.invoke("binary:overlay:set-state", patch),
    getRunSurfaceState: () => electron_2.ipcRenderer.invoke("binary:run-state:get"),
    updateRunSurfaceState: (next) => electron_2.ipcRenderer.invoke("binary:run-state:update", next),
    getAppearance: () => electron_2.ipcRenderer.invoke("binary:appearance:get"),
    setAppearance: (patch) => electron_2.ipcRenderer.invoke("binary:appearance:set", patch),
    focusComposer: () => electron_2.ipcRenderer.invoke("binary:overlay:focus-composer"),
    focusRun: (runId) => electron_2.ipcRenderer.invoke("binary:overlay:focus-run", runId),
    showIntervention: (payload) => electron_2.ipcRenderer.invoke("binary:overlay:show-intervention", payload),
    togglePlayer: () => electron_2.ipcRenderer.invoke("binary:window:toggle-player"),
    registerHotkeys: () => electron_2.ipcRenderer.invoke("binary:hotkeys:register"),
    dumpUiDebug: (payload) => electron_2.ipcRenderer.invoke("binary:debug:dump-ui-state", payload),
    onRunSurfaceState: (callback) => subscribe("binary:run-state-updated", callback),
    onOverlayState: (callback) => subscribe("binary:overlay-state-updated", callback),
    onAppearance: (callback) => subscribe("binary:appearance-updated", callback),
    onHotkeyAction: (callback) => subscribe("binary:hotkey-action", callback),
    onFocusRun: (callback) => subscribe("binary:focus-run", callback),
});
const codexWindowType = "electron";
const electronBridge = {
    windowType: codexWindowType,
    sendMessageFromView: async (payload) => {
        await electron_2.ipcRenderer.invoke(CODEX_CHANNELS.messageFromView, payload);
    },
    getPathForFile: (fileHandle) => {
        try {
            const resolved = electron_2.webUtils.getPathForFile(fileHandle);
            return resolved || null;
        }
        catch {
            return null;
        }
    },
    sendWorkerMessageFromView: async (workerId, payload) => {
        await electron_2.ipcRenderer.invoke(CODEX_CHANNELS.workerFromView, { workerId, payload });
    },
    subscribeToWorkerMessages: (workerId, callback) => subscribeToWorkerMessages(workerId, callback),
    showContextMenu: async (payload) => electron_2.ipcRenderer.invoke(CODEX_CHANNELS.showContextMenu, payload),
    showApplicationMenu: async (menuId, x, y) => electron_2.ipcRenderer.invoke(CODEX_CHANNELS.showApplicationMenu, { menuId, x, y }),
    getFastModeRolloutMetrics: async (payload) => electron_2.ipcRenderer.invoke(CODEX_CHANNELS.getFastModeRolloutMetrics, payload),
    getSystemThemeVariant: () => systemThemeVariant,
    subscribeToSystemThemeVariant: (callback) => {
        const listener = (_event, nextVariant) => {
            if (typeof nextVariant === "string" && nextVariant.trim()) {
                systemThemeVariant = nextVariant;
            }
            callback();
        };
        electron_2.ipcRenderer.on(CODEX_CHANNELS.systemThemeVariantUpdated, listener);
        return () => {
            electron_2.ipcRenderer.removeListener(CODEX_CHANNELS.systemThemeVariantUpdated, listener);
        };
    },
    triggerSentryTestError: async () => {
        await electron_2.ipcRenderer.invoke(CODEX_CHANNELS.triggerSentryTest);
    },
    getSentryInitOptions: () => sentryInitOptions,
    getAppSessionId: () => sentryInitOptions?.codexAppSessionId ?? null,
    getBuildFlavor: () => buildFlavor,
};
electron_2.ipcRenderer.on(CODEX_CHANNELS.messageForView, (_event, payload) => {
    window.dispatchEvent(new MessageEvent("message", { data: payload }));
});
window.addEventListener("error", (event) => {
    electron_2.ipcRenderer.send("binary:renderer-runtime-error", {
        kind: "error",
        message: String(event.message || ""),
        source: String(event.filename || ""),
        line: Number(event.lineno || 0),
        column: Number(event.colno || 0),
        stack: event.error instanceof Error ? event.error.stack || null : null,
    });
});
window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const asError = reason instanceof Error ? reason : null;
    electron_2.ipcRenderer.send("binary:renderer-runtime-error", {
        kind: "unhandledrejection",
        message: asError?.message ||
            (typeof reason === "string" ? reason : (() => {
                try {
                    return JSON.stringify(reason);
                }
                catch {
                    return String(reason);
                }
            })()),
        source: "",
        line: 0,
        column: 0,
        stack: asError?.stack || null,
    });
});
electron_2.contextBridge.exposeInMainWorld("codexWindowType", codexWindowType);
electron_2.contextBridge.exposeInMainWorld("electronBridge", electronBridge);

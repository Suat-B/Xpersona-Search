"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
function subscribe(channel, callback) {
    const listener = (_event, ...args) => {
        callback((args[0] ?? {}));
    };
    electron_1.ipcRenderer.on(channel, listener);
    return () => {
        electron_1.ipcRenderer.removeListener(channel, listener);
    };
}
electron_1.contextBridge.exposeInMainWorld("binaryDesktop", {
    runtimeInfo: () => electron_1.ipcRenderer.invoke("binary:runtime-info"),
    chooseWorkspace: () => electron_1.ipcRenderer.invoke("binary:choose-workspace"),
    openExternal: (url) => electron_1.ipcRenderer.invoke("binary:open-external", url),
    overlayGetState: () => electron_1.ipcRenderer.invoke("binary:overlay:get-state"),
    overlaySetState: (patch) => electron_1.ipcRenderer.invoke("binary:overlay:set-state", patch),
    getRunSurfaceState: () => electron_1.ipcRenderer.invoke("binary:run-state:get"),
    updateRunSurfaceState: (next) => electron_1.ipcRenderer.invoke("binary:run-state:update", next),
    getAppearance: () => electron_1.ipcRenderer.invoke("binary:appearance:get"),
    setAppearance: (patch) => electron_1.ipcRenderer.invoke("binary:appearance:set", patch),
    focusComposer: () => electron_1.ipcRenderer.invoke("binary:overlay:focus-composer"),
    focusRun: (runId) => electron_1.ipcRenderer.invoke("binary:overlay:focus-run", runId),
    showIntervention: (payload) => electron_1.ipcRenderer.invoke("binary:overlay:show-intervention", payload),
    togglePlayer: () => electron_1.ipcRenderer.invoke("binary:window:toggle-player"),
    registerHotkeys: () => electron_1.ipcRenderer.invoke("binary:hotkeys:register"),
    onRunSurfaceState: (callback) => subscribe("binary:run-state-updated", callback),
    onOverlayState: (callback) => subscribe("binary:overlay-state-updated", callback),
    onAppearance: (callback) => subscribe("binary:appearance-updated", callback),
    onHotkeyAction: (callback) => subscribe("binary:hotkey-action", callback),
    onFocusRun: (callback) => subscribe("binary:focus-run", callback),
});

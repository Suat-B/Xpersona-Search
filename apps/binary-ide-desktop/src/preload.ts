import { contextBridge, ipcRenderer } from "electron";

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, ...args: unknown[]) => {
    callback((args[0] ?? {}) as T);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("binaryDesktop", {
  runtimeInfo: () => ipcRenderer.invoke("binary:runtime-info"),
  chooseWorkspace: () => ipcRenderer.invoke("binary:choose-workspace"),
  openExternal: (url: string) => ipcRenderer.invoke("binary:open-external", url),
  overlayGetState: () => ipcRenderer.invoke("binary:overlay:get-state"),
  overlaySetState: (patch: Record<string, unknown>) => ipcRenderer.invoke("binary:overlay:set-state", patch),
  getRunSurfaceState: () => ipcRenderer.invoke("binary:run-state:get"),
  updateRunSurfaceState: (next: Record<string, unknown>) => ipcRenderer.invoke("binary:run-state:update", next),
  getAppearance: () => ipcRenderer.invoke("binary:appearance:get"),
  setAppearance: (patch: Record<string, unknown>) => ipcRenderer.invoke("binary:appearance:set", patch),
  focusComposer: () => ipcRenderer.invoke("binary:overlay:focus-composer"),
  focusRun: (runId?: string) => ipcRenderer.invoke("binary:overlay:focus-run", runId),
  showIntervention: (payload: Record<string, unknown>) => ipcRenderer.invoke("binary:overlay:show-intervention", payload),
  togglePlayer: () => ipcRenderer.invoke("binary:window:toggle-player"),
  registerHotkeys: () => ipcRenderer.invoke("binary:hotkeys:register"),
  onRunSurfaceState: (callback: (payload: Record<string, unknown>) => void) =>
    subscribe("binary:run-state-updated", callback),
  onOverlayState: (callback: (payload: Record<string, unknown>) => void) =>
    subscribe("binary:overlay-state-updated", callback),
  onAppearance: (callback: (payload: Record<string, unknown>) => void) =>
    subscribe("binary:appearance-updated", callback),
  onHotkeyAction: (callback: (payload: Record<string, unknown>) => void) =>
    subscribe("binary:hotkey-action", callback),
  onFocusRun: (callback: (payload: Record<string, unknown>) => void) =>
    subscribe("binary:focus-run", callback),
});

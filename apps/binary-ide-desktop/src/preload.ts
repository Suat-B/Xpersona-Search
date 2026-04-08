import { contextBridge, ipcRenderer, webUtils } from "electron";

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
} as const;

type WorkerSubscriber = (payload: unknown) => void;

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, ...args: unknown[]) => {
    callback((args[0] ?? {}) as T);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const sentryInitOptions = ipcRenderer.sendSync(CODEX_CHANNELS.getSentryInitOptions) as Record<string, unknown>;
const buildFlavor = String(ipcRenderer.sendSync(CODEX_CHANNELS.getBuildFlavor) || "prod");
let systemThemeVariant = String(ipcRenderer.sendSync(CODEX_CHANNELS.getSystemThemeVariant) || "dark");

const workerSubscribers = new Map<string, Set<WorkerSubscriber>>();
const workerListenerById = new Map<string, (_event: unknown, payload: unknown) => void>();

function subscribeToWorkerMessages(workerId: string, callback: WorkerSubscriber): () => void {
  const existing = workerSubscribers.get(workerId) || new Set<WorkerSubscriber>();
  existing.add(callback);
  workerSubscribers.set(workerId, existing);

  if (!workerListenerById.has(workerId)) {
    const listener = (_event: unknown, packet: unknown) => {
      const byId = workerSubscribers.get(workerId);
      if (!byId || byId.size === 0) return;
      const maybePacket = packet && typeof packet === "object" ? (packet as Record<string, unknown>) : null;
      const payload = maybePacket && "payload" in maybePacket ? maybePacket.payload : packet;
      byId.forEach((subscriber) => subscriber(payload));
    };
    workerListenerById.set(workerId, listener);
    ipcRenderer.on(`${CODEX_CHANNELS.workerForView}:${workerId}`, listener);
  }

  return () => {
    const byId = workerSubscribers.get(workerId);
    if (!byId) return;
    byId.delete(callback);
    if (byId.size > 0) return;
    workerSubscribers.delete(workerId);
    const listener = workerListenerById.get(workerId);
    if (!listener) return;
    ipcRenderer.removeListener(`${CODEX_CHANNELS.workerForView}:${workerId}`, listener);
    workerListenerById.delete(workerId);
  };
}

contextBridge.exposeInMainWorld("binaryDesktop", {
  runtimeInfo: () => ipcRenderer.invoke("binary:runtime-info"),
  chooseWorkspace: () => ipcRenderer.invoke("binary:choose-workspace"),
  chooseBinaryFile: () => ipcRenderer.invoke("binary:choose-binary-file"),
  readTextFile: (filePath: string) => ipcRenderer.invoke("binary:read-text-file", filePath),
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
  dumpUiDebug: (payload: Record<string, unknown>) => ipcRenderer.invoke("binary:debug:dump-ui-state", payload),
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

const codexWindowType = "electron";
const electronBridge = {
  windowType: codexWindowType,
  sendMessageFromView: async (payload: Record<string, unknown>) => {
    await ipcRenderer.invoke(CODEX_CHANNELS.messageFromView, payload);
  },
  getPathForFile: (fileHandle: unknown) => {
    try {
      const resolved = webUtils.getPathForFile(fileHandle as File);
      return resolved || null;
    } catch {
      return null;
    }
  },
  sendWorkerMessageFromView: async (workerId: string, payload: unknown) => {
    await ipcRenderer.invoke(CODEX_CHANNELS.workerFromView, { workerId, payload });
  },
  subscribeToWorkerMessages: (workerId: string, callback: WorkerSubscriber) => subscribeToWorkerMessages(workerId, callback),
  showContextMenu: async (payload: Record<string, unknown>) => ipcRenderer.invoke(CODEX_CHANNELS.showContextMenu, payload),
  showApplicationMenu: async (menuId: string, x: number, y: number) =>
    ipcRenderer.invoke(CODEX_CHANNELS.showApplicationMenu, { menuId, x, y }),
  getFastModeRolloutMetrics: async (payload: Record<string, unknown>) =>
    ipcRenderer.invoke(CODEX_CHANNELS.getFastModeRolloutMetrics, payload),
  getSystemThemeVariant: () => systemThemeVariant,
  subscribeToSystemThemeVariant: (callback: () => void) => {
    const listener = (_event: unknown, nextVariant: unknown) => {
      if (typeof nextVariant === "string" && nextVariant.trim()) {
        systemThemeVariant = nextVariant;
      }
      callback();
    };
    ipcRenderer.on(CODEX_CHANNELS.systemThemeVariantUpdated, listener);
    return () => {
      ipcRenderer.removeListener(CODEX_CHANNELS.systemThemeVariantUpdated, listener);
    };
  },
  triggerSentryTestError: async () => {
    await ipcRenderer.invoke(CODEX_CHANNELS.triggerSentryTest);
  },
  getSentryInitOptions: () => sentryInitOptions,
  getAppSessionId: () => sentryInitOptions?.codexAppSessionId ?? null,
  getBuildFlavor: () => buildFlavor,
};

ipcRenderer.on(CODEX_CHANNELS.messageForView, (_event: unknown, payload: unknown) => {
  window.dispatchEvent(new MessageEvent("message", { data: payload }));
});

window.addEventListener("error", (event) => {
  ipcRenderer.send("binary:renderer-runtime-error", {
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
  ipcRenderer.send("binary:renderer-runtime-error", {
    kind: "unhandledrejection",
    message:
      asError?.message ||
      (typeof reason === "string" ? reason : (() => {
        try {
          return JSON.stringify(reason);
        } catch {
          return String(reason);
        }
      })()),
    source: "",
    line: 0,
    column: 0,
    stack: asError?.stack || null,
  });
});

contextBridge.exposeInMainWorld("codexWindowType", codexWindowType);
contextBridge.exposeInMainWorld("electronBridge", electronBridge);

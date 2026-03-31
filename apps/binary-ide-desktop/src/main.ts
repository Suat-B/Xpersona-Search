import { promises as fs } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen, shell } from "electron";
type ElectronBrowserWindow = InstanceType<typeof BrowserWindow>;
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const rendererDir = path.join(packageRoot, "dist", "renderer");
const mainRendererPath = path.join(rendererDir, "index.html");
const playerRendererPath = path.join(rendererDir, "player.html");
const interventionRendererPath = path.join(rendererDir, "intervention.html");
const defaultHostUrl = process.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777";
const hostEntry = process.env.BINARY_IDE_HOST_ENTRY || path.join(repoRoot, "services", "binary-host", "dist", "server.js");
const ENABLE_AUXILIARY_WINDOWS = false;
const ENABLE_INTERVENTION_WINDOW = false;

type OverlayState = {
  enabled: boolean;
  dock: "bottom-center";
  width: number;
  height: number;
  x?: number;
  y?: number;
  mode: "quiet" | "focused";
  clickThrough: boolean;
  interactive: boolean;
  autoOpenIntervention: boolean;
  reducedMotion: boolean;
  visible: boolean;
  pinned: boolean;
  expanded: boolean;
  focusedInput: boolean;
};

type RunSurfaceState = {
  activeRunId?: string | null;
  runStatus?: string | null;
  taskTitle?: string;
  stepTitle?: string;
  lane?: string | null;
  confidence?: string | null;
  pageTitle?: string;
  pageUrl?: string;
  pageDomain?: string;
  browserName?: string;
  proofCard?: Record<string, unknown> | null;
  replayCards?: Array<Record<string, unknown>>;
  timeline?: Array<Record<string, unknown>>;
  controls?: Record<string, unknown> | null;
  intervention?: Record<string, unknown> | null;
  updatedAt?: string;
  [key: string]: unknown;
};

type DesktopStateFile = {
  overlay: OverlayState;
  runSurfaceState: RunSurfaceState;
  appearance: {
    theme: "light" | "dark";
  };
};

const defaultOverlayState: OverlayState = {
  enabled: true,
  dock: "bottom-center",
  width: 700,
  height: 84,
  mode: "quiet",
  clickThrough: false,
  interactive: true,
  autoOpenIntervention: false,
  reducedMotion: false,
  visible: true,
  pinned: true,
  expanded: false,
  focusedInput: false,
};

const hotkeys = {
  focusComposer: "CommandOrControl+Shift+B",
  pauseResume: "CommandOrControl+Shift+P",
  openMain: "CommandOrControl+Shift+O",
};

let hostProcess: ChildProcess | null = null;
let mainWindow: ElectronBrowserWindow | null = null;
let playerWindow: ElectronBrowserWindow | null = null;
let interventionWindow: ElectronBrowserWindow | null = null;
let overlayState: OverlayState = { ...defaultOverlayState };
let runSurfaceState: RunSurfaceState = {};
let desktopAppearance: DesktopStateFile["appearance"] = { theme: "light" };

function nowIso(): string {
  return new Date().toISOString();
}

function desktopStatePath(): string {
  return path.join(app.getPath("userData"), "desktop-state.json");
}

function defaultDesktopState(): DesktopStateFile {
  return {
    overlay: { ...defaultOverlayState },
    runSurfaceState: {},
    appearance: { theme: "light" },
  };
}

async function readDesktopState(): Promise<DesktopStateFile> {
  try {
    const raw = await fs.readFile(desktopStatePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<DesktopStateFile>;
    return {
      overlay: {
        ...defaultOverlayState,
        ...(parsed.overlay || {}),
      },
      runSurfaceState: parsed.runSurfaceState || {},
      appearance: {
        theme: parsed.appearance?.theme === "dark" ? "dark" : "light",
      },
    };
  } catch {
    return defaultDesktopState();
  }
}

async function saveDesktopState(): Promise<void> {
  const nextState: DesktopStateFile = {
    overlay: overlayState,
    runSurfaceState,
    appearance: desktopAppearance,
  };
  await fs.mkdir(path.dirname(desktopStatePath()), { recursive: true });
  await fs.writeFile(desktopStatePath(), JSON.stringify(nextState, null, 2), "utf8");
}

function startBinaryHost(): void {
  if (hostProcess) return;
  const child = spawn(process.execPath, [hostEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BINARY_IDE_HOST_PORT: process.env.BINARY_IDE_HOST_PORT || "7777",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  hostProcess = child;
}

function playerVisualState(): "idle" | "working" | "blocked" {
  const runStatus = String(runSurfaceState.runStatus || "").toLowerCase();
  const intervention = runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
    ? (runSurfaceState.intervention as Record<string, unknown>)
    : null;
  if (runStatus === "takeover_required" || runStatus === "failed" || intervention?.visible) {
    return "blocked";
  }
  if (runSurfaceState.activeRunId || (runStatus && runStatus !== "completed" && runStatus !== "cancelled")) {
    return "working";
  }
  return "idle";
}

function dockedPlayerBounds() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const visualState = playerVisualState();
  const presets = {
    idle: { width: 700, height: 84, margin: 28 },
    working: { width: 760, height: 170, margin: 28 },
    blocked: { width: 820, height: 246, margin: 28 },
  };
  const preset = presets[visualState];
  const width = preset.width;
  const height = preset.height;
  const margin = preset.margin;
  return {
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - margin,
  };
}

function playerShouldShow(): boolean {
  if (!ENABLE_AUXILIARY_WINDOWS) return false;
  return Boolean(overlayState.enabled && overlayState.visible);
}

function interventionShouldShow(): boolean {
  if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW) return false;
  const intervention = runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
    ? (runSurfaceState.intervention as Record<string, unknown>)
    : null;
  return Boolean(intervention?.visible);
}

function closeAuxiliaryWindows(): void {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.close();
  }
  if (interventionWindow && !interventionWindow.isDestroyed()) {
    interventionWindow.close();
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of [mainWindow, playerWindow, interventionWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

async function persistPlayerBounds(): Promise<void> {
  if (!playerWindow || playerWindow.isDestroyed()) return;
  const bounds = playerWindow.getBounds();
  overlayState = {
    ...overlayState,
    width: bounds.width,
    height: bounds.height,
  };
  await saveDesktopState();
  broadcast("binary:overlay-state-updated", overlayState);
}

function applyOverlayInteraction(): void {
  if (!playerWindow || playerWindow.isDestroyed()) return;
  const ignoreMouse = Boolean(overlayState.clickThrough && !overlayState.interactive);
  playerWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true });
  playerWindow.setAlwaysOnTop(true, "screen-saver");
  playerWindow.setVisibleOnAllWorkspaces(Boolean(overlayState.pinned), { visibleOnFullScreen: true });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: desktopAppearance.theme === "dark" ? "#07131f" : "#f8f9ff",
    title: "Binary IDE",
    webPreferences: {
      preload: path.join(packageRoot, "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void mainWindow.loadFile(mainRendererPath);
  mainWindow.on("close", () => {
    closeAuxiliaryWindows();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createPlayerWindow(): void {
  if (!ENABLE_AUXILIARY_WINDOWS) return;
  if (playerWindow && !playerWindow.isDestroyed()) return;
  const bounds = dockedPlayerBounds();
  playerWindow = new BrowserWindow({
    ...bounds,
    minWidth: 700,
    minHeight: 84,
    maxWidth: 820,
    maxHeight: 246,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    title: "Binary Ambient Composer",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(packageRoot, "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  playerWindow.setAlwaysOnTop(true, "screen-saver");
  playerWindow.setSkipTaskbar(true);
  playerWindow.setVisibleOnAllWorkspaces(Boolean(overlayState.pinned), { visibleOnFullScreen: true });
  applyOverlayInteraction();
  void playerWindow.loadFile(playerRendererPath);
  playerWindow.on("closed", () => {
    playerWindow = null;
  });
  playerWindow.on("resize", () => {
    void persistPlayerBounds();
  });
}

function createInterventionWindow(): void {
  if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW) return;
  if (interventionWindow && !interventionWindow.isDestroyed()) return;
  interventionWindow = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 420,
    minHeight: 500,
    show: false,
    frame: false,
    hasShadow: true,
    skipTaskbar: true,
    resizable: false,
    title: "Binary Intervention",
    backgroundColor: "#07131f",
    webPreferences: {
      preload: path.join(packageRoot, "dist", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  interventionWindow.setAlwaysOnTop(true, "screen-saver");
  interventionWindow.setSkipTaskbar(true);
  void interventionWindow.loadFile(interventionRendererPath);
  interventionWindow.on("closed", () => {
    interventionWindow = null;
  });
}

function syncPlayerWindow(options: { focus?: boolean } = {}): void {
  if (!ENABLE_AUXILIARY_WINDOWS) {
    if (playerWindow && !playerWindow.isDestroyed()) playerWindow.close();
    return;
  }
  createPlayerWindow();
  if (!playerWindow || playerWindow.isDestroyed()) return;

  const bounds = dockedPlayerBounds();
  playerWindow.setBounds(bounds);
  applyOverlayInteraction();
  if (playerShouldShow()) {
    playerWindow.show();
    if (options.focus || overlayState.interactive) {
      playerWindow.focus();
    }
  } else {
    playerWindow.hide();
  }
  playerWindow.webContents.send("binary:overlay-state-updated", overlayState);
  playerWindow.webContents.send("binary:run-state-updated", runSurfaceState);
}

function syncInterventionWindow(): void {
  if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW) {
    if (interventionWindow && !interventionWindow.isDestroyed()) interventionWindow.close();
    return;
  }
  createInterventionWindow();
  if (!interventionWindow || interventionWindow.isDestroyed()) return;
  if (overlayState.autoOpenIntervention && interventionShouldShow()) {
    interventionWindow.show();
    interventionWindow.focus();
  } else {
    interventionWindow.hide();
  }
  interventionWindow.webContents.send("binary:run-state-updated", runSurfaceState);
  interventionWindow.webContents.send("binary:overlay-state-updated", overlayState);
}

async function updateOverlayState(patch: Partial<OverlayState>): Promise<OverlayState> {
  overlayState = {
    ...overlayState,
    ...patch,
  };
  await saveDesktopState();
  broadcast("binary:overlay-state-updated", overlayState);
  syncPlayerWindow();
  syncInterventionWindow();
  return overlayState;
}

async function updateRunSurfaceState(next: RunSurfaceState): Promise<RunSurfaceState> {
  runSurfaceState = {
    ...runSurfaceState,
    ...next,
    updatedAt: nowIso(),
  };
  overlayState = {
    ...overlayState,
    expanded: playerVisualState() !== "idle",
  };
  await saveDesktopState();
  broadcast("binary:run-state-updated", runSurfaceState);
  broadcast("binary:overlay-state-updated", overlayState);
  syncPlayerWindow();
  syncInterventionWindow();
  return runSurfaceState;
}

async function updateDesktopAppearance(
  patch: Partial<DesktopStateFile["appearance"]>,
): Promise<DesktopStateFile["appearance"]> {
  desktopAppearance = {
    ...desktopAppearance,
    ...patch,
    theme: patch.theme === "dark" ? "dark" : "light",
  };
  await saveDesktopState();
  broadcast("binary:appearance-updated", desktopAppearance);
  return desktopAppearance;
}

function focusMainWindow(runId?: string | null): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
  if (runId) {
    mainWindow.webContents.send("binary:focus-run", { runId });
  }
}

function broadcastHotkey(action: string): void {
  broadcast("binary:hotkey-action", { action, at: nowIso() });
}

function registerGlobalHotkeys(): Record<string, string> {
  globalShortcut.unregisterAll();
  globalShortcut.register(hotkeys.focusComposer, () => {
    overlayState.visible = true;
    overlayState.interactive = true;
    overlayState.focusedInput = true;
    if (ENABLE_AUXILIARY_WINDOWS) {
      syncPlayerWindow({ focus: true });
    } else {
      focusMainWindow(runSurfaceState.activeRunId || null);
    }
    void saveDesktopState();
    broadcast("binary:overlay-state-updated", overlayState);
    broadcastHotkey("focus_composer");
  });
  globalShortcut.register(hotkeys.pauseResume, () => {
    broadcastHotkey("pause_resume");
  });
  globalShortcut.register(hotkeys.openMain, () => {
    focusMainWindow(runSurfaceState.activeRunId || null);
    broadcastHotkey("open_main");
  });
  return hotkeys;
}

ipcMain.handle("binary:runtime-info", () => {
  return {
    hostUrl: defaultHostUrl,
    appVersion: app.getVersion(),
    userDataPath: app.getPath("userData"),
    hotkeys,
  };
});

ipcMain.handle("binary:choose-workspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a workspace for Binary IDE",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle("binary:open-external", async (_event: unknown, url: unknown) => {
  if (typeof url !== "string" || !url.trim()) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("binary:overlay:get-state", () => overlayState);
ipcMain.handle("binary:overlay:set-state", async (_event: unknown, patch: unknown) => {
  return await updateOverlayState((patch && typeof patch === "object" ? patch : {}) as Partial<OverlayState>);
});
ipcMain.handle("binary:run-state:get", () => runSurfaceState);
ipcMain.handle("binary:run-state:update", async (_event: unknown, next: unknown) => {
  return await updateRunSurfaceState((next && typeof next === "object" ? next : {}) as RunSurfaceState);
});
ipcMain.handle("binary:appearance:get", () => desktopAppearance);
ipcMain.handle("binary:appearance:set", async (_event: unknown, patch: unknown) => {
  return await updateDesktopAppearance((patch && typeof patch === "object" ? patch : {}) as Partial<DesktopStateFile["appearance"]>);
});
ipcMain.handle("binary:overlay:focus-composer", async () => {
  overlayState = {
    ...overlayState,
    visible: true,
    interactive: true,
    focusedInput: true,
  };
  await saveDesktopState();
  if (ENABLE_AUXILIARY_WINDOWS) {
    syncPlayerWindow({ focus: true });
  } else {
    focusMainWindow(runSurfaceState.activeRunId || null);
  }
  broadcast("binary:overlay-state-updated", overlayState);
  broadcastHotkey("focus_composer");
  return true;
});
ipcMain.handle("binary:overlay:focus-run", async (_event: unknown, runId: unknown) => {
  focusMainWindow(typeof runId === "string" ? runId : runSurfaceState.activeRunId || null);
  return true;
});
ipcMain.handle("binary:overlay:show-intervention", async (_event: unknown, payload: unknown) => {
  await updateRunSurfaceState({
    intervention: {
      ...(runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
        ? (runSurfaceState.intervention as Record<string, unknown>)
        : {}),
      ...(payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}),
      visible: true,
    },
  });
  return true;
});
ipcMain.handle("binary:window:toggle-player", async () => {
  if (!ENABLE_AUXILIARY_WINDOWS) {
    focusMainWindow(runSurfaceState.activeRunId || null);
    return overlayState;
  }
  const nextVisible = !(playerWindow && playerWindow.isVisible());
  return await updateOverlayState({
    visible: nextVisible,
    interactive: nextVisible,
    focusedInput: nextVisible,
  });
});
ipcMain.handle("binary:hotkeys:register", () => registerGlobalHotkeys());

app.whenReady().then(async () => {
  const loadedState = await readDesktopState();
  overlayState = loadedState.overlay;
  runSurfaceState = loadedState.runSurfaceState;
  desktopAppearance = loadedState.appearance;
  startBinaryHost();
  createMainWindow();
  if (ENABLE_AUXILIARY_WINDOWS) {
    syncPlayerWindow();
    syncInterventionWindow();
  }
  registerGlobalHotkeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    focusMainWindow(runSurfaceState.activeRunId || null);
  });
});

app.on("will-quit", () => {
  closeAuxiliaryWindows();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

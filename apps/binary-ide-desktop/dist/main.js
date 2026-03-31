"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const electron_1 = require("electron");
const packageRoot = node_path_1.default.resolve(__dirname, "..");
const repoRoot = node_path_1.default.resolve(packageRoot, "..", "..");
const rendererDir = node_path_1.default.join(packageRoot, "dist", "renderer");
const mainRendererPath = node_path_1.default.join(rendererDir, "index.html");
const playerRendererPath = node_path_1.default.join(rendererDir, "player.html");
const interventionRendererPath = node_path_1.default.join(rendererDir, "intervention.html");
const defaultHostUrl = node_process_1.default.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777";
const hostEntry = node_process_1.default.env.BINARY_IDE_HOST_ENTRY || node_path_1.default.join(repoRoot, "services", "binary-host", "dist", "server.js");
const ENABLE_AUXILIARY_WINDOWS = false;
const ENABLE_INTERVENTION_WINDOW = false;
const defaultOverlayState = {
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
let hostProcess = null;
let mainWindow = null;
let playerWindow = null;
let interventionWindow = null;
let overlayState = { ...defaultOverlayState };
let runSurfaceState = {};
let desktopAppearance = { theme: "light" };
function nowIso() {
    return new Date().toISOString();
}
function desktopStatePath() {
    return node_path_1.default.join(electron_1.app.getPath("userData"), "desktop-state.json");
}
function defaultDesktopState() {
    return {
        overlay: { ...defaultOverlayState },
        runSurfaceState: {},
        appearance: { theme: "light" },
    };
}
async function readDesktopState() {
    try {
        const raw = await node_fs_1.promises.readFile(desktopStatePath(), "utf8");
        const parsed = JSON.parse(raw);
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
    }
    catch {
        return defaultDesktopState();
    }
}
async function saveDesktopState() {
    const nextState = {
        overlay: overlayState,
        runSurfaceState,
        appearance: desktopAppearance,
    };
    await node_fs_1.promises.mkdir(node_path_1.default.dirname(desktopStatePath()), { recursive: true });
    await node_fs_1.promises.writeFile(desktopStatePath(), JSON.stringify(nextState, null, 2), "utf8");
}
function startBinaryHost() {
    if (hostProcess)
        return;
    const child = (0, node_child_process_1.spawn)(node_process_1.default.execPath, [hostEntry], {
        cwd: repoRoot,
        env: {
            ...node_process_1.default.env,
            BINARY_IDE_HOST_PORT: node_process_1.default.env.BINARY_IDE_HOST_PORT || "7777",
        },
        stdio: "ignore",
        windowsHide: true,
    });
    child.unref();
    hostProcess = child;
}
function playerVisualState() {
    const runStatus = String(runSurfaceState.runStatus || "").toLowerCase();
    const intervention = runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
        ? runSurfaceState.intervention
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
    const workArea = electron_1.screen.getPrimaryDisplay().workArea;
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
function playerShouldShow() {
    if (!ENABLE_AUXILIARY_WINDOWS)
        return false;
    return Boolean(overlayState.enabled && overlayState.visible);
}
function interventionShouldShow() {
    if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW)
        return false;
    const intervention = runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
        ? runSurfaceState.intervention
        : null;
    return Boolean(intervention?.visible);
}
function closeAuxiliaryWindows() {
    if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.close();
    }
    if (interventionWindow && !interventionWindow.isDestroyed()) {
        interventionWindow.close();
    }
}
function broadcast(channel, payload) {
    for (const window of [mainWindow, playerWindow, interventionWindow]) {
        if (window && !window.isDestroyed()) {
            window.webContents.send(channel, payload);
        }
    }
}
async function persistPlayerBounds() {
    if (!playerWindow || playerWindow.isDestroyed())
        return;
    const bounds = playerWindow.getBounds();
    overlayState = {
        ...overlayState,
        width: bounds.width,
        height: bounds.height,
    };
    await saveDesktopState();
    broadcast("binary:overlay-state-updated", overlayState);
}
function applyOverlayInteraction() {
    if (!playerWindow || playerWindow.isDestroyed())
        return;
    const ignoreMouse = Boolean(overlayState.clickThrough && !overlayState.interactive);
    playerWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true });
    playerWindow.setAlwaysOnTop(true, "screen-saver");
    playerWindow.setVisibleOnAllWorkspaces(Boolean(overlayState.pinned), { visibleOnFullScreen: true });
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1480,
        height: 960,
        minWidth: 1120,
        minHeight: 760,
        backgroundColor: desktopAppearance.theme === "dark" ? "#07131f" : "#f8f9ff",
        title: "Binary IDE",
        webPreferences: {
            preload: node_path_1.default.join(packageRoot, "dist", "preload.js"),
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
function createPlayerWindow() {
    if (!ENABLE_AUXILIARY_WINDOWS)
        return;
    if (playerWindow && !playerWindow.isDestroyed())
        return;
    const bounds = dockedPlayerBounds();
    playerWindow = new electron_1.BrowserWindow({
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
            preload: node_path_1.default.join(packageRoot, "dist", "preload.js"),
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
function createInterventionWindow() {
    if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW)
        return;
    if (interventionWindow && !interventionWindow.isDestroyed())
        return;
    interventionWindow = new electron_1.BrowserWindow({
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
            preload: node_path_1.default.join(packageRoot, "dist", "preload.js"),
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
function syncPlayerWindow(options = {}) {
    if (!ENABLE_AUXILIARY_WINDOWS) {
        if (playerWindow && !playerWindow.isDestroyed())
            playerWindow.close();
        return;
    }
    createPlayerWindow();
    if (!playerWindow || playerWindow.isDestroyed())
        return;
    const bounds = dockedPlayerBounds();
    playerWindow.setBounds(bounds);
    applyOverlayInteraction();
    if (playerShouldShow()) {
        playerWindow.show();
        if (options.focus || overlayState.interactive) {
            playerWindow.focus();
        }
    }
    else {
        playerWindow.hide();
    }
    playerWindow.webContents.send("binary:overlay-state-updated", overlayState);
    playerWindow.webContents.send("binary:run-state-updated", runSurfaceState);
}
function syncInterventionWindow() {
    if (!ENABLE_AUXILIARY_WINDOWS || !ENABLE_INTERVENTION_WINDOW) {
        if (interventionWindow && !interventionWindow.isDestroyed())
            interventionWindow.close();
        return;
    }
    createInterventionWindow();
    if (!interventionWindow || interventionWindow.isDestroyed())
        return;
    if (overlayState.autoOpenIntervention && interventionShouldShow()) {
        interventionWindow.show();
        interventionWindow.focus();
    }
    else {
        interventionWindow.hide();
    }
    interventionWindow.webContents.send("binary:run-state-updated", runSurfaceState);
    interventionWindow.webContents.send("binary:overlay-state-updated", overlayState);
}
async function updateOverlayState(patch) {
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
async function updateRunSurfaceState(next) {
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
async function updateDesktopAppearance(patch) {
    desktopAppearance = {
        ...desktopAppearance,
        ...patch,
        theme: patch.theme === "dark" ? "dark" : "light",
    };
    await saveDesktopState();
    broadcast("binary:appearance-updated", desktopAppearance);
    return desktopAppearance;
}
function focusMainWindow(runId) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createMainWindow();
    }
    if (!mainWindow)
        return;
    mainWindow.show();
    mainWindow.focus();
    if (runId) {
        mainWindow.webContents.send("binary:focus-run", { runId });
    }
}
function broadcastHotkey(action) {
    broadcast("binary:hotkey-action", { action, at: nowIso() });
}
function registerGlobalHotkeys() {
    electron_1.globalShortcut.unregisterAll();
    electron_1.globalShortcut.register(hotkeys.focusComposer, () => {
        overlayState.visible = true;
        overlayState.interactive = true;
        overlayState.focusedInput = true;
        if (ENABLE_AUXILIARY_WINDOWS) {
            syncPlayerWindow({ focus: true });
        }
        else {
            focusMainWindow(runSurfaceState.activeRunId || null);
        }
        void saveDesktopState();
        broadcast("binary:overlay-state-updated", overlayState);
        broadcastHotkey("focus_composer");
    });
    electron_1.globalShortcut.register(hotkeys.pauseResume, () => {
        broadcastHotkey("pause_resume");
    });
    electron_1.globalShortcut.register(hotkeys.openMain, () => {
        focusMainWindow(runSurfaceState.activeRunId || null);
        broadcastHotkey("open_main");
    });
    return hotkeys;
}
electron_1.ipcMain.handle("binary:runtime-info", () => {
    return {
        hostUrl: defaultHostUrl,
        appVersion: electron_1.app.getVersion(),
        userDataPath: electron_1.app.getPath("userData"),
        hotkeys,
    };
});
electron_1.ipcMain.handle("binary:choose-workspace", async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: "Choose a workspace for Binary IDE",
        properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
});
electron_1.ipcMain.handle("binary:open-external", async (_event, url) => {
    if (typeof url !== "string" || !url.trim())
        return false;
    await electron_1.shell.openExternal(url);
    return true;
});
electron_1.ipcMain.handle("binary:overlay:get-state", () => overlayState);
electron_1.ipcMain.handle("binary:overlay:set-state", async (_event, patch) => {
    return await updateOverlayState((patch && typeof patch === "object" ? patch : {}));
});
electron_1.ipcMain.handle("binary:run-state:get", () => runSurfaceState);
electron_1.ipcMain.handle("binary:run-state:update", async (_event, next) => {
    return await updateRunSurfaceState((next && typeof next === "object" ? next : {}));
});
electron_1.ipcMain.handle("binary:appearance:get", () => desktopAppearance);
electron_1.ipcMain.handle("binary:appearance:set", async (_event, patch) => {
    return await updateDesktopAppearance((patch && typeof patch === "object" ? patch : {}));
});
electron_1.ipcMain.handle("binary:overlay:focus-composer", async () => {
    overlayState = {
        ...overlayState,
        visible: true,
        interactive: true,
        focusedInput: true,
    };
    await saveDesktopState();
    if (ENABLE_AUXILIARY_WINDOWS) {
        syncPlayerWindow({ focus: true });
    }
    else {
        focusMainWindow(runSurfaceState.activeRunId || null);
    }
    broadcast("binary:overlay-state-updated", overlayState);
    broadcastHotkey("focus_composer");
    return true;
});
electron_1.ipcMain.handle("binary:overlay:focus-run", async (_event, runId) => {
    focusMainWindow(typeof runId === "string" ? runId : runSurfaceState.activeRunId || null);
    return true;
});
electron_1.ipcMain.handle("binary:overlay:show-intervention", async (_event, payload) => {
    await updateRunSurfaceState({
        intervention: {
            ...(runSurfaceState.intervention && typeof runSurfaceState.intervention === "object"
                ? runSurfaceState.intervention
                : {}),
            ...(payload && typeof payload === "object" ? payload : {}),
            visible: true,
        },
    });
    return true;
});
electron_1.ipcMain.handle("binary:window:toggle-player", async () => {
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
electron_1.ipcMain.handle("binary:hotkeys:register", () => registerGlobalHotkeys());
electron_1.app.whenReady().then(async () => {
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
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
        focusMainWindow(runSurfaceState.activeRunId || null);
    });
});
electron_1.app.on("will-quit", () => {
    closeAuxiliaryWindows();
    electron_1.globalShortcut.unregisterAll();
});
electron_1.app.on("window-all-closed", () => {
    if (node_process_1.default.platform !== "darwin")
        electron_1.app.quit();
});

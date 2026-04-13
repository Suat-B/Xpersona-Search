"use strict";
// @ts-nocheck
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const node_url_1 = require("node:url");
const electron_1 = require("electron");
const packageRoot = node_path_1.default.resolve(__dirname, "..");
const repoRoot = node_path_1.default.resolve(packageRoot, "..", "..");
const binaryDesktopAppName = "Binary IDE";
const binaryDesktopUserDataPath = node_process_1.default.env.BINARY_IDE_USER_DATA_DIR || node_path_1.default.join(electron_1.app.getPath("appData"), "@binary-ide", "desktop");
if (node_process_1.default.env.BINARY_IDE_DISABLE_GPU !== "0") {
    electron_1.app.disableHardwareAcceleration();
}
electron_1.app.setName(binaryDesktopAppName);
try {
    electron_1.app.setPath("userData", binaryDesktopUserDataPath);
}
catch {
    // Keep Electron default if path override is unavailable.
}
const legacyRendererDir = node_path_1.default.join(packageRoot, "dist", "renderer");
const compatRendererDir = node_path_1.default.join(packageRoot, "dist", "renderer-codex");
const legacyMainRendererPath = node_path_1.default.join(legacyRendererDir, "index.html");
const legacyPlayerRendererPath = node_path_1.default.join(legacyRendererDir, "player.html");
const legacyInterventionRendererPath = node_path_1.default.join(legacyRendererDir, "intervention.html");
const compatMainRendererPath = node_path_1.default.join(compatRendererDir, "index.html");
const compatPlayerRendererPath = node_path_1.default.join(compatRendererDir, "player.html");
const compatInterventionRendererPath = node_path_1.default.join(compatRendererDir, "intervention.html");
const requestedUiRuntime = node_process_1.default.env.BINARY_IDE_UI_RUNTIME === "legacy" ? "legacy" : "codex_compat";
const compatWatchdogMs = Number(node_process_1.default.env.BINARY_IDE_COMPAT_STARTUP_TIMEOUT_MS || 180_000);
const compatLoadGuardMs = Number(node_process_1.default.env.BINARY_IDE_COMPAT_LOAD_GUARD_MS || 180_000);
const compatMaxStartupRetries = Math.max(0, Number(node_process_1.default.env.BINARY_IDE_COMPAT_STARTUP_RETRIES || 2));
const compatTraceProtocol = node_process_1.default.env.BINARY_IDE_COMPAT_TRACE_PROTOCOL === "1";
const APP_PROTOCOL_SCHEME = "binaryui";
const defaultHostUrl = node_process_1.default.env.BINARY_IDE_LOCAL_HOST_URL || "http://127.0.0.1:7777";
const preferredLiveHostEntry = node_path_1.default.join(repoRoot, "services", "binary-host", "dist-live", "server.js");
const defaultHostEntry = node_path_1.default.join(repoRoot, "services", "binary-host", "dist", "server.js");
const hostEntry = node_process_1.default.env.BINARY_IDE_HOST_ENTRY ||
    ((0, node_fs_1.existsSync)(preferredLiveHostEntry) ? preferredLiveHostEntry : defaultHostEntry);
const compatPluginOverlayScriptPath = node_path_1.default.join(packageRoot, "compat-plugin-overlay.js");
const ENABLE_AUXILIARY_WINDOWS = false;
const ENABLE_INTERVENTION_WINDOW = false;
const IMPORTABLE_TEXT_EXTENSIONS = new Set([".json", ".txt", ".md", ".yaml", ".yml", ".toml"]);
const MAX_IMPORT_FILE_BYTES = 1_000_000;
const CODEX_SENTRY_DSN = "https://example.invalid/binary-desktop";
const CODEX_BUILD_FLAVOR = "prod";
const CODEX_IPC = {
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
    workerForViewPrefix: "codex_desktop:worker:for-view",
};
/** Default main window is 4:3 (e.g. 1280Ã—960); scales down to fit the primary display work area. */
const MAIN_WINDOW_IDEAL = { width: 1600, height: 1000 };
const MAIN_WINDOW_MIN = { width: 1280, height: 800 };
const MAIN_WINDOW_WORK_MARGIN = 64;
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
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: APP_PROTOCOL_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true,
        },
    },
]);
let hostProcess = null;
let mainWindow = null;
let playerWindow = null;
let interventionWindow = null;
let overlayState = { ...defaultOverlayState };
let runSurfaceState = {};
let desktopAppearance = { theme: "dark", explicit: false };
let activeUiRuntime = requestedUiRuntime;
let codexCompatReady = false;
let codexCompatWatchdogTimer = null;
let compatStartupRetryCount = 0;
let compatFatalErrorShown = false;
let appProtocolRegistered = false;
let powerSaveBlockerId = null;
let protocolRequestCount = 0;
let protocolInflightRequests = 0;
const protocolPendingRequests = new Map();
const codexFetchAbortControllers = new Map();
const codexFetchStreamAbortControllers = new Map();
const codexCompatPendingMcpRequests = new Map();
const codexWorkerSubscriptions = new Map();
const seenUnsupportedCodexIpcMethods = new Set();
const seenUnsupportedCodexMessageTypes = new Set();
const seenCompatFetchSuccesses = new Set();
const seenCompatFetchFailures = new Set();
const seenUnsupportedCodexFetchMethods = new Set();
let codexCompatWorkspaceRoot = null;
let codexCompatWorkspaceRootOptions = [];
const codexCompatFuzzyFileSearchSessions = new Map();
const codexCompatFuzzyFileSearchCache = new Map();
let codexCompatFixedDriveRootsCache = { createdAtMs: 0, roots: [] };
let codexCompatWindowMode = "app";
const codexAppSessionId = (0, node_crypto_1.randomUUID)();
const codexPersistedAtomState = {
    "agent-mode": "full-access",
};
const codexSharedObjectState = new Map();
const codexCompatGlobalState = new Map([
    ["thread-titles", { titles: {}, order: [] }],
    ["pinned-thread-ids", []],
]);
let codexCompatConfigState = node_process_1.default.platform === "win32"
    ? {
        sandbox_mode: "danger-full-access",
        sandbox_workspace_write: { network_access: true },
        windows: { sandbox: "elevated" },
    }
    : {};
let codexCompatConfigVersion = node_process_1.default.platform === "win32" ? 1 : 0;
const codexTerminalSessions = new Map();
let nodePtyModule = null;
let nodePtyLoadAttempted = false;
let nodePtyLoadStatus = "unknown";
function loadNodePty() {
    if (nodePtyModule !== null)
        return nodePtyModule;
    if (nodePtyLoadAttempted)
        return null;
    nodePtyLoadAttempted = true;
    try {
        nodePtyModule = require("node-pty");
        nodePtyLoadStatus = "loaded";
        appendCodexCompatLog("terminal-node-pty-loaded");
    }
    catch (error) {
        nodePtyModule = null;
        nodePtyLoadStatus = "failed";
        appendCodexCompatLog(`terminal-node-pty-failed error=${error instanceof Error ? error.message : String(error)}`);
    }
    return nodePtyModule;
}
const codexCompatThreads = new Map();
function nowIso() {
    return new Date().toISOString();
}
function configureWindowSecurity(window) {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-attach-webview", (event) => {
        event.preventDefault();
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (url.startsWith("file://"))
            return;
        event.preventDefault();
    });
}
function isAllowedExternalUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    }
    catch {
        return false;
    }
}
function desktopStatePath() {
    return node_path_1.default.join(electron_1.app.getPath("userData"), "desktop-state.json");
}
function defaultDesktopState() {
    return {
        overlay: { ...defaultOverlayState },
        runSurfaceState: {},
        appearance: { theme: "dark", explicit: false },
        workspaceRoots: [],
        activeWorkspaceRoot: null,
    };
}
async function readDesktopState() {
    try {
        const raw = await node_fs_1.promises.readFile(desktopStatePath(), "utf8");
        const parsed = JSON.parse(raw);
        const workspaceRoots = normalizeCompatWorkspaceRoots(Array.isArray(parsed.workspaceRoots) ? parsed.workspaceRoots : []);
        const activeWorkspaceRoot = normalizeCompatWorkspaceRoot(parsed.activeWorkspaceRoot) || null;
        return {
            overlay: {
                ...defaultOverlayState,
                ...(parsed.overlay || {}),
            },
            runSurfaceState: parsed.runSurfaceState || {},
            appearance: {
                theme: parsed.appearance?.theme === "dark"
                    ? "dark"
                    : parsed.appearance?.theme === "light" && parsed.appearance?.explicit
                        ? "light"
                        : "dark",
                explicit: Boolean(parsed.appearance?.explicit),
            },
            workspaceRoots,
            activeWorkspaceRoot: activeWorkspaceRoot && workspaceRoots.includes(activeWorkspaceRoot)
                ? activeWorkspaceRoot
                : workspaceRoots[0] || null,
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
        workspaceRoots: readCompatWorkspaceRootOptions(),
        activeWorkspaceRoot: readCompatActiveWorkspaceRoot(),
    };
    await node_fs_1.promises.mkdir(node_path_1.default.dirname(desktopStatePath()), { recursive: true });
    await node_fs_1.promises.writeFile(desktopStatePath(), JSON.stringify(nextState, null, 2), "utf8");
}
function uiDebugDir() {
    return node_path_1.default.join(electron_1.app.getPath("userData"), "debug");
}
function codexCompatLogPath() {
    return node_path_1.default.join(uiDebugDir(), "codex-compat.log");
}
function appendCodexCompatLog(message) {
    const line = `${nowIso()} ${message}\n`;
    void node_fs_1.promises.mkdir(uiDebugDir(), { recursive: true }).then(() => {
        return node_fs_1.promises.appendFile(codexCompatLogPath(), line, "utf8");
    }).catch(() => {
        // Ignore debug log write failures.
    });
}
function summarizeForCompatLog(value, maxLength = 800) {
    try {
        const seen = new WeakSet();
        const serialized = JSON.stringify(value, (_key, candidate) => {
            if (candidate && typeof candidate === "object") {
                if (seen.has(candidate))
                    return "[Circular]";
                seen.add(candidate);
            }
            return candidate;
        });
        const normalized = serialized ?? String(value);
        if (normalized.length <= maxLength)
            return normalized;
        return `${normalized.slice(0, maxLength)}...`;
    }
    catch {
        try {
            const fallback = String(value);
            if (fallback.length <= maxLength)
                return fallback;
            return `${fallback.slice(0, maxLength)}...`;
        }
        catch {
            return "[Unserializable]";
        }
    }
}
async function injectCompatPluginOverlay(targetWindow) {
    if (activeUiRuntime !== "codex_compat")
        return false;
    if (!targetWindow || targetWindow.isDestroyed())
        return false;
    try {
        if (!(0, node_fs_1.existsSync)(compatPluginOverlayScriptPath)) {
            appendCodexCompatLog(`compat-plugin-overlay-missing path=${compatPluginOverlayScriptPath}`);
            return false;
        }
        const script = await node_fs_1.promises.readFile(compatPluginOverlayScriptPath, "utf8");
        if (!script.trim()) {
            appendCodexCompatLog("compat-plugin-overlay-empty");
            return false;
        }
        await targetWindow.webContents.executeJavaScript(`${script}\n//# sourceURL=binary-compat-plugin-overlay.js`, true);
        appendCodexCompatLog("compat-plugin-overlay-injected");
        return true;
    }
    catch (error) {
        appendCodexCompatLog(`compat-plugin-overlay-error ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
function normalizeCompatWorkspaceRoot(value) {
    const candidate = typeof value === "string" && value.trim() ? node_path_1.default.resolve(value.trim()) : "";
    if (!candidate)
        return null;
    try {
        return (0, node_fs_1.statSync)(candidate).isDirectory() ? candidate : null;
    }
    catch {
        return null;
    }
}
function normalizeCompatWorkspaceRoots(values) {
    const uniqueRoots = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = normalizeCompatWorkspaceRoot(value);
        if (!normalized)
            continue;
        const key = normalized.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        uniqueRoots.push(normalized);
    }
    return uniqueRoots;
}
function readCompatProjectOrderRoots() {
    const raw = codexCompatGlobalState.get("project-order");
    if (!Array.isArray(raw)) {
        return [];
    }
    return normalizeCompatWorkspaceRoots(raw.filter((entry) => typeof entry === "string"));
}
function readCompatWorkspaceRootsFromHintValue(value) {
    if (Array.isArray(value)) {
        return normalizeCompatWorkspaceRoots(value.filter((entry) => typeof entry === "string"));
    }
    if (!value || typeof value !== "object") {
        return [];
    }
    const candidates = [];
    for (const entry of Object.values(value)) {
        if (typeof entry === "string") {
            candidates.push(entry);
            continue;
        }
        if (Array.isArray(entry)) {
            for (const nested of entry) {
                if (typeof nested === "string") {
                    candidates.push(nested);
                }
            }
        }
        if (entry && typeof entry === "object") {
            for (const nested of Object.values(entry)) {
                if (typeof nested === "string") {
                    candidates.push(nested);
                }
            }
        }
    }
    return normalizeCompatWorkspaceRoots(candidates);
}
function syncCompatWorkspaceRootsFromGlobalHints() {
    const hintedRoots = normalizeCompatWorkspaceRoots([
        ...readCompatWorkspaceRootsFromHintValue(codexCompatGlobalState.get("project-order")),
        ...readCompatWorkspaceRootsFromHintValue(codexCompatGlobalState.get("thread-workspace-root-hints")),
    ]);
    if (hintedRoots.length === 0) {
        return;
    }
    const currentRoots = readCompatWorkspaceRootOptions();
    const currentRootSet = new Set(currentRoots.map((root) => root.toLowerCase()));
    const missingRoots = hintedRoots.filter((root) => !currentRootSet.has(root.toLowerCase()));
    if (missingRoots.length === 0) {
        return;
    }
    setCompatWorkspaceRoots([
        ...currentRoots,
        ...missingRoots,
    ], readCompatActiveWorkspaceRoot() || currentRoots[0] || missingRoots[0] || null);
    appendCodexCompatLog(`workspace-roots-synced-from-global-hints roots=${missingRoots.join(",")}`);
    void trustCompatHostWorkspaceRoots(missingRoots);
}
function readCompatThreadWorkspaceRoots() {
    return normalizeCompatWorkspaceRoots([...codexCompatThreads.values()]
        .map((thread) => thread.cwd)
        .filter((entry) => typeof entry === "string"));
}
function readCompatExplicitWorkspaceRootOptions() {
    return normalizeCompatWorkspaceRoots([
        ...codexCompatWorkspaceRootOptions,
        codexCompatWorkspaceRoot,
        ...readCompatProjectOrderRoots(),
        ...readCompatThreadWorkspaceRoots(),
    ]);
}
function readCompatWorkspaceRootOptions() {
    return readCompatExplicitWorkspaceRootOptions();
}
function readCompatActiveWorkspaceRoot() {
    const activeRoot = normalizeCompatWorkspaceRoot(codexCompatWorkspaceRoot);
    if (!activeRoot)
        return null;
    const roots = readCompatExplicitWorkspaceRootOptions();
    return roots.includes(activeRoot) ? activeRoot : null;
}
function chooseCompatPrimaryWorkspaceRoot(roots) {
    const normalizedRoots = normalizeCompatWorkspaceRoots(Array.isArray(roots) ? roots : []);
    if (normalizedRoots.length === 0) {
        return null;
    }
    const findContainingRoot = (candidateValue) => {
        const candidateRoot = normalizeCompatWorkspaceRoot(candidateValue);
        if (!candidateRoot) {
            return null;
        }
        if (normalizedRoots.includes(candidateRoot)) {
            return candidateRoot;
        }
        return normalizedRoots.find((root) => {
            try {
                const relative = node_path_1.default.relative(root, candidateRoot);
                return relative === "" || (!relative.startsWith("..") && !node_path_1.default.isAbsolute(relative));
            }
            catch {
                return false;
            }
        }) || null;
    };
    const preferredDefault = findContainingRoot(node_process_1.default.env.BINARY_IDE_DEFAULT_WORKSPACE);
    if (preferredDefault) {
        return preferredDefault;
    }
    const preferredRepoRoot = findContainingRoot(repoRoot);
    if (preferredRepoRoot) {
        return preferredRepoRoot;
    }
    const preferredPackageRoot = findContainingRoot(packageRoot);
    if (preferredPackageRoot) {
        return preferredPackageRoot;
    }
    return normalizedRoots[0] || null;
}
function resolveCompatWholePcStartupRoots() {
    if (node_process_1.default.platform !== "win32") {
        return [];
    }
    return normalizeCompatWorkspaceRoots(readCompatFixedDriveRoots());
}
function areWholePcWorkspaceRoots(roots) {
    if (node_process_1.default.platform !== "win32") {
        return false;
    }
    const normalizedRoots = normalizeCompatWorkspaceRoots(Array.isArray(roots) ? roots : []);
    const fixedDriveRoots = normalizeCompatWorkspaceRoots(readCompatFixedDriveRoots());
    if (normalizedRoots.length === 0 || fixedDriveRoots.length === 0) {
        return false;
    }
    return normalizedRoots.length === fixedDriveRoots.length
        && normalizedRoots.every((root, index) => root === fixedDriveRoots[index]);
}
function hasWholePcWorkspaceSurface(roots) {
    if (node_process_1.default.platform !== "win32") {
        return false;
    }
    const normalizedRoots = normalizeCompatWorkspaceRoots(Array.isArray(roots) ? roots : []);
    const fixedDriveRoots = normalizeCompatWorkspaceRoots(readCompatFixedDriveRoots());
    if (normalizedRoots.length === 0 || fixedDriveRoots.length === 0) {
        return false;
    }
    const rootSet = new Set(normalizedRoots.map((root) => root.toLowerCase()));
    return fixedDriveRoots.every((root) => rootSet.has(root.toLowerCase()));
}
function ensureCompatInitialWorkspaceRoot() {
    const currentActiveRoot = readCompatActiveWorkspaceRoot();
    const currentRoots = readCompatWorkspaceRootOptions();
    if (currentActiveRoot && currentRoots.length > 0) {
        return currentActiveRoot;
    }
    const startupRoots = node_process_1.default.platform === "win32"
        ? resolveCompatWholePcStartupRoots()
        : normalizeCompatWorkspaceRoots([
            node_process_1.default.env.BINARY_IDE_DEFAULT_WORKSPACE,
            repoRoot,
            packageRoot,
            node_process_1.default.cwd(),
            electron_1.app.getPath("documents"),
            electron_1.app.getPath("home"),
        ]);
    const initialRoot = chooseCompatPrimaryWorkspaceRoot(startupRoots);
    if (!initialRoot) {
        appendCodexCompatLog("workspace-root-initialization-skipped reason=no_candidate");
        return null;
    }
    const nextState = setCompatWorkspaceRoots(startupRoots, initialRoot);
    appendCodexCompatLog(`workspace-root-initialized root=${initialRoot} roots=${nextState.roots.join(",")}`);
    return initialRoot;
}
function clearCompatFuzzyFileSearchState() {
    codexCompatFuzzyFileSearchSessions.clear();
    codexCompatFuzzyFileSearchCache.clear();
}
function setCompatWorkspaceRoots(nextRoots, activeRoot) {
    const previousActiveRoot = readCompatActiveWorkspaceRoot();
    const previousRootsKey = readCompatExplicitWorkspaceRootOptions().map((root) => root.toLowerCase()).join("|");
    const normalizedRoots = normalizeCompatWorkspaceRoots(nextRoots);
    const normalizedActiveRoot = normalizeCompatWorkspaceRoot(activeRoot);
    const resolvedActiveRoot = normalizedActiveRoot && normalizedRoots.includes(normalizedActiveRoot)
        ? normalizedActiveRoot
        : normalizedRoots[0] || null;
    codexCompatWorkspaceRootOptions = normalizedRoots;
    codexCompatWorkspaceRoot = resolvedActiveRoot;
    const nextRootsKey = normalizedRoots.map((root) => root.toLowerCase()).join("|");
    if ((previousActiveRoot || null) !== (resolvedActiveRoot || null) || previousRootsKey !== nextRootsKey) {
        clearCompatFuzzyFileSearchState();
        void saveDesktopState();
    }
    return {
        roots: [...normalizedRoots],
        activeRoot: resolvedActiveRoot,
    };
}
function ensureCompatWorkspaceRootOption(root, activeRootOverride) {
    const normalizedRoot = normalizeCompatWorkspaceRoot(root);
    if (!normalizedRoot) {
        return {
            roots: readCompatWorkspaceRootOptions(),
            activeRoot: readCompatActiveWorkspaceRoot(),
        };
    }
    const currentRoots = readCompatWorkspaceRootOptions();
    if (currentRoots.includes(normalizedRoot)) {
        return {
            roots: currentRoots,
            activeRoot: readCompatActiveWorkspaceRoot(),
        };
    }
    const nextState = setCompatWorkspaceRoots([
        ...currentRoots,
        normalizedRoot,
    ], activeRootOverride || readCompatActiveWorkspaceRoot() || normalizedRoot);
    appendCodexCompatLog(`workspace-root-auto-added root=${normalizedRoot}`);
    void trustCompatHostWorkspaceRoots([normalizedRoot]);
    return nextState;
}
function compatWorkspaceRootLabels(roots) {
    const labels = {};
    if (hasWholePcWorkspaceSurface(roots)) {
        const activeRoot = readCompatActiveWorkspaceRoot() || roots[0] || null;
        if (activeRoot) {
            labels[activeRoot.replace(/\\/g, "/")] = "Home";
        }
        const fixedDriveRoots = new Set(normalizeCompatWorkspaceRoots(readCompatFixedDriveRoots()).map((root) => root.toLowerCase()));
        for (const root of roots) {
            if (activeRoot && root === activeRoot) {
                continue;
            }
            if (fixedDriveRoots.has(root.toLowerCase())) {
                continue;
            }
            const normalizedRoot = root.replace(/\\/g, "/");
            labels[normalizedRoot] = node_path_1.default.basename(root) || normalizedRoot;
        }
        return labels;
    }
    for (const root of roots) {
        const normalizedRoot = root.replace(/\\/g, "/");
        const label = node_path_1.default.basename(root) || normalizedRoot;
        labels[normalizedRoot] = label;
    }
    return labels;
}
function readCompatWorkspaceRootOptionsForUi() {
    const roots = readCompatWorkspaceRootOptions();
    if (hasWholePcWorkspaceSurface(roots)) {
        const activeRoot = readCompatActiveWorkspaceRoot() || roots[0] || null;
        const fixedDriveRoots = new Set(normalizeCompatWorkspaceRoots(readCompatFixedDriveRoots()).map((root) => root.toLowerCase()));
        const visibleRoots = [];
        if (activeRoot) {
            visibleRoots.push(activeRoot);
        }
        for (const root of roots) {
            if (activeRoot && root === activeRoot) {
                continue;
            }
            if (fixedDriveRoots.has(root.toLowerCase())) {
                continue;
            }
            visibleRoots.push(root);
        }
        return visibleRoots;
    }
    return roots;
}
function notifyCompatWorkspaceRootsUpdated(sender, navigateHome = false) {
    sendCodexMessageToWebContents(sender, { type: "workspace-root-options-updated" });
    sendCodexMessageToWebContents(sender, { type: "active-workspace-roots-updated" });
    if (navigateHome) {
        sendCodexMessageToWebContents(sender, {
            type: "navigate-to-route",
            path: "/",
            state: { focusComposerNonce: Date.now() },
        });
    }
}
async function chooseCompatWorkspaceRoot() {
    if (!mainWindow)
        return null;
    const defaultPath = readCompatActiveWorkspaceRoot() || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home")) || undefined;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: "Choose a workspace for Binary IDE",
        defaultPath,
        properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : normalizeCompatWorkspaceRoot(result.filePaths[0] || null);
}
async function addCompatWorkspaceRootOption(rootCandidate, sender) {
    const selectedRoot = normalizeCompatWorkspaceRoot(rootCandidate) || await chooseCompatWorkspaceRoot();
    if (!selectedRoot) {
        const activeRoot = readCompatActiveWorkspaceRoot();
        const uiRoots = readCompatWorkspaceRootOptionsForUi();
        return {
            ok: false,
            cancelled: true,
            roots: uiRoots.map((root) => root.replace(/\\/g, "/")),
            activeRoot: activeRoot ? activeRoot.replace(/\\/g, "/") : null,
        };
    }
    const currentRoots = readCompatWorkspaceRootOptions();
    const nextState = setCompatWorkspaceRoots([...currentRoots, selectedRoot], selectedRoot);
    notifyCompatWorkspaceRootsUpdated(sender, true);
    const uiRoots = readCompatWorkspaceRootOptionsForUi();
    return {
        ok: true,
        cancelled: false,
        root: nextState.activeRoot.replace(/\\/g, "/"),
        roots: uiRoots.map((root) => root.replace(/\\/g, "/")),
        labels: compatWorkspaceRootLabels(uiRoots),
    };
}
function startBinaryHost() {
    if (hostProcess)
        return;
    const child = (0, node_child_process_1.spawn)(node_process_1.default.execPath, [hostEntry], {
        cwd: repoRoot,
        env: {
            ...node_process_1.default.env,
            ELECTRON_RUN_AS_NODE: "1",
            BINARY_IDE_HOST_PORT: node_process_1.default.env.BINARY_IDE_HOST_PORT || "7777",
        },
        stdio: "ignore",
        windowsHide: true,
    });
    child.unref();
    hostProcess = child;
}
function restartBinaryHost() {
    if (hostProcess) {
        try {
            hostProcess.kill();
        }
        catch {
            // Ignore host shutdown failures during compat restart.
        }
        hostProcess = null;
    }
    startBinaryHost();
}
function currentRendererThemeVariant() {
    return desktopAppearance.theme === "light" ? "light" : "dark";
}
function resolveCompatBrowserWindow(sender) {
    return electron_1.BrowserWindow.fromWebContents(sender) || mainWindow || null;
}
function sanitizeMenuCoordinate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return undefined;
    return Math.max(0, Math.round(numeric));
}
function normalizeCompatApplicationMenuId(menuId) {
    const raw = typeof menuId === "string" ? menuId.trim().toLowerCase() : "";
    if (!raw)
        return "";
    const normalized = raw.replace(/^windowsmenubar\./, "");
    if (normalized.includes("file"))
        return "file";
    if (normalized.includes("edit"))
        return "edit";
    if (normalized.includes("view"))
        return "view";
    if (normalized.includes("window"))
        return "window";
    if (normalized.includes("help"))
        return "help";
    return normalized;
}
function popupElectronMenu(menu, options) {
    return new Promise((resolve) => {
        let resolved = false;
        const finalize = (value) => {
            if (resolved)
                return;
            resolved = true;
            resolve(value);
        };
        try {
            menu.popup({
                window: options.window || undefined,
                x: sanitizeMenuCoordinate(options.x),
                y: sanitizeMenuCoordinate(options.y),
                callback: () => finalize(options.onClose ? options.onClose() : true),
            });
        }
        catch (error) {
            appendCodexCompatLog(`menu-popup-error ${error instanceof Error ? error.message : String(error)}`);
            finalize(options.onError ? options.onError(error) : false);
        }
    });
}
function buildCompatContextMenuTemplate(rawItems, onSelect) {
    if (!Array.isArray(rawItems))
        return [];
    return rawItems.flatMap((rawItem, index) => {
        const item = rawItem && typeof rawItem === "object" ? rawItem : {};
        if (item.type === "separator") {
            return [{ type: "separator" }];
        }
        const submenu = Array.isArray(item.submenu)
            ? buildCompatContextMenuTemplate(item.submenu, onSelect)
            : undefined;
        const label = typeof item.label === "string" && item.label.trim()
            ? item.label.trim()
            : typeof item.nativeLabel === "string" && item.nativeLabel.trim()
                ? item.nativeLabel.trim()
                : typeof item.id === "string" && item.id.trim()
                    ? item.id.trim()
                    : `item-${index + 1}`;
        const type = item.type === "checkbox" || item.type === "radio" ? item.type : "normal";
        return [{
                id: typeof item.id === "string" ? item.id : undefined,
                label,
                type,
                checked: type === "checkbox" || type === "radio" ? Boolean(item.checked) : undefined,
                enabled: item.enabled !== false,
                submenu: submenu && submenu.length > 0 ? submenu : undefined,
                click: submenu && submenu.length > 0
                    ? undefined
                    : () => {
                        if (typeof item.id === "string" && item.id.trim()) {
                            onSelect(item.id);
                        }
                    },
            }];
    });
}
function showCompatAboutDialog(targetWindow) {
    return electron_1.dialog.showMessageBox(targetWindow || undefined, {
        type: "info",
        title: "About Binary IDE",
        message: "Binary IDE",
        detail: `Version ${electron_1.app.getVersion()}\nDesktop shell for the Codex compat UI.`,
        buttons: ["OK"],
    });
}
async function openCompatWorkspaceFromMenu(sender) {
    const selectedRoot = await chooseCompatWorkspaceRoot();
    if (!selectedRoot)
        return false;
    const currentRoots = readCompatWorkspaceRootOptions();
    const nextState = setCompatWorkspaceRoots([...currentRoots, selectedRoot], selectedRoot);
    appendCodexCompatLog(`workspace-selected-via-menu root=${selectedRoot}`);
    notifyCompatWorkspaceRootsUpdated(sender, true);
    return nextState.activeRoot;
}
function buildCompatApplicationMenuTemplate(menuId, sender, targetWindow) {
    switch (normalizeCompatApplicationMenuId(menuId)) {
        case "file":
            return [
                {
                    label: "New Chat",
                    accelerator: "CommandOrControl+N",
                    click: () => {
                        sendCodexMessageToWebContents(sender, {
                            type: "navigate-to-route",
                            path: "/",
                            state: { focusComposerNonce: Date.now() },
                        });
                    },
                },
                {
                    label: "Open Workspace...",
                    accelerator: "CommandOrControl+Shift+O",
                    click: () => {
                        void openCompatWorkspaceFromMenu(sender);
                    },
                },
                { type: "separator" },
                { role: "close" },
                { role: "quit", label: "Exit" },
            ];
        case "edit":
            return [
                { role: "undo" },
                { role: "redo" },
                { type: "separator" },
                { role: "cut" },
                { role: "copy" },
                { role: "paste" },
                { role: "selectAll" },
            ];
        case "view":
            return [
                { role: "reload" },
                { role: "forceReload" },
                {
                    label: "Toggle Developer Tools",
                    accelerator: node_process_1.default.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
                    click: () => {
                        targetWindow?.webContents.toggleDevTools();
                    },
                },
                { type: "separator" },
                { role: "resetZoom" },
                { role: "zoomIn" },
                { role: "zoomOut" },
                { type: "separator" },
                { role: "togglefullscreen" },
            ];
        case "window":
            return [
                { role: "minimize" },
                { role: "zoom" },
                {
                    label: targetWindow?.isAlwaysOnTop() ? "Disable Always on Top" : "Enable Always on Top",
                    click: () => {
                        if (!targetWindow)
                            return;
                        targetWindow.setAlwaysOnTop(!targetWindow.isAlwaysOnTop());
                    },
                },
            ];
        case "help":
            return [
                {
                    label: "About Binary IDE",
                    click: () => {
                        void showCompatAboutDialog(targetWindow);
                    },
                },
                {
                    label: "Open User Data Folder",
                    click: () => {
                        void electron_1.shell.openPath(electron_1.app.getPath("userData"));
                    },
                },
                {
                    label: "Reveal Compat Log",
                    click: () => {
                        void electron_1.shell.showItemInFolder(codexCompatLogPath());
                    },
                },
            ];
        default:
            return [];
    }
}
async function showCompatApplicationMenu(sender, payload) {
    const data = payload && typeof payload === "object" ? payload : {};
    const menuId = typeof data.menuId === "string" ? data.menuId : "";
    const targetWindow = resolveCompatBrowserWindow(sender);
    const template = buildCompatApplicationMenuTemplate(menuId, sender, targetWindow);
    if (template.length === 0) {
        appendCodexCompatLog(`unsupported-application-menu menuId=${menuId || "<missing>"}`);
        return false;
    }
    const menu = electron_1.Menu.buildFromTemplate(template);
    return await popupElectronMenu(menu, {
        window: targetWindow,
        x: data.x,
        y: data.y,
        onClose: () => true,
        onError: () => false,
    });
}
async function showCompatContextMenu(sender, payload) {
    const items = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray(payload.items)
            ? payload.items
            : [];
    let selectedId = null;
    const template = buildCompatContextMenuTemplate(items, (itemId) => {
        selectedId = itemId;
    });
    if (template.length === 0) {
        return { id: null };
    }
    const menu = electron_1.Menu.buildFromTemplate(template);
    const targetWindow = resolveCompatBrowserWindow(sender);
    return await popupElectronMenu(menu, {
        window: targetWindow,
        x: payload && typeof payload === "object" ? payload.x : undefined,
        y: payload && typeof payload === "object" ? payload.y : undefined,
        onClose: () => ({ id: selectedId }),
        onError: () => ({ id: null }),
    });
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}
function runtimeRendererRoot(runtime) {
    return runtime === "codex_compat" ? compatRendererDir : legacyRendererDir;
}
function compatSurfaceRelativePath(surface) {
    if (surface === "main")
        return "index.html";
    if (surface === "player" && (0, node_fs_1.existsSync)(compatPlayerRendererPath))
        return "player.html";
    if (surface === "intervention" && (0, node_fs_1.existsSync)(compatInterventionRendererPath))
        return "intervention.html";
    return "index.html";
}
function getRendererTarget(surface) {
    if (activeUiRuntime === "codex_compat") {
        const relativePath = compatSurfaceRelativePath(surface);
        appendCodexCompatLog(`resolve-renderer-target surface=${surface} runtime=codex_compat path=${relativePath}`);
        return { type: "url", value: `${APP_PROTOCOL_SCHEME}://compat/${relativePath}` };
    }
    const filePath = surface === "main"
        ? legacyMainRendererPath
        : surface === "player"
            ? legacyPlayerRendererPath
            : legacyInterventionRendererPath;
    return { type: "file", value: filePath };
}
function loadWindowSurface(window, surface) {
    const target = getRendererTarget(surface);
    if (target.type === "url")
        return window.loadURL(target.value).then(() => undefined);
    return window.loadFile(target.value).then(() => undefined);
}
function resolveProtocolRoot(hostname) {
    if (hostname === "-")
        return runtimeRendererRoot(activeUiRuntime);
    if (hostname === "compat")
        return compatRendererDir;
    if (hostname === "legacy")
        return legacyRendererDir;
    return null;
}
function resolveProtocolFilePath(requestUrl) {
    const parsed = new URL(requestUrl);
    const root = resolveProtocolRoot(parsed.hostname);
    if (!root) {
        appendCodexCompatLog(`protocol-miss host=${parsed.hostname} url=${requestUrl}`);
        return null;
    }
    const requestedPath = decodeURIComponent(parsed.pathname || "/");
    let relativePath = requestedPath.replace(/^\/+/, "");
    if (!relativePath)
        relativePath = "index.html";
    const normalizedPath = node_path_1.default.normalize(relativePath).replace(/^([/\\])+/, "");
    const resolvedPath = node_path_1.default.resolve(root, normalizedPath);
    const resolvedRoot = node_path_1.default.resolve(root);
    const inRoot = resolvedPath === resolvedRoot ||
        resolvedPath.startsWith(`${resolvedRoot}${node_path_1.default.sep}`) ||
        resolvedPath.startsWith(`${resolvedRoot}/`) ||
        resolvedPath.startsWith(`${resolvedRoot}\\`);
    if (!inRoot) {
        appendCodexCompatLog(`protocol-blocked path=${normalizedPath} root=${resolvedRoot}`);
        return null;
    }
    if (!(0, node_fs_1.existsSync)(resolvedPath)) {
        appendCodexCompatLog(`protocol-missing file=${resolvedPath}`);
        return null;
    }
    let finalPath = resolvedPath;
    const stats = (0, node_fs_1.statSync)(resolvedPath);
    if (stats.isDirectory()) {
        finalPath = node_path_1.default.join(resolvedPath, "index.html");
        if (!(0, node_fs_1.existsSync)(finalPath)) {
            appendCodexCompatLog(`protocol-missing-index dir=${resolvedPath}`);
            return null;
        }
    }
    return finalPath;
}
async function registerAppProtocolHandler() {
    if (appProtocolRegistered)
        return;
    const defaultSessionProtocol = electron_1.session.defaultSession.protocol;
    appendCodexCompatLog(`protocol-register begin scheme=${APP_PROTOCOL_SCHEME}`);
    const canRegisterFileProtocol = typeof defaultSessionProtocol.registerFileProtocol === "function";
    if (canRegisterFileProtocol) {
        await new Promise((resolve, reject) => {
            try {
                defaultSessionProtocol.unregisterProtocol?.(APP_PROTOCOL_SCHEME);
            }
            catch {
                // Ignore when there is no previous handler.
            }
            defaultSessionProtocol.registerFileProtocol?.(APP_PROTOCOL_SCHEME, (request, callback) => {
                let requestId = 0;
                try {
                    requestId = ++protocolRequestCount;
                    protocolInflightRequests += 1;
                    protocolPendingRequests.set(requestId, request.url);
                    const traceRequest = compatTraceProtocol && requestId <= 120;
                    if (traceRequest) {
                        appendCodexCompatLog(`protocol-file-request #${requestId} method=${request.method} url=${request.url}`);
                    }
                    const finalPath = resolveProtocolFilePath(request.url);
                    if (!finalPath) {
                        callback({ error: -6 });
                        return;
                    }
                    if (traceRequest) {
                        appendCodexCompatLog(`protocol-file-resolve #${requestId} file=${finalPath}`);
                    }
                    callback(finalPath);
                }
                catch (error) {
                    appendCodexCompatLog(`protocol-file-error url=${request.url} ${error instanceof Error ? error.message : String(error)}`);
                    callback({ error: -2 });
                }
                finally {
                    if (requestId > 0) {
                        protocolPendingRequests.delete(requestId);
                    }
                    protocolInflightRequests = Math.max(0, protocolInflightRequests - 1);
                }
            }, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    else {
        try {
            defaultSessionProtocol.unhandle(APP_PROTOCOL_SCHEME);
        }
        catch {
            // Ignore when there is no previous handler.
        }
        await defaultSessionProtocol.handle(APP_PROTOCOL_SCHEME, async (request) => {
            let requestId = 0;
            try {
                requestId = ++protocolRequestCount;
                protocolInflightRequests += 1;
                protocolPendingRequests.set(requestId, request.url);
                const traceRequest = compatTraceProtocol && requestId <= 120;
                if (traceRequest) {
                    appendCodexCompatLog(`protocol-request #${requestId} method=${request.method} url=${request.url}`);
                }
                const finalPath = resolveProtocolFilePath(request.url);
                if (!finalPath) {
                    return new Response("Not Found", { status: 404 });
                }
                if (traceRequest) {
                    appendCodexCompatLog(`protocol-resolve #${requestId} file=${finalPath}`);
                }
                const response = await electron_1.net.fetch((0, node_url_1.pathToFileURL)(finalPath).toString());
                if (traceRequest) {
                    appendCodexCompatLog(`protocol-response #${requestId} status=${response.status}`);
                }
                return response;
            }
            catch (error) {
                appendCodexCompatLog(`protocol-error url=${request.url} ${error instanceof Error ? error.message : String(error)}`);
                return new Response("Internal Error", { status: 500 });
            }
            finally {
                if (requestId > 0) {
                    protocolPendingRequests.delete(requestId);
                }
                protocolInflightRequests = Math.max(0, protocolInflightRequests - 1);
            }
        });
    }
    appProtocolRegistered = true;
    let handled = false;
    try {
        handled = defaultSessionProtocol.isProtocolHandled(APP_PROTOCOL_SCHEME);
    }
    catch {
        handled = false;
    }
    appendCodexCompatLog(`protocol-register done scheme=${APP_PROTOCOL_SCHEME} handled=${handled}`);
}
function protocolPendingSummary() {
    return Array.from(protocolPendingRequests.values()).slice(0, 4).join(", ");
}
async function runProtocolSelfTest() {
    if (activeUiRuntime !== "codex_compat")
        return;
    if (!compatTraceProtocol)
        return;
    const probeUrl = `${APP_PROTOCOL_SCHEME}://compat/index.html`;
    appendCodexCompatLog(`protocol-selftest begin url=${probeUrl}`);
    try {
        const response = await electron_1.net.fetch(probeUrl);
        const body = await response.text();
        appendCodexCompatLog(`protocol-selftest status=${response.status} ok=${response.ok} bodyLength=${body.length}`);
    }
    catch (error) {
        appendCodexCompatLog(`protocol-selftest error=${error instanceof Error ? error.message : String(error)}`);
    }
}
async function showCompatFatalError(reason) {
    if (compatFatalErrorShown)
        return;
    if (codexCompatReady) {
        appendCodexCompatLog(`compat-fatal-skipped reason=${reason} ready=true`);
        return;
    }
    const currentUrl = mainWindow && !mainWindow.isDestroyed() ? compact_whitespace(mainWindow.webContents.getURL()) : "";
    if (currentUrl && !currentUrl.startsWith("data:text/html")) {
        appendCodexCompatLog(`compat-fatal-skipped reason=${reason} url=${currentUrl}`);
        return;
    }
    compatFatalErrorShown = true;
    const detail = [
        "Binary IDE stayed in codex_compat mode (strict parity) but renderer readiness did not complete.",
        `Reason: ${reason}`,
        `Log file: ${codexCompatLogPath()}`,
        "",
        "You can keep this mode and retry launch, or explicitly set BINARY_IDE_UI_RUNTIME=legacy for fallback.",
    ].join("\n");
    appendCodexCompatLog(`compat-fatal reason=${reason}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Binary IDE Startup Error</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; background: #0b0c10; color: #e5e7eb; font-family: Segoe UI, Inter, Arial, sans-serif; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 720px; border: 1px solid #2b2f39; border-radius: 14px; padding: 24px; background: #11141b; box-shadow: 0 18px 40px rgba(0,0,0,.45); }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 8px 0; line-height: 1.45; color: #cfd5df; }
      code { background: #1c2230; padding: 2px 6px; border-radius: 6px; color: #f8fafc; }
      .muted { color: #94a3b8; font-size: 13px; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1>Binary IDE could not mount Codex-compat UI</h1>
      <p>${escapeHtml(reason)}</p>
      <p>Log file: <code>${escapeHtml(codexCompatLogPath())}</code></p>
      <p class="muted">Strict parity mode is still active. Relaunch to retry compat mode.</p>
    </section>
  </body>
</html>`;
        await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await electron_1.dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "Binary IDE Compatibility Startup",
            message: "Codex-compat UI did not finish loading.",
            detail,
        });
    }
}
function handleCompatStartupIssue(reason) {
    if (activeUiRuntime !== "codex_compat")
        return;
    if (codexCompatReady) {
        appendCodexCompatLog(`compat-startup-issue-ignored reason=${reason} ready=true`);
        return;
    }
    codexCompatReady = false;
    clearCompatWatchdog();
    appendCodexCompatLog(`compat-startup-issue reason=${reason} retry=${compatStartupRetryCount}/${compatMaxStartupRetries}`);
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    if (compatStartupRetryCount < compatMaxStartupRetries) {
        compatStartupRetryCount += 1;
        const attempt = compatStartupRetryCount;
        appendCodexCompatLog(`compat-retry begin attempt=${attempt}`);
        void loadWindowSurface(mainWindow, "main").then(() => {
            appendCodexCompatLog(`compat-retry loaded attempt=${attempt}`);
            startCompatWatchdog(mainWindow);
        }).catch((error) => {
            appendCodexCompatLog(`compat-retry load-error attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`);
            handleCompatStartupIssue("compat-retry-load-error");
        });
        return;
    }
    void showCompatFatalError(reason);
}
function clearCompatWatchdog() {
    if (!codexCompatWatchdogTimer)
        return;
    clearTimeout(codexCompatWatchdogTimer);
    codexCompatWatchdogTimer = null;
}
function isCompatAbortLikeError(errorCode, errorDescription) {
    const numericCode = typeof errorCode === "number" ? errorCode : Number.NaN;
    const description = compact_whitespace(errorDescription).toUpperCase();
    return numericCode === -3 || description.includes("ERR_ABORTED");
}
function sendCodexMessageToWebContents(target, payload) {
    target.send(CODEX_IPC.messageForView, payload);
}
function sendCodexMessageToWindow(window, payload) {
    if (!window || window.isDestroyed())
        return;
    sendCodexMessageToWebContents(window.webContents, payload);
}
function sendCodexMessageToCompatWindows(payload) {
    const seenWebContentsIds = new Set();
    for (const window of [mainWindow, playerWindow, interventionWindow]) {
        if (!window || window.isDestroyed())
            continue;
        const webContentsId = window.webContents.id;
        if (seenWebContentsIds.has(webContentsId))
            continue;
        seenWebContentsIds.add(webContentsId);
        sendCodexMessageToWebContents(window.webContents, payload);
    }
}
async function requestCompatMcpFromWebContents(target, hostId, method, params) {
    const requestId = (0, node_crypto_1.randomUUID)();
    return await new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            codexCompatPendingMcpRequests.delete(requestId);
            reject(new Error(`Timed out waiting for ${method} response.`));
        }, 300000);
        codexCompatPendingMcpRequests.set(requestId, {
            resolve,
            reject,
            timeoutHandle,
            method,
        });
        sendCodexMessageToWebContents(target, {
            type: "mcp-request",
            hostId,
            request: {
                id: requestId,
                method,
                params,
            },
        });
        appendCodexCompatLog(`mcp-request->view method=${method} hostId=${hostId ?? "default"} id=${requestId} payload=${summarizeForCompatLog(params, 420)}`);
    });
}
function startCompatWatchdog(window) {
    if (activeUiRuntime !== "codex_compat")
        return;
    clearCompatWatchdog();
    codexCompatWatchdogTimer = setTimeout(async () => {
        if (activeUiRuntime !== "codex_compat")
            return;
        if (!window || window.isDestroyed())
            return;
        let diagnostics = {
            hasStartupLoader: true,
            rootChildren: -1,
            bodyTextLength: 0,
        };
        try {
            const result = await window.webContents.executeJavaScript("(() => { const root = document.querySelector('#root'); const text = (document.body?.innerText || '').trim(); return { hasStartupLoader: Boolean(document.querySelector('.startup-loader')), rootChildren: root ? root.children.length : -1, bodyTextLength: text.length }; })()", true);
            if (result && typeof result === "object") {
                diagnostics = {
                    hasStartupLoader: Boolean(result.hasStartupLoader),
                    rootChildren: Number(result.rootChildren ?? -1),
                    bodyTextLength: Number(result.bodyTextLength ?? 0),
                };
            }
        }
        catch {
            diagnostics = { hasStartupLoader: true, rootChildren: -1, bodyTextLength: 0 };
        }
        const blankMountedSurface = codexCompatReady && diagnostics.rootChildren <= 0 && diagnostics.bodyTextLength === 0;
        const startupHung = !codexCompatReady;
        if (!blankMountedSurface && !startupHung)
            return;
        appendCodexCompatLog(`watchdog-timeout startupHung=${startupHung} blankMountedSurface=${blankMountedSurface} hasStartupLoader=${diagnostics.hasStartupLoader} rootChildren=${diagnostics.rootChildren} bodyTextLength=${diagnostics.bodyTextLength} inflight=${protocolInflightRequests} pending=${protocolPendingSummary()}`);
        handleCompatStartupIssue(blankMountedSurface ? "compat-blank-surface-watchdog" : "compat-startup-watchdog-timeout");
    }, compatWatchdogMs);
}
function codexResponseSuccess(requestId, result) {
    return {
        requestId,
        type: "response",
        resultType: "success",
        result,
    };
}
function codexResponseError(requestId, error) {
    return {
        requestId,
        type: "response",
        resultType: "error",
        error,
    };
}
function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function normalizeHeaders(input) {
    if (!input || typeof input !== "object")
        return {};
    const next = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string") {
            next[key] = value;
        }
        else if (value != null) {
            next[key] = String(value);
        }
    }
    return next;
}
function resolveCodexRequestUrl(url) {
    if (typeof url !== "string" || !url.trim())
        return null;
    if (url.startsWith("http://") || url.startsWith("https://"))
        return url;
    if (url.startsWith("vscode://"))
        return url;
    if (url.startsWith("/"))
        return `${defaultHostUrl}${url}`;
    return `${defaultHostUrl}/${url}`;
}
async function requestHostJson(pathname, init = {}) {
    const url = resolveCodexRequestUrl(pathname);
    if (!url) {
        throw new Error("Binary Desktop could not resolve the host request URL.");
    }
    const response = await fetch(url, {
        ...init,
        headers: {
            Accept: "application/json",
            ...(init.headers && typeof init.headers === "object" ? init.headers : {}),
        },
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(body || `Binary Host request failed with ${response.status}`);
    }
    return await response.json();
}
async function getHostPreferences() {
    return await requestHostJson("/v1/preferences");
}
async function setHostPreferences(patch) {
    return await requestHostJson("/v1/preferences", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(patch && typeof patch === "object" ? patch : {}),
    });
}
async function getOpenHandsCapabilities() {
    return await requestHostJson("/v1/openhands/capabilities");
}
function parseCodexVscodeEndpoint(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "vscode:" || parsed.hostname !== "codex")
            return null;
        return parsed.pathname.replace(/^\/+/, "").trim() || null;
    }
    catch {
        return null;
    }
}
function parseCodexFetchBodyParams(rawBody) {
    if (typeof rawBody !== "string" || !rawBody.trim())
        return {};
    const parsed = safeJsonParse(rawBody, {});
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return {};
    return parsed;
}
function cloneCompatJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
    }
}
function normalizeCompatPathForUi(rawPath) {
    return rawPath.replace(/\\/g, "/");
}
function normalizeCompatPathForHost(rawPath) {
    return node_process_1.default.platform === "win32" ? rawPath.replace(/\//g, "\\") : rawPath;
}
function resolveCompatActiveWorkspaceRoot() {
    return readCompatActiveWorkspaceRoot();
}
function normalizeCompatRequestWorkspacePath(value) {
    const candidate = typeof value === "string" && value.trim()
        ? normalizeCompatWorkspaceRoot(normalizeCompatPathForHost(value.trim()))
        : null;
    const fallback = candidate || resolveCompatActiveWorkspaceRoot() || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"));
    return normalizeCompatPathForUi(fallback || electron_1.app.getPath("home"));
}
function sanitizeCompatRequestParams(params) {
    if (!params || typeof params !== "object" || Array.isArray(params)) {
        return {};
    }
    const sanitized = { ...params };
    if ("cwd" in sanitized) {
        sanitized.cwd = normalizeCompatRequestWorkspacePath(sanitized.cwd);
    }
    if ("workspaceRoot" in sanitized) {
        sanitized.workspaceRoot = normalizeCompatRequestWorkspacePath(sanitized.workspaceRoot);
    }
    return sanitized;
}
function normalizeCompatSearchRoot(rawPath) {
    const hostPath = normalizeCompatPathForHost(String(rawPath || "").trim());
    return normalizeCompatWorkspaceRoot(hostPath);
}
function normalizeCompatRelativePath(rawPath) {
    return rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
}
function normalizeCompatPathForComparison(rawPath) {
    return normalizeCompatPathForHost(String(rawPath || "")).replace(/[\\\/]+$/, "").toLowerCase();
}
function isCompatPathInside(parentPath, targetPath) {
    const normalizedParent = normalizeCompatPathForComparison(parentPath);
    const normalizedTarget = normalizeCompatPathForComparison(targetPath);
    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}\\`);
}
function shouldIgnoreCompatSearchDirectory(name, wholeMachineSearch = false) {
    const normalized = String(name || "").toLowerCase();
    return normalized === ".git"
        || normalized === "node_modules"
        || normalized === ".next"
        || normalized === ".nuxt"
        || normalized === ".turbo"
        || normalized === ".cache"
        || normalized === "coverage"
        || normalized === ".venv"
        || normalized === "venv"
        || normalized === "__pycache__"
        || (wholeMachineSearch && (normalized === "windows"
            || normalized === "program files"
            || normalized === "program files (x86)"
            || normalized === "$recycle.bin"
            || normalized === "system volume information"));
}
function shouldIgnoreCompatSearchAbsolutePath(absolutePath, wholeMachineSearch = false) {
    if (!wholeMachineSearch)
        return false;
    return isCompatPathInside(packageRoot, absolutePath)
        || isCompatPathInside(binaryDesktopUserDataPath, absolutePath);
}
function readCompatFixedDriveRoots() {
    if (node_process_1.default.platform !== "win32") {
        return [];
    }
    if (Date.now() - codexCompatFixedDriveRootsCache.createdAtMs < 60_000 && codexCompatFixedDriveRootsCache.roots.length > 0) {
        return [...codexCompatFixedDriveRootsCache.roots];
    }
    const roots = [];
    try {
        const stdout = (0, node_child_process_1.execFileSync)("powershell.exe", [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | Select-Object -ExpandProperty DeviceID",
        ], {
            encoding: "utf8",
            windowsHide: true,
        });
        for (const line of stdout.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!/^[A-Za-z]:$/.test(trimmed))
                continue;
            const normalized = normalizeCompatWorkspaceRoot(`${trimmed}\\`);
            if (normalized) {
                roots.push(normalized);
            }
        }
    }
    catch (error) {
        appendCodexCompatLog(`fixed-drive-discovery-failed error=${error instanceof Error ? error.message : String(error)}`);
    }
    if (roots.length === 0) {
        for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
            const normalized = normalizeCompatWorkspaceRoot(`${letter}:\\`);
            if (normalized) {
                roots.push(normalized);
            }
        }
    }
    codexCompatFixedDriveRootsCache = {
        createdAtMs: Date.now(),
        roots: normalizeCompatWorkspaceRoots(roots),
    };
    return [...codexCompatFixedDriveRootsCache.roots];
}
function resolveCompatFuzzySearchRoots() {
    const activeRoot = readCompatActiveWorkspaceRoot();
    const workspaceRoots = readCompatWorkspaceRootOptions();
    if (node_process_1.default.platform === "win32" && areWholePcWorkspaceRoots(workspaceRoots)) {
        return {
            roots: workspaceRoots,
            wholeMachineSearch: true,
        };
    }
    if (activeRoot) {
        return { roots: [activeRoot], wholeMachineSearch: false };
    }
    if (node_process_1.default.platform === "win32") {
        return {
            roots: readCompatFixedDriveRoots(),
            wholeMachineSearch: true,
        };
    }
    const homeRoot = normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"));
    return {
        roots: homeRoot ? [homeRoot] : [],
        wholeMachineSearch: false,
    };
}
function readCompatSearchEntriesForRoot(root, wholeMachineSearch = false) {
    const normalizedRoot = normalizeCompatWorkspaceRoot(root);
    if (!normalizedRoot)
        return [];
    const cacheKey = `${normalizedRoot.toLowerCase()}|${wholeMachineSearch ? "machine" : "workspace"}`;
    const cached = codexCompatFuzzyFileSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAtMs < 30_000) {
        return cached.entries;
    }
    const entries = [];
    const stack = [normalizedRoot];
    while (stack.length > 0 && entries.length < 12_000) {
        const currentDir = stack.pop();
        if (!currentDir)
            continue;
        let dirEntries = [];
        try {
            dirEntries = (0, node_fs_1.readdirSync)(currentDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of dirEntries) {
            const absolutePath = node_path_1.default.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!shouldIgnoreCompatSearchDirectory(entry.name, wholeMachineSearch)
                    && !shouldIgnoreCompatSearchAbsolutePath(absolutePath, wholeMachineSearch)) {
                    stack.push(absolutePath);
                }
                continue;
            }
            if (!entry.isFile())
                continue;
            if (shouldIgnoreCompatSearchAbsolutePath(absolutePath, wholeMachineSearch))
                continue;
            const relativePath = normalizeCompatRelativePath(node_path_1.default.relative(normalizedRoot, absolutePath));
            if (!relativePath)
                continue;
            entries.push({
                root: normalizedRoot.replace(/\\/g, "/"),
                path: relativePath,
                file_name: entry.name,
            });
            if (entries.length >= 12_000) {
                break;
            }
        }
    }
    codexCompatFuzzyFileSearchCache.set(cacheKey, { createdAtMs: Date.now(), entries });
    return entries;
}
function scoreCompatSearchEntry(entry, rawQuery) {
    const query = rawQuery.trim().toLowerCase();
    if (!query)
        return 0;
    const fileName = entry.file_name.toLowerCase();
    const relativePath = entry.path.toLowerCase();
    if (fileName === query)
        return 1200;
    if (relativePath === query)
        return 1100;
    if (fileName.startsWith(query))
        return 900;
    if (relativePath.startsWith(query))
        return 700;
    if (fileName.includes(query))
        return 520 - Math.min(200, fileName.indexOf(query) * 4);
    if (relativePath.includes(query))
        return 360 - Math.min(180, relativePath.indexOf(query) * 2);
    const queryParts = query.split(/[\s/\\._-]+/).filter(Boolean);
    if (queryParts.length > 1 && queryParts.every((part) => relativePath.includes(part))) {
        return 240;
    }
    return -1;
}
function runCompatFuzzyFileSearch(rawRoots, rawQuery) {
    const { roots, wholeMachineSearch } = resolveCompatFuzzySearchRoots();
    const query = typeof rawQuery === "string" ? rawQuery : "";
    if (!query.trim() || roots.length === 0) {
        return [];
    }
    const scoredEntries = [];
    for (const root of roots) {
        for (const entry of readCompatSearchEntriesForRoot(root, wholeMachineSearch)) {
            const score = scoreCompatSearchEntry(entry, query);
            if (score < 0)
                continue;
            scoredEntries.push({ entry, score });
        }
    }
    scoredEntries.sort((left, right) => right.score - left.score
        || left.entry.file_name.localeCompare(right.entry.file_name)
        || left.entry.path.localeCompare(right.entry.path));
    const seen = new Set();
    const files = [];
    for (const item of scoredEntries) {
        const key = `${item.entry.root}\0${item.entry.path}`.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        files.push(item.entry);
        if (files.length >= 200) {
            break;
        }
    }
    return files;
}
function buildCompatThreadPreview(text, maxLength = 80) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized)
        return "";
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}...`;
}
function extractCompatSlashMode(text) {
    const raw = typeof text === "string" ? text : "";
    const match = /^\s*\/(plan|auto)\b\s*/i.exec(raw);
    if (!match)
        return { prompt: raw, modeOverride: null };
    const nextPrompt = raw.slice(match[0].length).trim();
    return {
        prompt: nextPrompt,
        modeOverride: match[1].toLowerCase() === "plan" ? "plan" : "default",
    };
}
function createCompatCollaborationMode(mode = "default", settings = {}) {
    const normalizedSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
    return {
        mode: mode === "plan" ? "plan" : "default",
        settings: {
            model: typeof normalizedSettings.model === "string" && normalizedSettings.model.trim()
                ? normalizedSettings.model.trim()
                : "gpt-5.4-mini",
            reasoning_effort: typeof normalizedSettings.reasoning_effort === "string" && normalizedSettings.reasoning_effort.trim()
                ? normalizedSettings.reasoning_effort.trim()
                : "medium",
            developer_instructions: typeof normalizedSettings.developer_instructions === "string" && normalizedSettings.developer_instructions.trim()
                ? normalizedSettings.developer_instructions
                : null,
        },
    };
}
function normalizeCompatCollaborationMode(rawMode, fallbackMode = null) {
    if (typeof rawMode === "string" && rawMode.trim()) {
        return createCompatCollaborationMode(rawMode.trim());
    }
    if (rawMode && typeof rawMode === "object" && !Array.isArray(rawMode)) {
        return createCompatCollaborationMode(rawMode.mode, rawMode.settings);
    }
    if (typeof fallbackMode === "string" && fallbackMode.trim()) {
        return createCompatCollaborationMode(fallbackMode.trim());
    }
    if (fallbackMode && typeof fallbackMode === "object" && !Array.isArray(fallbackMode)) {
        return createCompatCollaborationMode(fallbackMode.mode, fallbackMode.settings);
    }
    return createCompatCollaborationMode("default");
}
function listCompatCollaborationModes() {
    return [
        createCompatCollaborationMode("default"),
        createCompatCollaborationMode("plan"),
    ];
}
function resolveCompatHostAssistMode(collaborationMode) {
    return collaborationMode?.mode === "plan" ? "plan" : "auto";
}
function resolveCompatTurnPrompt(rawPrompt, rawCollaborationMode, fallbackCollaborationMode = null) {
    const originalPrompt = typeof rawPrompt === "string" ? rawPrompt : "";
    const normalizedPrompt = originalPrompt.trim();
    const fallbackMode = normalizeCompatCollaborationMode(rawCollaborationMode, fallbackCollaborationMode);
    if (/^\/plan(?:\s|$)/i.test(normalizedPrompt)) {
        return {
            prompt: normalizedPrompt.replace(/^\/plan(?:\s+|$)/i, "").trim(),
            collaborationMode: createCompatCollaborationMode("plan", fallbackMode?.settings),
        };
    }
    if (/^\/auto(?:\s|$)/i.test(normalizedPrompt)) {
        return {
            prompt: normalizedPrompt.replace(/^\/auto(?:\s+|$)/i, "").trim(),
            collaborationMode: createCompatCollaborationMode("default", fallbackMode?.settings),
        };
    }
    return {
        prompt: originalPrompt.trim(),
        collaborationMode: fallbackMode,
    };
}
function normalizeCompatHostUserInputRequest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const record = value;
    const requestId = typeof record.requestId === "string" && record.requestId.trim()
        ? record.requestId.trim()
        : "";
    const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
    const questions = rawQuestions
        .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
        }
        const question = entry;
        const id = typeof question.id === "string" && question.id.trim() ? question.id.trim() : "";
        const text = typeof question.question === "string" && question.question.trim() ? question.question.trim() : "";
        const header = typeof question.header === "string" && question.header.trim()
            ? question.header.trim()
            : undefined;
        const options = Array.isArray(question.options)
            ? question.options
                .map((option) => {
                if (!option || typeof option !== "object" || Array.isArray(option)) {
                    return null;
                }
                const typedOption = option;
                const label = typeof typedOption.label === "string" && typedOption.label.trim()
                    ? typedOption.label.trim()
                    : "";
                const description = typeof typedOption.description === "string" && typedOption.description.trim()
                    ? typedOption.description.trim()
                    : undefined;
                if (!label) {
                    return null;
                }
                return {
                    label,
                    ...(description ? { description } : {}),
                };
            })
                .filter((option) => Boolean(option))
            : [];
        if (!id || !text) {
            return null;
        }
        return {
            id,
            ...(header ? { header } : {}),
            question: text,
            ...(options.length ? { options } : {}),
            ...(question.isOther === true ? { isOther: true } : {}),
        };
    })
        .filter((question) => Boolean(question))
        .slice(0, 3);
    if (!requestId || questions.length === 0) {
        return null;
    }
    return {
        requestId,
        questions,
    };
}
function normalizeCompatUserInputAnswers(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    const record = value;
    const rawAnswers = record.answers && typeof record.answers === "object" && !Array.isArray(record.answers)
        ? record.answers
        : {};
    const normalized = {};
    for (const [questionId, answerValue] of Object.entries(rawAnswers)) {
        const normalizedQuestionId = typeof questionId === "string" ? questionId.trim() : "";
        if (!normalizedQuestionId) {
            continue;
        }
        const rawList = Array.isArray(answerValue)
            ? answerValue
            : answerValue && typeof answerValue === "object" && Array.isArray(answerValue.answers)
                ? answerValue.answers
                : typeof answerValue === "string"
                    ? [answerValue]
                    : [];
        const answers = rawList
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0);
        if (answers.length > 0) {
            normalized[normalizedQuestionId] = answers;
        }
    }
    return normalized;
}
function syncCompatThreadTitles() {
    const orderedThreads = [...codexCompatThreads.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    const titles = {};
    const order = [];
    for (const thread of orderedThreads) {
        titles[thread.id] = thread.name;
        order.push(thread.id);
    }
    codexCompatGlobalState.set("thread-titles", { titles, order });
}
function upsertCompatThread(thread) {
    const fallbackRoot = readCompatActiveWorkspaceRoot()
        || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"))
        || normalizeCompatWorkspaceRoot(node_process_1.default.cwd())
        || node_process_1.default.cwd();
    const normalizedCwdCandidate = typeof thread.cwd === "string" && thread.cwd.trim()
        ? normalizeCompatWorkspaceRoot(normalizeCompatPathForHost(thread.cwd.trim()))
        : null;
    if (normalizedCwdCandidate) {
        ensureCompatWorkspaceRootOption(normalizedCwdCandidate);
    }
    const normalizedThread = {
        ...thread,
        cwd: normalizeCompatPathForUi(normalizedCwdCandidate || fallbackRoot),
    };
    codexCompatThreads.set(normalizedThread.id, normalizedThread);
    syncCompatThreadTitles();
    return normalizedThread;
}
function ensureCompatThread(params = {}) {
    const fallbackRoot = readCompatActiveWorkspaceRoot()
        || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"))
        || normalizeCompatWorkspaceRoot(node_process_1.default.cwd())
        || node_process_1.default.cwd();
    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const cwd = normalizeCompatPathForUi(typeof params.cwd === "string" && params.cwd.trim()
        ? params.cwd.trim()
        : fallbackRoot);
    const threadId = typeof params.id === "string" && params.id.trim() ? params.id.trim() : `local-thread-${(0, node_crypto_1.randomUUID)()}`;
    const existing = codexCompatThreads.get(threadId);
    if (existing) {
        const updated = {
            ...existing,
            cwd: cwd || existing.cwd,
            model: params.model ?? existing.model,
            reasoningEffort: params.reasoningEffort ?? existing.reasoningEffort,
            name: typeof params.name === "string" && params.name.trim() ? params.name.trim() : existing.name,
            collaborationMode: normalizeCompatCollaborationMode(params.collaborationMode, existing.collaborationMode),
        };
        return upsertCompatThread(updated);
    }
    return upsertCompatThread({
        id: threadId,
        name: typeof params.name === "string" && params.name.trim() ? params.name.trim() : "New thread",
        preview: "",
        cwd,
        createdAt: nowUnixSeconds,
        updatedAt: nowUnixSeconds,
        source: "local",
        archived: false,
        path: "",
        model: params.model ?? null,
        reasoningEffort: params.reasoningEffort ?? null,
        historySessionId: null,
        lastRunId: null,
        conversationId: null,
        collaborationMode: normalizeCompatCollaborationMode(params.collaborationMode),
    });
}
function listCompatThreads() {
    return [...codexCompatThreads.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}
function resolveCompatHostWorkspaceRoot(rawPath) {
    if (!rawPath || !rawPath.trim())
        return null;
    const hostPath = normalizeCompatPathForHost(rawPath.trim());
    try {
        return (0, node_fs_1.existsSync)(hostPath) ? hostPath : null;
    }
    catch {
        return null;
    }
}
function readCompatConfigState() {
    return cloneCompatJson(codexCompatConfigState);
}
function writeCompatConfigPath(keyPath, value) {
    const pathSegments = keyPath.split(".").map((segment) => segment.trim()).filter(Boolean);
    if (pathSegments.length === 0) {
        codexCompatConfigState = value && typeof value === "object" && !Array.isArray(value)
            ? cloneCompatJson(value)
            : {};
        codexCompatConfigVersion += 1;
        return;
    }
    const nextConfig = readCompatConfigState();
    let cursor = nextConfig;
    for (const segment of pathSegments.slice(0, -1)) {
        const existing = cursor[segment];
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
            cursor[segment] = {};
        }
        cursor = cursor[segment];
    }
    const finalKey = pathSegments[pathSegments.length - 1];
    if (value === null) {
        delete cursor[finalKey];
    }
    else {
        cursor[finalKey] = cloneCompatJson(value);
    }
    codexCompatConfigState = nextConfig;
    codexCompatConfigVersion += 1;
}
function applyCompatConfigWrite(params) {
    const keyPath = typeof params.keyPath === "string" ? params.keyPath.trim() : "";
    if (!keyPath)
        return;
    writeCompatConfigPath(keyPath, params.value);
}
function applyCompatConfigBatchWrite(params) {
    const edits = Array.isArray(params.edits) ? params.edits : [];
    for (const edit of edits) {
        if (!edit || typeof edit !== "object" || Array.isArray(edit))
            continue;
        const entry = edit;
        const keyPath = typeof entry.keyPath === "string" ? entry.keyPath.trim() : "";
        if (!keyPath)
            continue;
        writeCompatConfigPath(keyPath, entry.value);
    }
}
function readCompatTurnInputItems(params) {
    const input = Array.isArray(params.input) ? params.input : [];
    return input.filter((entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => cloneCompatJson(entry));
}
function extractCompatTurnText(params) {
    return readCompatTurnInputItems(params)
        .filter((entry) => entry.type === "text" && typeof entry.text === "string")
        .map((entry) => String(entry.text))
        .join("\n")
        .trim();
}
function normalizeCompatImageMimeType(value) {
    const mime = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!mime.startsWith("image/"))
        return "";
    return mime;
}
function inferCompatImageMimeTypeFromPath(filePath) {
    const ext = node_path_1.default.extname(String(filePath || "")).toLowerCase();
    if (ext === ".png")
        return "image/png";
    if (ext === ".jpg" || ext === ".jpeg")
        return "image/jpeg";
    if (ext === ".webp")
        return "image/webp";
    if (ext === ".gif")
        return "image/gif";
    if (ext === ".bmp")
        return "image/bmp";
    return "";
}
function resolveCompatImageDataUrl(candidate, mimeTypeHint) {
    const raw = typeof candidate === "string" ? candidate.trim() : "";
    if (!raw)
        return null;
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) {
        return { dataUrl: raw, mimeType: normalizeCompatImageMimeType(mimeTypeHint) || "" };
    }
    const mimeType = normalizeCompatImageMimeType(mimeTypeHint);
    if (mimeType && /^[a-z0-9+/=\s]+$/i.test(raw) && raw.length > 64) {
        const normalizedBase64 = raw.replace(/\s+/g, "");
        return {
            dataUrl: `data:${mimeType};base64,${normalizedBase64}`,
            mimeType,
        };
    }
    if (node_fs_1.existsSync(raw)) {
        const resolvedMime = mimeType || inferCompatImageMimeTypeFromPath(raw);
        if (!resolvedMime)
            return null;
        try {
            const base64 = (0, node_fs_1.readFileSync)(raw).toString("base64");
            return {
                dataUrl: `data:${resolvedMime};base64,${base64}`,
                mimeType: resolvedMime,
            };
        }
        catch {
            return null;
        }
    }
    return null;
}
function normalizeCompatImageInputCandidate(entry, source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return null;
    const imageSource = entry;
    const candidateMimeType = normalizeCompatImageMimeType(imageSource.mimeType || imageSource.mediaType || imageSource.contentType || imageSource.mimetype);
    const dataCandidates = [
        imageSource.dataUrl,
        imageSource.data_uri,
        imageSource.dataUri,
        imageSource.imageUrl,
        imageSource.imageURL,
        imageSource.image_url,
        imageSource.url,
        imageSource.uri,
        imageSource.path,
        imageSource.filePath,
        imageSource.base64,
        imageSource.imageBase64,
        imageSource.data,
    ];
    for (const candidate of dataCandidates) {
        const normalized = resolveCompatImageDataUrl(candidate, candidateMimeType);
        if (!normalized)
            continue;
        return {
            mimeType: normalized.mimeType || "image/png",
            dataUrl: normalized.dataUrl,
            source,
            caption: typeof imageSource.caption === "string" ? imageSource.caption.trim() : "",
            name: typeof imageSource.name === "string" ? imageSource.name.trim() : "",
        };
    }
    return null;
}
function extractCompatTurnImageInputs(params) {
    const output = [];
    const seen = new Set();
    const inputItems = readCompatTurnInputItems(params);
    for (const entry of inputItems) {
        const item = entry;
        const entryType = typeof item.type === "string" ? item.type.trim().toLowerCase() : "";
        if (entryType && !entryType.includes("image")) {
            const hasImageField = Boolean(item.imageUrl || item.image_url || item.dataUrl || item.base64 || item.path);
            if (!hasImageField)
                continue;
        }
        const normalized = normalizeCompatImageInputCandidate(item, "composer_input");
        if (!normalized)
            continue;
        if (seen.has(normalized.dataUrl))
            continue;
        seen.add(normalized.dataUrl);
        output.push(normalized);
    }
    const attachments = Array.isArray(params.attachments) ? params.attachments : [];
    for (const entry of attachments) {
        const normalized = normalizeCompatImageInputCandidate(entry, "attachment");
        if (!normalized)
            continue;
        if (seen.has(normalized.dataUrl))
            continue;
        seen.add(normalized.dataUrl);
        output.push(normalized);
    }
    return output.slice(0, 6);
}
function extractCompatSsePayloads(buffer) {
    const parts = buffer.split(/\r?\n\r?\n/g);
    const remainder = parts.pop() ?? "";
    const payloads = parts
        .map((part) => part.split(/\r?\n/))
        .map((lines) => lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n"))
        .filter((payload) => payload.length > 0);
    return { payloads, remainder };
}
function normalizeCompatNaturalText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
function formatCompatNaturalLabel(value) {
    const normalized = normalizeCompatNaturalText(value);
    if (!normalized)
        return "";
    if (/^https?:\/\//i.test(normalized)) {
        try {
            const parsed = new URL(normalized);
            const host = parsed.hostname.replace(/^www\./i, "");
            const path = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).join(" ");
            const combined = normalizeCompatNaturalText(`${host} ${path}`.replace(/[-_]+/g, " "));
            if (combined)
                return combined;
        }
        catch (_error) {
        }
    }
    return normalized
        .replace(/[-_]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.length <= 3
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(" ");
}
function summarizeCompatStructuredToolCall(value) {
    const record = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    if (!record)
        return null;
    const nestedData = record.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data : null;
    const toolCall = record.toolCall && typeof record.toolCall === "object" && !Array.isArray(record.toolCall)
        ? record.toolCall
        : nestedData && nestedData.toolCall && typeof nestedData.toolCall === "object" && !Array.isArray(nestedData.toolCall)
            ? nestedData.toolCall
            : null;
    if (!toolCall)
        return null;
    const summary = normalizeCompatNaturalText(typeof toolCall.summary === "string" ? toolCall.summary : typeof record.summary === "string" ? record.summary : "");
    if (summary) {
        if (/^i('m| am)\b/i.test(summary))
            return summary;
        return `I'm ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`;
    }
    const toolName = normalizeCompatNaturalText(typeof toolCall.name === "string" ? toolCall.name : "");
    const args = toolCall.arguments && typeof toolCall.arguments === "object" && !Array.isArray(toolCall.arguments)
        ? toolCall.arguments
        : {};
    const target = formatCompatNaturalLabel(typeof args.resultQuery === "string"
        ? args.resultQuery
        : typeof args.query === "string"
            ? args.query
            : typeof args.url === "string"
                ? args.url
                : "");
    if (toolName === "open_browser" || toolName === "browser_open_page" || toolName === "browser_search_and_open_best_result") {
        return target ? `I'm opening ${target} in the browser.` : "I'm opening that in the browser.";
    }
    if (toolName === "read_file") {
        return "I'm reading the relevant files now.";
    }
    if (toolName === "run_command") {
        return "I'm running the needed command now.";
    }
    if (toolName === "list_files") {
        return "I'm checking the relevant files now.";
    }
    if (toolName === "create_file" || toolName === "write_file") {
        const targetPath = formatCompatNaturalLabel(typeof args.path === "string" ? args.path : "");
        return targetPath ? `I'm creating ${targetPath} now.` : "I'm creating that file now.";
    }
    if (toolName) {
        return `I'm using ${toolName.replace(/_/g, " ")} to work on this.`;
    }
    return null;
}
function humanizeCompatHostMessage(rawMessage) {
    return humanizeCompatHostMessageInternal(rawMessage, new Set(), 0);
}
function humanizeCompatHostMessageInternal(rawMessage, seenMessages, depth) {
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    if (!message)
        return "";
    if (depth > 6 || seenMessages.has(message))
        return message;
    seenMessages.add(message);
    if (/^[\[{]/.test(message)) {
        const structured = safeJsonParse(message, null);
        const structuredSummary = summarizeCompatStructuredToolCall(structured);
        if (structuredSummary)
            return structuredSummary;
        if (structured && typeof structured === "object" && !Array.isArray(structured)) {
            const nestedMessage = typeof structured.message === "string"
                ? structured.message
                : structured.data && typeof structured.data === "object" && !Array.isArray(structured.data) && typeof structured.data.message === "string"
                    ? structured.data.message
                    : typeof structured.final === "string"
                        ? structured.final
                        : "";
            if (nestedMessage && nestedMessage.trim() !== message)
                return humanizeCompatHostMessageInternal(nestedMessage, seenMessages, depth + 1);
        }
    }
    const causeMatch = message.match(/Cause:\s*(.+)$/i);
    const cause = causeMatch ? causeMatch[1].trim() : message;
    if (/final response came back empty/i.test(message)) {
        return "I didn't get a usable reply back that time. Please try once more.";
    }
    if (/openrouter free is busy right now/i.test(message)) {
        return message;
    }
    if (/http error 429|too many requests|rate.?limit|quota exceeded|resource_exhausted/i.test(cause)) {
        return "The AI provider is busy right now. Please try again in a moment.";
    }
    if (/http error 502|bad gateway|gateway timeout|service unavailable|temporarily unavailable/i.test(cause)) {
        return "The AI service is temporarily unavailable right now. Please try again in a moment.";
    }
    if (/http error 401|unauthorized|authentication token|signing in again|portal bridge authentication failed/i.test(cause)) {
        return "The Codex connection needs to be signed in again. Binary will use a backup model when it can.";
    }
    if (/provider capacity/i.test(cause)) {
        return "The AI provider is temporarily at capacity. Please try again in a moment.";
    }
    if (/binary host failed on the local openhands path/i.test(message)) {
        return cause !== message ? humanizeCompatHostMessageInternal(cause, seenMessages, depth + 1) : message;
    }
    if (/i hit temporary provider capacity/i.test(message)) {
        return "The AI provider is busy right now. Please try again in a moment.";
    }
    if (/strict openhands terminal mode is enabled/i.test(cause)) {
        return "The coding terminal isn't ready yet. Please retry in a moment.";
    }
    if (/turn budget exceeded/i.test(cause)) {
        return "The response took too long this time. Please try again.";
    }
    if (/llm provider not provided|no endpoints found|deprecated/i.test(cause)) {
        return "The selected AI model isn't available right now. Please try again shortly.";
    }
    return message;
}
function compatEmptyFinalFallback() {
    return "I didn't get a usable reply back that time. Please try once more.";
}
function summarizeCompatHostEvent(payload) {
    const eventName = typeof payload.event === "string" ? payload.event : "";
    const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data
        : {};
    if (eventName === "host.status") {
        const message = humanizeCompatHostMessage(typeof data.message === "string" ? data.message.trim() : "");
        if (!message)
            return null;
        const progressTick = typeof data.progressTick === "number" ? data.progressTick : null;
        const startupPhase = typeof data.startupPhase === "string" ? data.startupPhase : "";
        if (startupPhase === "fast_start") {
            if (progressTick === 0 || progressTick === 1)
                return null;
            return null;
        }
        if (message === "Binary Host accepted the request.")
            return null;
        if (message.includes("routing this run through OpenHands"))
            return null;
        if (message.includes("OpenHands-first default") || message.includes("local interactive OpenHands path"))
            return null;
        if (message.includes("Using the local runtime for this request."))
            return null;
        if (message.includes("Coding runtime is ready"))
            return null;
        if (message.includes("received the initial assist response"))
            return null;
        if (message.includes("completed the run"))
            return null;
        if (/busy right now|temporarily unavailable|provider is temporarily at capacity/i.test(message))
            return null;
        if (/error|failed|blocked|takeover|repair|busy right now|temporarily unavailable|too long this time|isn't ready yet|isn't available right now/i.test(message))
            return message;
        return null;
    }
    if (eventName === "tool_request") {
        const toolCall = data.toolCall && typeof data.toolCall === "object" && !Array.isArray(data.toolCall)
            ? data.toolCall
            : {};
        const summary = typeof toolCall.summary === "string" && toolCall.summary.trim()
            ? toolCall.summary.trim()
            : typeof data.summary === "string" && data.summary.trim()
                ? data.summary.trim()
                : "";
        if (summary)
            return `I'm ${summary.charAt(0).toLowerCase()}${summary.slice(1)}.`;
        const toolName = typeof toolCall.name === "string" ? toolCall.name.trim() : "";
        if (toolName)
            return `I'm using ${toolName} to work on this.`;
    }
    if (eventName === "host.stall") {
        return "Still working on this.";
    }
    if (eventName === "host.takeover_required") {
        return "I need your attention to continue.";
    }
    return null;
}
async function trustCompatHostWorkspace(workspaceRoot) {
    const response = await fetch(`${defaultHostUrl}/v1/workspaces/trust`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify({
            path: workspaceRoot,
            mutate: true,
            commands: "allow",
            network: "allow",
            elevated: "allow",
        }),
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(raw || `Unable to trust workspace ${workspaceRoot}`);
    }
}
async function trustCompatHostWorkspaceRoots(workspaceRoots) {
    const roots = normalizeCompatWorkspaceRoots(Array.isArray(workspaceRoots) ? workspaceRoots : []);
    for (const root of roots) {
        try {
            await trustCompatHostWorkspace(root);
            appendCodexCompatLog(`workspace-auto-trusted root=${root}`);
        }
        catch (error) {
            appendCodexCompatLog(`workspace-auto-trust-failed root=${root} error=${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
async function readCompatHostRunFinal(runId) {
    const response = await fetch(`${defaultHostUrl}/v1/runs/${encodeURIComponent(runId)}`, {
        method: "GET",
        headers: {
            accept: "application/json",
        },
    });
    if (!response.ok) {
        const raw = await response.text().catch(() => "");
        throw new Error(raw || `Unable to read Binary Host run ${runId}`);
    }
    const payload = safeJsonParse(await response.text(), {});
    const finalEnvelope = payload.finalEnvelope && typeof payload.finalEnvelope === "object" && !Array.isArray(payload.finalEnvelope)
        ? payload.finalEnvelope
        : {};
    const finalText = typeof finalEnvelope.final === "string" ? finalEnvelope.final.trim() : "";
    const closureSummary = typeof finalEnvelope.closureSummary === "string" ? finalEnvelope.closureSummary.trim() : "";
    const takeoverReason = typeof payload.takeoverReason === "string" ? payload.takeoverReason.trim() : "";
    const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
    const resolvedText = humanizeCompatHostMessage(finalText
        || closureSummary
        || (status === "takeover_required"
            ? takeoverReason
                ? `I need your attention to continue. ${takeoverReason}`
                : "I need your attention to continue."
            : ""));
    const conversationId = typeof payload.conversationId === "string"
        ? payload.conversationId
        : typeof finalEnvelope.conversationId === "string"
            ? finalEnvelope.conversationId
            : null;
    return {
        text: resolvedText,
        conversationId,
    };
}
async function runCompatHostAssist(thread, prompt, options) {
    const workspaceRoot = resolveCompatHostWorkspaceRoot(thread.cwd)
        || readCompatActiveWorkspaceRoot()
        || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"))
        || normalizeCompatWorkspaceRoot(node_process_1.default.cwd())
        || node_process_1.default.cwd();
    const sessionModelOverride = typeof node_process_1.default.env.BINARY_IDE_SESSION_MODEL_OVERRIDE === "string"
        && node_process_1.default.env.BINARY_IDE_SESSION_MODEL_OVERRIDE.trim()
        ? node_process_1.default.env.BINARY_IDE_SESSION_MODEL_OVERRIDE.trim()
        : null;
    const machineRootPath = node_process_1.default.platform === "win32"
        ? readCompatActiveWorkspaceRoot() || workspaceRoot
        : workspaceRoot;
    const collaborationMode = normalizeCompatCollaborationMode(options?.collaborationMode, thread.collaborationMode);
    const requestBody = {
        task: prompt,
        mode: resolveCompatHostAssistMode(collaborationMode),
        model: sessionModelOverride || "Binary IDE",
        speedProfile: "fast",
        historySessionId: thread.historySessionId || undefined,
        workspaceRoot: workspaceRoot || undefined,
        machineRootPath: machineRootPath || undefined,
        focusWorkspaceRoot: workspaceRoot || undefined,
        focusRepoRoot: workspaceRoot || undefined,
        client: {
            surface: "desktop",
            version: "codex_compat_bridge",
        },
        ...(Array.isArray(options?.imageInputs) && options.imageInputs.length
            ? { imageInputs: options.imageInputs }
            : {}),
    };
    const assistTimeoutMs = Math.max(10000, Number(process.env.BINARY_IDE_COMPAT_ASSIST_TIMEOUT_MS || 45000));
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), assistTimeoutMs);
        let response;
        try {
            response = await fetch(`${defaultHostUrl}/v1/runs/assist`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "text/event-stream, application/json",
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });
        }
        catch (error) {
            clearTimeout(timeoutHandle);
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error("The local runtime timed out while waiting for a first response. Please retry.");
            }
            throw error;
        }
        const decoder = new TextDecoder();
        let raw = "";
        let buffer = "";
        const sseEvents = [];
        const seenProgressMessages = new Set();
        let latestProgressMessage = "";
        const pushProgressMessage = (message) => {
            const normalized = typeof message === "string" ? message.trim() : "";
            if (!normalized || seenProgressMessages.has(normalized))
                return;
            seenProgressMessages.add(normalized);
            latestProgressMessage = normalized;
            options?.onProgress?.(normalized);
        };
        let runId = null;
        let finalText = "";
        let userInputRequest = null;
        if (response.body) {
            const reader = response.body.getReader();
            try {
                while (true) {
                    const next = await reader.read();
                    if (next.done)
                        break;
                    const chunk = decoder.decode(next.value, { stream: true });
                    raw += chunk;
                    buffer += chunk;
                    const parsedBuffer = extractCompatSsePayloads(buffer);
                    buffer = parsedBuffer.remainder;
                    for (const entry of parsedBuffer.payloads) {
                        sseEvents.push(entry);
                        if (entry === "[DONE]")
                            continue;
                        const parsed = safeJsonParse(entry, entry);
                        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                            continue;
                        const payload = parsed;
                        const payloadData = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
                            ? payload.data
                            : {};
                        if (!runId) {
                            runId =
                                (typeof payload.runId === "string" ? payload.runId : null) ||
                                    (typeof payloadData.runId === "string" ? payloadData.runId : null);
                        }
                        if (!userInputRequest && payload.event === "request_user_input" && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
                            userInputRequest = normalizeCompatHostUserInputRequest(payload.data);
                            continue;
                        }
                        if (!finalText && payload.event === "final" && typeof payload.data === "string") {
                            finalText = payload.data.trim();
                        }
                        pushProgressMessage(summarizeCompatHostEvent(payload));
                    }
                }
            }
            catch (error) {
                clearTimeout(timeoutHandle);
                if (error instanceof Error && error.name === "AbortError") {
                    throw new Error("The local runtime timed out while waiting for a first response. Please retry.");
                }
                throw error;
            }
            raw += decoder.decode();
            if (buffer.trim()) {
                const parsedBuffer = extractCompatSsePayloads(`${buffer}\n\n`);
                for (const entry of parsedBuffer.payloads) {
                    sseEvents.push(entry);
                    if (entry === "[DONE]")
                        continue;
                    const parsed = safeJsonParse(entry, entry);
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                        continue;
                    const payload = parsed;
                    const payloadData = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
                        ? payload.data
                        : {};
                    if (!runId) {
                        runId =
                            (typeof payload.runId === "string" ? payload.runId : null) ||
                                (typeof payloadData.runId === "string" ? payloadData.runId : null);
                    }
                    if (!userInputRequest && payload.event === "request_user_input" && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
                        userInputRequest = normalizeCompatHostUserInputRequest(payload.data);
                        continue;
                    }
                    if (!finalText && payload.event === "final" && typeof payload.data === "string") {
                        finalText = payload.data.trim();
                    }
                    pushProgressMessage(summarizeCompatHostEvent(payload));
                }
            }
        }
        else {
            raw = await response.text();
            sseEvents.push(...parseSseDataChunks(raw));
        }
        clearTimeout(timeoutHandle);
        appendCodexCompatLog(`host-assist status=${response.status} payload=${summarizeForCompatLog(raw, 900)}`);
        if (response.status === 403 && workspaceRoot && attempt === 0) {
            appendCodexCompatLog(`host-assist workspace-trust requested path=${workspaceRoot}`);
            await trustCompatHostWorkspace(workspaceRoot);
            continue;
        }
        if (!response.ok) {
            const detail = sseEvents
                .map((entry) => entry.trim())
                .find((entry) => entry && entry !== "[DONE]")
                || raw.trim()
                || `Binary Host assist failed with status ${response.status}`;
            throw new Error(humanizeCompatHostMessage(detail));
        }
        if (runId && !userInputRequest) {
            const finalizedRun = await readCompatHostRunFinal(runId);
            return {
                text: finalizedRun.text
                    || finalText
                    || humanizeCompatHostMessage(latestProgressMessage)
                    || compatEmptyFinalFallback(),
                runId,
                conversationId: finalizedRun.conversationId,
                userInputRequest: null,
            };
        }
        return {
            text: userInputRequest
                ? humanizeCompatHostMessage(finalText || latestProgressMessage)
                : humanizeCompatHostMessage(finalText || latestProgressMessage) || compatEmptyFinalFallback(),
            runId,
            conversationId: null,
            userInputRequest,
        };
    }
    throw new Error("Binary Host assist could not be started.");
}
async function continueCompatHostAssistWithUserInput(runId, requestId, answers, options) {
    const assistTimeoutMs = Math.max(10000, Number(process.env.BINARY_IDE_COMPAT_ASSIST_TIMEOUT_MS || 45000));
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), assistTimeoutMs);
    let response;
    try {
        response = await fetch(`${defaultHostUrl}/v1/runs/${encodeURIComponent(runId)}/user-input`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "text/event-stream, application/json",
            },
            body: JSON.stringify({
                requestId,
                answers,
            }),
            signal: controller.signal,
        });
    }
    catch (error) {
        clearTimeout(timeoutHandle);
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("The local runtime timed out while waiting for a planning follow-up response. Please retry.");
        }
        throw error;
    }
    const decoder = new TextDecoder();
    let raw = "";
    let buffer = "";
    const sseEvents = [];
    const seenProgressMessages = new Set();
    let latestProgressMessage = "";
    const pushProgressMessage = (message) => {
        const normalized = typeof message === "string" ? message.trim() : "";
        if (!normalized || seenProgressMessages.has(normalized))
            return;
        seenProgressMessages.add(normalized);
        latestProgressMessage = normalized;
        options?.onProgress?.(normalized);
    };
    let continuedRunId = runId;
    let finalText = "";
    let userInputRequest = null;
    if (response.body) {
        const reader = response.body.getReader();
        try {
            while (true) {
                const next = await reader.read();
                if (next.done)
                    break;
                const chunk = decoder.decode(next.value, { stream: true });
                raw += chunk;
                buffer += chunk;
                const parsedBuffer = extractCompatSsePayloads(buffer);
                buffer = parsedBuffer.remainder;
                for (const entry of parsedBuffer.payloads) {
                    sseEvents.push(entry);
                    if (entry === "[DONE]")
                        continue;
                    const parsed = safeJsonParse(entry, entry);
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                        continue;
                    const payload = parsed;
                    const payloadData = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
                        ? payload.data
                        : {};
                    if (typeof payload.runId === "string" && payload.runId.trim()) {
                        continuedRunId = payload.runId.trim();
                    }
                    else if (typeof payloadData.runId === "string" && payloadData.runId.trim()) {
                        continuedRunId = payloadData.runId.trim();
                    }
                    if (!userInputRequest && payload.event === "request_user_input" && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
                        userInputRequest = normalizeCompatHostUserInputRequest(payload.data);
                        continue;
                    }
                    if (!finalText && payload.event === "final" && typeof payload.data === "string") {
                        finalText = payload.data.trim();
                    }
                    pushProgressMessage(summarizeCompatHostEvent(payload));
                }
            }
        }
        catch (error) {
            clearTimeout(timeoutHandle);
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error("The local runtime timed out while waiting for a planning follow-up response. Please retry.");
            }
            throw error;
        }
        raw += decoder.decode();
        if (buffer.trim()) {
            const parsedBuffer = extractCompatSsePayloads(`${buffer}\n\n`);
            for (const entry of parsedBuffer.payloads) {
                sseEvents.push(entry);
                if (entry === "[DONE]")
                    continue;
                const parsed = safeJsonParse(entry, entry);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
                    continue;
                const payload = parsed;
                const payloadData = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
                    ? payload.data
                    : {};
                if (typeof payload.runId === "string" && payload.runId.trim()) {
                    continuedRunId = payload.runId.trim();
                }
                else if (typeof payloadData.runId === "string" && payloadData.runId.trim()) {
                    continuedRunId = payloadData.runId.trim();
                }
                if (!userInputRequest && payload.event === "request_user_input" && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
                    userInputRequest = normalizeCompatHostUserInputRequest(payload.data);
                    continue;
                }
                if (!finalText && payload.event === "final" && typeof payload.data === "string") {
                    finalText = payload.data.trim();
                }
                pushProgressMessage(summarizeCompatHostEvent(payload));
            }
        }
    }
    else {
        raw = await response.text();
        sseEvents.push(...parseSseDataChunks(raw));
    }
    clearTimeout(timeoutHandle);
    appendCodexCompatLog(`host-user-input status=${response.status} payload=${summarizeForCompatLog(raw, 900)}`);
    if (!response.ok) {
        const detail = sseEvents
            .map((entry) => entry.trim())
            .find((entry) => entry && entry !== "[DONE]")
            || raw.trim()
            || `Binary Host user-input resume failed with status ${response.status}`;
        throw new Error(humanizeCompatHostMessage(detail));
    }
    if (continuedRunId && !userInputRequest) {
        const finalizedRun = await readCompatHostRunFinal(continuedRunId);
        return {
            text: finalizedRun.text
                || finalText
                || humanizeCompatHostMessage(latestProgressMessage)
                || compatEmptyFinalFallback(),
            runId: continuedRunId,
            conversationId: finalizedRun.conversationId,
            userInputRequest: null,
        };
    }
    return {
        text: userInputRequest
            ? humanizeCompatHostMessage(finalText || latestProgressMessage)
            : humanizeCompatHostMessage(finalText || latestProgressMessage) || compatEmptyFinalFallback(),
        runId: continuedRunId,
        conversationId: null,
        userInputRequest,
    };
}
function readCompatPinnedThreadIds() {
    const raw = codexCompatGlobalState.get("pinned-thread-ids");
    if (!Array.isArray(raw))
        return [];
    return raw.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}
function readCompatConfigurationValue(rawKey) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    switch (key) {
        case "preventSleepWhileRunning":
            return false;
        case "appearanceTheme":
            return "dark";
        case "appearanceLightChromeTheme":
            return "light";
        case "appearanceDarkChromeTheme":
            return "dark";
        case "appearanceLightCodeThemeId":
            return "github-light";
        case "appearanceDarkCodeThemeId":
            return "nord";
        case "sansFontSize":
            return 16;
        case "codeFontSize":
            return 13;
        case "usePointerCursors":
            return true;
        case "localeOverride":
            return null;
        case "runCodexInWindowsSubsystemForLinux":
            return false;
        case "followUpQueueMode":
            return "auto";
        default:
            // Unknown keys are list-safe by default in compat mode.
            return [];
    }
}
function buildCompatListPayload(rows, includeCursor = true) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const payload = {
        data: normalizedRows,
        rows: normalizedRows,
    };
    if (includeCursor) {
        payload.nextCursor = null;
    }
    return payload;
}
function buildCompatSharedObjectFallback(key) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === "pending_worktrees" ||
        normalizedKey === "remote_connections" ||
        normalizedKey === "diff_comments" ||
        normalizedKey === "diff_comments_from_model") {
        return [];
    }
    if (normalizedKey === "host_config") {
        return {
            hosts: [],
            selectedHostId: null,
        };
    }
    if (normalizedKey === "skills_refresh_nonce") {
        return 0;
    }
    if (normalizedKey === "statsig_default_enable_features") {
        return false;
    }
    if (normalizedKey === "composer_prefill") {
        return {
            prompt: "",
            imageAttachments: [],
            fileAttachments: [],
        };
    }
    if (!normalizedKey.includes("composer")) {
        return undefined;
    }
    return {
        composerMode: "ask",
        isAutoContextOn: true,
        imageAttachments: [],
        fileAttachments: [],
        addedFiles: [],
        prompt: "",
    };
}
function readCompatSharedObjectValue(key) {
    if (codexSharedObjectState.has(key)) {
        return codexSharedObjectState.get(key);
    }
    const fallback = buildCompatSharedObjectFallback(key);
    if (fallback !== undefined) {
        codexSharedObjectState.set(key, fallback);
        return fallback;
    }
    return undefined;
}
function buildCompatVscodeFetchResult(endpoint, params) {
    const activeWorkspaceRoot = resolveCompatActiveWorkspaceRoot();
    const activeWorkspaceRootUi = activeWorkspaceRoot ? normalizeCompatPathForUi(activeWorkspaceRoot) : null;
    switch (endpoint) {
        case "ipc-request":
            return null;
        case "extension-info":
            return {
                version: electron_1.app.getVersion(),
                buildFlavor: CODEX_BUILD_FLAVOR,
            };
        case "is-copilot-api-available":
            return {
                available: true,
            };
        case "list-pinned-threads":
            return {
                threadIds: readCompatPinnedThreadIds(),
            };
        case "pin-thread": {
            const threadIdCandidate = typeof params.threadId === "string" ? params.threadId : typeof params.conversationId === "string" ? params.conversationId : "";
            const threadId = threadIdCandidate.trim();
            const threadIds = readCompatPinnedThreadIds();
            if (threadId && !threadIds.includes(threadId)) {
                threadIds.push(threadId);
                codexCompatGlobalState.set("pinned-thread-ids", threadIds);
            }
            return { ok: true, threadIds };
        }
        case "unpin-thread": {
            const threadIdCandidate = typeof params.threadId === "string" ? params.threadId : typeof params.conversationId === "string" ? params.conversationId : "";
            const threadId = threadIdCandidate.trim();
            const threadIds = readCompatPinnedThreadIds().filter((entry) => entry !== threadId);
            codexCompatGlobalState.set("pinned-thread-ids", threadIds);
            return { ok: true, threadIds };
        }
        case "get-global-state": {
            const key = typeof params.key === "string" ? params.key : "";
            const value = key ? codexCompatGlobalState.get(key) : null;
            return {
                value: cloneCompatJson(value ?? null),
            };
        }
        case "set-global-state": {
            const key = typeof params.key === "string" ? params.key : "";
            if (key) {
                codexCompatGlobalState.set(key, cloneCompatJson(params.value));
                if (key === "project-order" || key === "thread-workspace-root-hints") {
                    syncCompatWorkspaceRootsFromGlobalHints();
                }
            }
            return {
                ok: true,
            };
        }
        case "active-workspace-roots": {
            return {
                roots: activeWorkspaceRootUi ? [activeWorkspaceRootUi] : [],
            };
        }
        case "workspace-root-options": {
            const roots = readCompatWorkspaceRootOptionsForUi();
            return {
                roots: roots.map((root) => root.replace(/\\/g, "/")),
                labels: compatWorkspaceRootLabels(roots),
            };
        }
        case "git-origins":
            return {
                origins: [],
            };
        case "codex-home":
            return {
                codexHome: electron_1.app.getPath("home").replace(/\\/g, "/"),
            };
        case "get-configuration": {
            const key = typeof params.key === "string" ? params.key : "";
            return {
                value: readCompatConfigurationValue(key),
            };
        }
        case "locale-info":
            return {
                ideLocale: electron_1.app.getLocale(),
                systemLocale: electron_1.app.getSystemLocale(),
            };
        case "os-info":
            return {
                platform: node_process_1.default.platform,
            };
        case "recommended-skills":
            return {
                skills: [],
            };
        case "local-custom-agents":
            return {
                agents: [],
            };
        case "list-pending-automation-run-threads":
            return {
                threadIds: [],
            };
        case "inbox-items":
            return {
                items: [],
            };
        case "hotkey-window-hotkey-state":
            return {
                supported: false,
                isDevMode: false,
                configuredHotkey: null,
                isGateEnabled: false,
                isActive: false,
                isDevOverrideEnabled: false,
            };
        case "local-environments":
            return {
                environments: [],
            };
        case "open-in-targets":
            return {
                targets: [],
            };
        case "gh-cli-status":
            return {
                installed: false,
                authenticated: false,
            };
        case "gh-pr-status":
            return {
                available: false,
            };
        case "ide-context":
            return {
                cwd: activeWorkspaceRootUi,
                selectedText: null,
                openFiles: [],
            };
        case "paths-exist": {
            const paths = Array.isArray(params.paths) ? params.paths : [];
            const results = paths.map((entry) => {
                const rawPath = String(entry);
                const resolvedPath = normalizeCompatPathForHost(rawPath);
                let exists = false;
                try {
                    exists = (0, node_fs_1.existsSync)(resolvedPath);
                }
                catch {
                    exists = false;
                }
                return { path: rawPath, exists };
            });
            return {
                results,
                existingPaths: results
                    .filter((entry) => entry.exists)
                    .map((entry) => normalizeCompatPathForUi(entry.path).replace(/\/+$/, "")),
            };
        }
        case "get-copilot-api-proxy-info":
            return null;
        case "mcp-codex-config":
            return {
                config: {},
            };
        case "worktree-shell-environment-config":
            return {
                shellEnvironment: null,
            };
        case "developer-instructions":
            return {
                instructions: typeof params.baseInstructions === "string" ? params.baseInstructions : null,
            };
        case "open-file":
            return {
                ok: true,
            };
        default: {
            if (!seenUnsupportedCodexFetchMethods.has(endpoint)) {
                seenUnsupportedCodexFetchMethods.add(endpoint);
                appendCodexCompatLog(`unsupported-vscode-fetch method=${endpoint}`);
            }
            return {
                ok: true,
                unsupported: true,
                method: endpoint,
            };
        }
    }
}
function sanitizeWorkspaceFolderName(value) {
    const candidate = typeof value === "string" ? value.trim() : "";
    const normalized = candidate
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized || normalized === "." || normalized === "..") {
        return "Binary Project";
    }
    return normalized;
}
async function resolveCompatOnboardingWorkspaceRoot(defaultProjectName) {
    if (codexCompatWorkspaceRoot && codexCompatWorkspaceRoot.trim()) {
        return { root: codexCompatWorkspaceRoot, source: "existing" };
    }
    const documentsDir = electron_1.app.getPath("documents");
    const folderBase = sanitizeWorkspaceFolderName(defaultProjectName);
    let suffix = 0;
    while (true) {
        const folderName = suffix <= 0 ? folderBase : `${folderBase} ${suffix + 1}`;
        const candidate = node_path_1.default.resolve(documentsDir, folderName);
        try {
            const stats = await node_fs_1.promises.stat(candidate);
            if (stats.isDirectory()) {
                codexCompatWorkspaceRoot = candidate;
                return { root: candidate, source: "existing" };
            }
            suffix += 1;
            continue;
        }
        catch {
            await node_fs_1.promises.mkdir(candidate, { recursive: true });
            codexCompatWorkspaceRoot = candidate;
            return { root: candidate, source: "created_default" };
        }
    }
}
async function sendCompatOnboardingWorkspaceResult(sender, payload) {
    let source = "existing";
    let root = null;
    try {
        if (node_process_1.default.platform === "win32") {
            const startupRoots = resolveCompatWholePcStartupRoots();
            root = chooseCompatPrimaryWorkspaceRoot(startupRoots);
            source = "whole_pc";
            if (!root) {
                throw new Error("Unable to resolve a fixed-drive startup root.");
            }
            setCompatWorkspaceRoots(startupRoots, root);
        }
        else {
            const resolved = await resolveCompatOnboardingWorkspaceRoot(payload.defaultProjectName);
            source = resolved.source;
            root = resolved.root;
            setCompatWorkspaceRoots([root], root);
        }
        notifyCompatWorkspaceRootsUpdated(sender, true);
        sendCodexMessageToWebContents(sender, {
            type: "electron-onboarding-pick-workspace-or-create-default-result",
            success: true,
            source,
            root,
        });
    }
    catch (error) {
        sendCodexMessageToWebContents(sender, {
            type: "electron-onboarding-pick-workspace-or-create-default-result",
            success: false,
            source,
            root: root ?? undefined,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
function resolveDefaultTerminalShell() {
    if (node_process_1.default.platform === "win32") {
        return node_process_1.default.env.ComSpec || "cmd.exe";
    }
    return node_process_1.default.env.SHELL || "/bin/bash";
}
function normalizeTerminalCwd(value) {
    const candidate = typeof value === "string" && value.trim() ? node_path_1.default.resolve(value) : repoRoot;
    try {
        if ((0, node_fs_1.existsSync)(candidate) && (0, node_fs_1.statSync)(candidate).isDirectory()) {
            return candidate;
        }
    }
    catch {
        // Fall back to the repo root when the requested cwd is unavailable.
    }
    return repoRoot;
}
function normalizeTerminalShell(value) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    return resolveDefaultTerminalShell();
}
function appendTerminalSessionLog(sessionState, chunk) {
    sessionState.log = `${sessionState.log}${chunk}`.slice(-16000);
}
function sendTerminalData(sessionId, data) {
    sendCodexMessageToCompatWindows({
        type: "terminal-data",
        sessionId,
        data,
    });
}
function sendTerminalError(sessionId, message) {
    sendCodexMessageToCompatWindows({
        type: "terminal-error",
        sessionId,
        message,
    });
}
function summarizeTerminalInputForLog(data) {
    const text = typeof data === "string" ? data : "";
    if (!text)
        return "";
    return text
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\b/g, "\\b")
        .replace(/\u007f/g, "\\x7f")
        .slice(0, 120);
}
function getTerminalShellLaunch(shell) {
    const normalizedShell = normalizeTerminalShell(shell);
    const lowerShell = normalizedShell.toLowerCase();
    if (lowerShell.endsWith("powershell.exe") || lowerShell === "powershell" || lowerShell.endsWith("pwsh.exe") || lowerShell === "pwsh") {
        return { command: normalizedShell, args: ["-NoLogo"] };
    }
    if (lowerShell.endsWith("cmd.exe") || lowerShell === "cmd") {
        return { command: normalizedShell, args: [] };
    }
    return { command: normalizedShell, args: [] };
}
function spawnTerminalProcess(sessionState) {
    const nodePty = loadNodePty();
    if (nodePty) {
        const launch = getTerminalShellLaunch(sessionState.shell);
        try {
            appendCodexCompatLog(`terminal-spawn mode=pty session=${sessionState.sessionId} shell=${launch.command} cwd=${sessionState.cwd}`);
            const ptyProcess = nodePty.spawn(launch.command, launch.args, {
                name: node_process_1.default.env.TERM || "xterm-256color",
                cols: Math.max(40, Number(sessionState.cols || 120)),
                rows: Math.max(12, Number(sessionState.rows || 32)),
                cwd: sessionState.cwd,
                env: {
                    ...node_process_1.default.env,
                    TERM: node_process_1.default.env.TERM || "xterm-256color",
                },
                ...(node_process_1.default.platform === "win32" ? { useConpty: true } : {}),
            });
            sessionState.pty = ptyProcess;
            sessionState.process = null;
            ptyProcess.onData((text) => {
                appendTerminalSessionLog(sessionState, text);
                sendTerminalData(sessionState.sessionId, text);
            });
            ptyProcess.onExit((event) => {
                sessionState.pty = null;
                sendCodexMessageToCompatWindows({
                    type: "terminal-exit",
                    sessionId: sessionState.sessionId,
                    code: typeof event?.exitCode === "number" ? event.exitCode : 0,
                    signal: null,
                });
            });
            return;
        }
        catch (error) {
            sessionState.pty = null;
            appendCodexCompatLog(`terminal-spawn-pty-failed session=${sessionState.sessionId} error=${error instanceof Error ? error.message : String(error)}`);
            sendTerminalError(sessionState.sessionId, error instanceof Error ? error.message : String(error));
        }
    }
    if (sessionState.process && sessionState.process.exitCode == null && !sessionState.process.killed)
        return;
    const launch = getTerminalShellLaunch(sessionState.shell);
    try {
        appendCodexCompatLog(`terminal-spawn mode=fallback status=${nodePtyLoadStatus} session=${sessionState.sessionId} shell=${launch.command} cwd=${sessionState.cwd}`);
        const child = (0, node_child_process_1.spawn)(launch.command, launch.args, {
            cwd: sessionState.cwd,
            env: {
                ...node_process_1.default.env,
                TERM: node_process_1.default.env.TERM || "xterm-256color",
            },
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true,
        });
        sessionState.process = child;
        child.stdout?.on("data", (chunk) => {
            const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            appendTerminalSessionLog(sessionState, text);
            sendTerminalData(sessionState.sessionId, text);
        });
        child.stderr?.on("data", (chunk) => {
            const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
            appendTerminalSessionLog(sessionState, text);
            sendTerminalData(sessionState.sessionId, text);
        });
        child.on("error", (error) => {
            sessionState.process = null;
            sendTerminalError(sessionState.sessionId, error instanceof Error ? error.message : String(error));
        });
        child.on("exit", (code, signal) => {
            sessionState.process = null;
            sendCodexMessageToCompatWindows({
                type: "terminal-exit",
                sessionId: sessionState.sessionId,
                code: typeof code === "number" ? code : 0,
                signal: signal ?? null,
            });
        });
    }
    catch (error) {
        sessionState.process = null;
        sendTerminalError(sessionState.sessionId, error instanceof Error ? error.message : String(error));
    }
}
function ensureTerminalProcess(sessionState) {
    if (sessionState.pty)
        return;
    if (sessionState.process && sessionState.process.exitCode == null && !sessionState.process.killed)
        return;
    spawnTerminalProcess(sessionState);
}
function writeTerminalInput(sessionState, data) {
    if (typeof data !== "string" || !data.length)
        return;
    ensureTerminalProcess(sessionState);
    appendCodexCompatLog(`terminal-write session=${sessionState.sessionId} mode=${sessionState.pty ? "pty" : "fallback"} data=${summarizeTerminalInputForLog(data)}`);
    if (sessionState.pty) {
        sessionState.pty.write(data);
        return;
    }
    if (!sessionState.process?.stdin?.writable)
        return;
    sessionState.process.stdin.write(data);
}
function runTerminalCommand(sessionState, cwd, command) {
    const normalizedCommand = typeof command === "string" ? command.trim() : "";
    if (!normalizedCommand)
        return;
    const normalizedCwd = typeof cwd === "string" && cwd.trim() ? normalizeTerminalCwd(cwd) : sessionState.cwd;
    if (normalizedCwd !== sessionState.cwd) {
        sessionState.cwd = normalizedCwd;
    }
    let changeDirectoryCommand = "";
    if (node_process_1.default.platform === "win32") {
        const escapedCwd = sessionState.cwd.replace(/"/g, '""');
        changeDirectoryCommand = `cd /d "${escapedCwd}"\r\n`;
    }
    else {
        const escapedCwd = sessionState.cwd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        changeDirectoryCommand = `cd "${escapedCwd}"\n`;
    }
    const commandTerminator = node_process_1.default.platform === "win32" ? "\r\n" : "\n";
    writeTerminalInput(sessionState, `${changeDirectoryCommand}${normalizedCommand}${commandTerminator}`);
}
function closeTerminalSession(sessionState) {
    const ptyProcess = sessionState.pty;
    sessionState.pty = null;
    if (ptyProcess) {
        try {
            ptyProcess.kill();
        }
        catch {
            // Ignore PTY shutdown failures.
        }
    }
    const child = sessionState.process;
    sessionState.process = null;
    if (!child)
        return;
    try {
        child.kill();
    }
    catch {
        // Ignore terminal shutdown failures.
    }
}
function getOrCreateTerminalSession(message) {
    const requestedSessionId = typeof message.sessionId === "string" && message.sessionId.trim()
        ? message.sessionId.trim()
        : (0, node_crypto_1.randomUUID)();
    const existing = codexTerminalSessions.get(requestedSessionId);
    if (existing) {
        if (typeof message.cwd === "string" && message.cwd.trim()) {
            existing.cwd = normalizeTerminalCwd(message.cwd);
        }
        if (typeof message.shell === "string" && message.shell.trim()) {
            existing.shell = normalizeTerminalShell(message.shell);
        }
        if (Number.isFinite(Number(message.cols))) {
            existing.cols = Math.max(40, Math.floor(Number(message.cols)));
        }
        if (Number.isFinite(Number(message.rows))) {
            existing.rows = Math.max(12, Math.floor(Number(message.rows)));
        }
        return existing;
    }
    const created = {
        sessionId: requestedSessionId,
        cwd: normalizeTerminalCwd(message.cwd),
        shell: normalizeTerminalShell(message.shell),
        log: "",
        warnedUnavailable: false,
        pty: null,
        process: null,
        cols: Number.isFinite(Number(message.cols)) ? Math.max(40, Math.floor(Number(message.cols))) : 120,
        rows: Number.isFinite(Number(message.rows)) ? Math.max(12, Math.floor(Number(message.rows))) : 32,
    };
    codexTerminalSessions.set(requestedSessionId, created);
    return created;
}
function notifyTerminalAttached(sender, sessionState) {
    sendCodexMessageToWebContents(sender, {
        type: "terminal-attached",
        sessionId: sessionState.sessionId,
        cwd: sessionState.cwd,
        shell: sessionState.shell,
    });
    sendCodexMessageToWebContents(sender, {
        type: "terminal-init-log",
        sessionId: sessionState.sessionId,
        log: sessionState.log,
    });
}
function buildCompatMcpResult(method, params) {
    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const workspaceRoot = normalizeCompatPathForUi(readCompatActiveWorkspaceRoot()
        || normalizeCompatWorkspaceRoot(electron_1.app.getPath("home"))
        || normalizeCompatWorkspaceRoot(node_process_1.default.cwd())
        || node_process_1.default.cwd());
    switch (method) {
        case "account/read":
            return {
                authMode: "apikey",
                authMethod: "apikey",
                openAIAuth: {
                    mode: "apikey",
                    enabled: true,
                },
                requiresAuth: false,
                email: "local@binary-ide.invalid",
                planAtLogin: "pro",
                accountId: "local-account",
                userId: "local-user",
                isCopilotApiAvailable: true,
                activeApiKeySource: "local",
            };
        case "config/read":
            return {
                config: readCompatConfigState(),
                layers: [],
                version: String(codexCompatConfigVersion),
            };
        case "configRequirements/read":
            return {
                requirements: [],
            };
        case "model/list":
            return buildCompatListPayload([
                {
                    model: "gpt-5.4-mini",
                    hidden: false,
                    isDefault: true,
                    modelProvider: "openai",
                    displayName: "GPT-5.4 Mini",
                    supportedReasoningEfforts: [
                        { reasoningEffort: "medium", description: "medium effort" },
                        { reasoningEffort: "high", description: "high effort" },
                    ],
                },
            ]);
        case "thread/list":
            return buildCompatListPayload(listCompatThreads().map((thread) => ({
                id: thread.id,
                name: thread.name,
                preview: thread.preview,
                cwd: thread.cwd,
                createdAt: thread.createdAt,
                updatedAt: thread.updatedAt,
                source: thread.source,
                archived: thread.archived,
                path: thread.path,
                collaborationMode: thread.collaborationMode,
            })));
        case "thread/start": {
            const thread = ensureCompatThread({
                cwd: typeof params.cwd === "string" && params.cwd.trim() ? params.cwd.trim() : workspaceRoot,
                model: typeof params.model === "string" && params.model.trim() ? params.model.trim() : "gpt-5.4-mini",
                reasoningEffort: typeof params.reasoningEffort === "string" && params.reasoningEffort.trim()
                    ? params.reasoningEffort.trim()
                    : null,
                collaborationMode: params.collaborationMode,
            });
            return {
                thread: {
                    id: thread.id,
                    name: thread.name,
                    preview: thread.preview,
                    cwd: thread.cwd,
                    createdAt: thread.createdAt,
                    updatedAt: thread.updatedAt,
                    source: thread.source,
                    archived: thread.archived,
                    path: thread.path,
                    collaborationMode: thread.collaborationMode,
                },
                cwd: thread.cwd,
                model: thread.model,
                reasoningEffort: thread.reasoningEffort,
                collaborationMode: thread.collaborationMode,
            };
        }
        case "fuzzyFileSearch":
            return {
                files: runCompatFuzzyFileSearch(params.roots, typeof params.query === "string" ? params.query : ""),
            };
        case "fuzzyFileSearch/sessionStart": {
            const sessionId = typeof params.sessionId === "string" && params.sessionId.trim()
                ? params.sessionId.trim()
                : (0, node_crypto_1.randomUUID)();
            const roots = resolveCompatFuzzySearchRoots().roots;
            codexCompatFuzzyFileSearchSessions.set(sessionId, {
                sessionId,
                roots,
                query: "",
            });
            return {
                sessionId,
                ok: true,
            };
        }
        case "fuzzyFileSearch/sessionUpdate": {
            const sessionId = typeof params.sessionId === "string" && params.sessionId.trim() ? params.sessionId.trim() : "";
            let session = sessionId ? codexCompatFuzzyFileSearchSessions.get(sessionId) : null;
            if (!session) {
                const resolvedSearch = resolveCompatFuzzySearchRoots();
                session = {
                    sessionId,
                    roots: resolvedSearch.roots,
                    query: "",
                };
                if (sessionId) {
                    codexCompatFuzzyFileSearchSessions.set(sessionId, session);
                }
            }
            session.roots = resolveCompatFuzzySearchRoots().roots;
            session.query = typeof params.query === "string" ? params.query : "";
            return {
                sessionId,
                ok: true,
            };
        }
        case "fuzzyFileSearch/sessionStop": {
            const sessionId = typeof params.sessionId === "string" && params.sessionId.trim() ? params.sessionId.trim() : "";
            if (sessionId) {
                codexCompatFuzzyFileSearchSessions.delete(sessionId);
            }
            return {
                sessionId,
                ok: true,
            };
        }
        case "turn/start":
            return {
                turn: {
                    id: `local-turn-${(0, node_crypto_1.randomUUID)()}`,
                    status: "inProgress",
                    error: null,
                },
            };
        case "mcpServerStatus/list":
            return buildCompatListPayload([]);
        case "skills/list":
            return buildCompatListPayload([
                {
                    cwd: workspaceRoot,
                    skills: [],
                },
            ]);
        case "experimentalFeature/list":
            return buildCompatListPayload([]);
        case "collaborationMode/list":
            return buildCompatListPayload(listCompatCollaborationModes(), false);
        case "experimentalFeature/enablement/set":
            return {
                ok: true,
            };
        case "config/value/write":
            applyCompatConfigWrite(params);
            return {
                ok: true,
                version: String(codexCompatConfigVersion),
            };
        case "config/batchWrite":
            applyCompatConfigBatchWrite(params);
            return {
                ok: true,
                version: String(codexCompatConfigVersion),
            };
        case "windowsSandbox/setupStart":
            return {
                started: true,
                mode: typeof params.mode === "string" ? params.mode : "unelevated",
            };
        default:
            if (method.endsWith("/list")) {
                return buildCompatListPayload([]);
            }
            if (method.endsWith("/read")) {
                return {};
            }
            if (method.endsWith("/set") || method.endsWith("/write") || method.endsWith("/create") || method.endsWith("/update")) {
                return { ok: true };
            }
            return {
                ok: true,
                unsupported: true,
                method,
                params,
            };
    }
}
async function handleCodexIpcRequest(rawBody, sender) {
    const parsed = safeJsonParse(rawBody, {});
    const method = typeof parsed.method === "string" ? parsed.method : "";
    const params = parsed.params;
    const requestId = typeof parsed.requestId === "string" ? parsed.requestId : (0, node_crypto_1.randomUUID)();
    switch (method) {
        case "open-in-browser": {
            const maybeParams = params && typeof params === "object" ? params : {};
            const url = typeof maybeParams.url === "string" ? maybeParams.url : "";
            if (isAllowedExternalUrl(url)) {
                await electron_1.shell.openExternal(url);
                return codexResponseSuccess(requestId, { ok: true });
            }
            return codexResponseError(requestId, "Invalid URL");
        }
        case "persisted-atom-sync-request": {
            sendCodexMessageToWebContents(sender, { type: "persisted-atom-sync", state: codexPersistedAtomState });
            return codexResponseSuccess(requestId, { ok: true });
        }
        default:
            if (method && !seenUnsupportedCodexIpcMethods.has(method)) {
                seenUnsupportedCodexIpcMethods.add(method);
                appendCodexCompatLog(`unsupported-ipc-request method=${method}`);
                const logPath = node_path_1.default.join(uiDebugDir(), "codex-compat-unsupported-ipc.log");
                void node_fs_1.promises.mkdir(uiDebugDir(), { recursive: true }).then(() => {
                    return node_fs_1.promises.appendFile(logPath, `${nowIso()} ${method}\n`, "utf8");
                }).catch(() => {
                    // Ignore debug logging failures.
                });
            }
            return codexResponseSuccess(requestId, null);
    }
}
async function handleCodexFetch(sender, message) {
    const requestId = String(message.requestId ?? (0, node_crypto_1.randomUUID)());
    const method = String(message.method || "GET").toUpperCase();
    const url = resolveCodexRequestUrl(message.url);
    if (!url) {
        sendCodexMessageToWebContents(sender, {
            type: "fetch-response",
            requestId,
            responseType: "error",
            status: 0,
            error: "Missing request URL",
        });
        return;
    }
    const abortController = new AbortController();
    codexFetchAbortControllers.set(requestId, abortController);
    try {
        const vscodeEndpoint = parseCodexVscodeEndpoint(url);
        if (vscodeEndpoint) {
            const parsedParams = sanitizeCompatRequestParams(parseCodexFetchBodyParams(message.body));
            const responsePayload = vscodeEndpoint === "ipc-request"
                ? await handleCodexIpcRequest(String(message.body || "{}"), sender)
                : buildCompatVscodeFetchResult(vscodeEndpoint, parsedParams);
            appendCodexCompatLog(`vscode-fetch endpoint=${vscodeEndpoint} params=${summarizeForCompatLog(parsedParams, 500)} response=${summarizeForCompatLog(responsePayload, 500)}`);
            sendCodexMessageToWebContents(sender, {
                type: "fetch-response",
                requestId,
                responseType: "success",
                status: 200,
                headers: { "content-type": "application/json" },
                bodyJsonString: JSON.stringify(responsePayload),
            });
            const successKey = `${method} ${url} -> 200`;
            if (!seenCompatFetchSuccesses.has(successKey)) {
                seenCompatFetchSuccesses.add(successKey);
                appendCodexCompatLog(`fetch-success ${successKey}`);
            }
            return;
        }
        const response = await fetch(url, {
            method,
            headers: normalizeHeaders(message.headers),
            body: typeof message.body === "string" ? message.body : undefined,
            signal: abortController.signal,
        });
        const responseText = await response.text();
        const bodyJsonString = (() => {
            try {
                JSON.parse(responseText);
                return responseText;
            }
            catch {
                return JSON.stringify({ body: responseText });
            }
        })();
        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });
        sendCodexMessageToWebContents(sender, {
            type: "fetch-response",
            requestId,
            responseType: "success",
            status: response.status,
            headers: responseHeaders,
            bodyJsonString,
        });
        const successKey = `${method} ${url} -> ${response.status}`;
        if (!seenCompatFetchSuccesses.has(successKey)) {
            seenCompatFetchSuccesses.add(successKey);
            appendCodexCompatLog(`fetch-success ${successKey}`);
        }
    }
    catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        const failureKey = `${method} ${url} -> ${errorText}`;
        if (!seenCompatFetchFailures.has(failureKey)) {
            seenCompatFetchFailures.add(failureKey);
            appendCodexCompatLog(`fetch-error ${failureKey}`);
        }
        sendCodexMessageToWebContents(sender, {
            type: "fetch-response",
            requestId,
            responseType: "error",
            status: 0,
            error: errorText,
        });
    }
    finally {
        codexFetchAbortControllers.delete(requestId);
    }
}
function parseSseDataChunks(chunk) {
    const events = [];
    const parts = chunk.split(/\r?\n\r?\n/g);
    for (const part of parts) {
        if (!part.trim())
            continue;
        const lines = part.split(/\r?\n/);
        const payloadLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
        if (payloadLines.length > 0) {
            events.push(payloadLines.join("\n"));
        }
    }
    return events;
}
async function handleCodexFetchStream(sender, message) {
    const requestId = String(message.requestId ?? (0, node_crypto_1.randomUUID)());
    const method = String(message.method || "GET").toUpperCase();
    const url = resolveCodexRequestUrl(message.url);
    if (!url || url.startsWith("vscode://")) {
        sendCodexMessageToWebContents(sender, {
            type: "fetch-stream-error",
            requestId,
            error: "Streaming URL is not supported",
        });
        sendCodexMessageToWebContents(sender, { type: "fetch-stream-complete", requestId });
        return;
    }
    const abortController = new AbortController();
    codexFetchStreamAbortControllers.set(requestId, abortController);
    try {
        const response = await fetch(url, {
            method,
            headers: normalizeHeaders(message.headers),
            body: typeof message.body === "string" ? message.body : undefined,
            signal: abortController.signal,
        });
        if (!response.body) {
            sendCodexMessageToWebContents(sender, { type: "fetch-stream-complete", requestId });
            return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            buffer += decoder.decode(next.value, { stream: true });
            const chunks = parseSseDataChunks(buffer);
            if (chunks.length === 0)
                continue;
            buffer = "";
            for (const eventChunk of chunks) {
                const data = safeJsonParse(eventChunk, eventChunk);
                sendCodexMessageToWebContents(sender, {
                    type: "fetch-stream-event",
                    requestId,
                    data,
                });
            }
        }
        sendCodexMessageToWebContents(sender, { type: "fetch-stream-complete", requestId });
    }
    catch (error) {
        sendCodexMessageToWebContents(sender, {
            type: "fetch-stream-error",
            requestId,
            error: error instanceof Error ? error.message : String(error),
        });
        sendCodexMessageToWebContents(sender, { type: "fetch-stream-complete", requestId });
    }
    finally {
        codexFetchStreamAbortControllers.delete(requestId);
    }
}
function getCodexWorkerChannel(workerId) {
    return `${CODEX_IPC.workerForViewPrefix}:${workerId}`;
}
async function handleCodexMessageFromView(sender, payload) {
    const message = payload && typeof payload === "object" ? payload : {};
    const type = typeof message.type === "string" ? message.type : "";
    if (type === "fetch") {
        const method = typeof message.method === "string" ? message.method : "";
        const url = typeof message.url === "string" ? message.url : "";
        const requestId = typeof message.requestId === "string" || typeof message.requestId === "number"
            ? String(message.requestId)
            : "";
        appendCodexCompatLog(`message-from-view type=fetch method=${method || "?"} requestId=${requestId || "?"} url=${url || "<missing>"}`);
    }
    else if (type) {
        appendCodexCompatLog(`message-from-view type=${type}`);
    }
    switch (type) {
        case "ready":
            codexCompatReady = true;
            compatStartupRetryCount = 0;
            compatFatalErrorShown = false;
            clearCompatWatchdog();
            sendCodexMessageToWebContents(sender, { type: "persisted-atom-sync", state: codexPersistedAtomState });
            sendCodexMessageToWebContents(sender, { type: "app-update-ready-changed", isUpdateReady: false });
            sendCodexMessageToWebContents(sender, { type: "electron-window-focus-changed", isFocused: Boolean(mainWindow?.isFocused()) });
            return { ok: true };
        case "log-message": {
            appendCodexCompatLog(`renderer-log payload=${summarizeForCompatLog(message, 1000)}`);
            try {
                const maybeTags = message.tags && typeof message.tags === "object" ? message.tags : null;
                const maybeSensitive = maybeTags && maybeTags.sensitive && typeof maybeTags.sensitive === "object"
                    ? maybeTags.sensitive
                    : null;
                const maybeError = maybeSensitive && maybeSensitive.error && typeof maybeSensitive.error === "object"
                    ? maybeSensitive.error
                    : null;
                if (maybeError) {
                    const ownKeys = Object.getOwnPropertyNames(maybeError);
                    const maybeStack = typeof maybeError.stack === "string" ? maybeError.stack : "";
                    const maybeName = typeof maybeError.name === "string" ? maybeError.name : "";
                    const maybeMessage = typeof maybeError.message === "string" ? maybeError.message : "";
                    appendCodexCompatLog(`renderer-log-error-details keys=${ownKeys.join(",")} name=${maybeName} message=${maybeMessage} stack=${summarizeForCompatLog(maybeStack, 1200)}`);
                }
            }
            catch {
                // Ignore compat debug extraction failures.
            }
            return { ok: true };
        }
        case "fetch":
            await handleCodexFetch(sender, message);
            return { ok: true };
        case "cancel-fetch": {
            const requestId = String(message.requestId ?? "");
            const pending = codexFetchAbortControllers.get(requestId);
            if (pending)
                pending.abort();
            codexFetchAbortControllers.delete(requestId);
            return { ok: true };
        }
        case "fetch-stream":
            void handleCodexFetchStream(sender, message);
            return { ok: true };
        case "cancel-fetch-stream": {
            const requestId = String(message.requestId ?? "");
            const pending = codexFetchStreamAbortControllers.get(requestId);
            if (pending)
                pending.abort();
            codexFetchStreamAbortControllers.delete(requestId);
            return { ok: true };
        }
        case "open-in-browser": {
            const url = typeof message.url === "string" ? message.url : "";
            if (isAllowedExternalUrl(url)) {
                await electron_1.shell.openExternal(url);
            }
            return { ok: true };
        }
        case "open-in-main-window":
            focusMainWindow(runSurfaceState.activeRunId || null);
            return { ok: true };
        case "electron-onboarding-pick-workspace-or-create-default":
            await sendCompatOnboardingWorkspaceResult(sender, message);
            return { ok: true };
        case "electron-onboarding-skip-workspace":
            await sendCompatOnboardingWorkspaceResult(sender, message);
            sendCodexMessageToWebContents(sender, {
                type: "electron-onboarding-skip-workspace-result",
                success: true,
                root: codexCompatWorkspaceRoot,
            });
            return { ok: true };
        case "electron-add-new-workspace-root-option":
            return await addCompatWorkspaceRootOption(typeof message.root === "string" ? message.root : null, sender);
        case "electron-set-active-workspace-root": {
            const selectedRoot = normalizeCompatWorkspaceRoot(typeof message.root === "string" ? message.root : null);
            if (selectedRoot) {
                ensureCompatWorkspaceRootOption(selectedRoot, selectedRoot);
            }
            const nextState = setCompatWorkspaceRoots(readCompatWorkspaceRootOptions(), selectedRoot || undefined);
            notifyCompatWorkspaceRootsUpdated(sender, !selectedRoot || nextState.activeRoot === selectedRoot);
            const uiRoots = readCompatWorkspaceRootOptionsForUi();
            return {
                ok: Boolean(selectedRoot) && nextState.activeRoot === selectedRoot,
                root: nextState.activeRoot ? nextState.activeRoot.replace(/\\/g, "/") : null,
                roots: uiRoots.map((root) => root.replace(/\\/g, "/")),
            };
        }
        case "electron-update-workspace-root-options": {
            const nextRoots = Array.isArray(message.roots) ? message.roots : [];
            const nextState = setCompatWorkspaceRoots(nextRoots, codexCompatWorkspaceRoot || undefined);
            notifyCompatWorkspaceRootsUpdated(sender);
            const uiRoots = readCompatWorkspaceRootOptionsForUi();
            return {
                ok: true,
                root: nextState.activeRoot ? nextState.activeRoot.replace(/\\/g, "/") : null,
                roots: uiRoots.map((root) => root.replace(/\\/g, "/")),
                labels: compatWorkspaceRootLabels(uiRoots),
            };
        }
        case "codex-app-server-restart":
            appendCodexCompatLog("codex-app-server-restart requested");
            restartBinaryHost();
            if (mainWindow && !mainWindow.isDestroyed()) {
                void loadWindowSurface(mainWindow, "main");
            }
            return { ok: true };
        case "view-focused":
            sendCodexMessageToWebContents(sender, {
                type: "electron-window-focus-changed",
                isFocused: Boolean(mainWindow?.isFocused()),
            });
            return { ok: true };
        case "electron-window-focus-request":
            sendCodexMessageToWebContents(sender, {
                type: "electron-window-focus-changed",
                isFocused: Boolean(mainWindow?.isFocused()),
            });
            return { ok: true };
        case "persisted-atom-sync-request":
            sendCodexMessageToWebContents(sender, { type: "persisted-atom-sync", state: codexPersistedAtomState });
            return { ok: true };
        case "persisted-atom-update": {
            const key = typeof message.key === "string" ? message.key : "";
            const deleted = Boolean(message.deleted);
            if (key) {
                if (deleted) {
                    delete codexPersistedAtomState[key];
                }
                else {
                    codexPersistedAtomState[key] = Object.prototype.hasOwnProperty.call(message, "value") ? message.value : null;
                }
            }
            else if (Array.isArray(message.updates)) {
                for (const update of message.updates) {
                    if (!update || typeof update !== "object")
                        continue;
                    const item = update;
                    const itemKey = typeof item.key === "string" ? item.key : "";
                    if (!itemKey)
                        continue;
                    if (Boolean(item.deleted)) {
                        delete codexPersistedAtomState[itemKey];
                    }
                    else {
                        codexPersistedAtomState[itemKey] = Object.prototype.hasOwnProperty.call(item, "value") ? item.value : null;
                    }
                }
            }
            return { ok: true };
        }
        case "shared-object-subscribe": {
            const key = typeof message.key === "string" ? message.key : "";
            if (!key)
                return { ok: true };
            const sharedValue = readCompatSharedObjectValue(key);
            appendCodexCompatLog(`shared-object-subscribe key=${key} hasValue=${sharedValue !== undefined}`);
            sendCodexMessageToWebContents(sender, {
                type: "shared-object-updated",
                key,
                value: sharedValue,
            });
            return { ok: true };
        }
        case "shared-object-set": {
            const key = typeof message.key === "string" ? message.key : "";
            if (!key)
                return { ok: true };
            if (Object.prototype.hasOwnProperty.call(message, "value")) {
                const forcedValue = key === "statsig_default_enable_features" ? false : message.value;
                codexSharedObjectState.set(key, forcedValue);
            }
            else {
                codexSharedObjectState.delete(key);
            }
            appendCodexCompatLog(`shared-object-set key=${key} hasValue=${Object.prototype.hasOwnProperty.call(message, "value")}`);
            sendCodexMessageToCompatWindows({
                type: "shared-object-updated",
                key,
                value: readCompatSharedObjectValue(key),
            });
            return { ok: true };
        }
        case "shared-object-unsubscribe":
            return { ok: true };
        case "mcp-request": {
            const requestPayload = message.request && typeof message.request === "object"
                ? message.request
                : {};
            const hostId = typeof message.hostId === "string" ? message.hostId : undefined;
            const requestId = typeof requestPayload.id === "string" && requestPayload.id.trim()
                ? requestPayload.id
                : (0, node_crypto_1.randomUUID)();
            const method = typeof requestPayload.method === "string" ? requestPayload.method : "unknown";
            const params = sanitizeCompatRequestParams(requestPayload.params && typeof requestPayload.params === "object"
                ? requestPayload.params
                : {});
            appendCodexCompatLog(`mcp-request method=${method} hostId=${hostId ?? "default"} id=${requestId}`);
            const responsePayload = {
                id: requestId,
                result: buildCompatMcpResult(method, params),
            };
            sendCodexMessageToWebContents(sender, {
                type: "mcp-response",
                hostId,
                response: responsePayload,
                message: responsePayload,
            });
            if (method === "windowsSandbox/setupStart") {
                const sandboxMode = typeof params.mode === "string" && params.mode.trim() ? params.mode.trim() : "unelevated";
                sendCodexMessageToWebContents(sender, {
                    type: "mcp-notification",
                    hostId,
                    method: "windowsSandbox/setupCompleted",
                    params: {
                        mode: sandboxMode,
                        success: true,
                    },
                });
                appendCodexCompatLog(`mcp-notification method=windowsSandbox/setupCompleted hostId=${hostId ?? "default"} mode=${sandboxMode} success=true`);
            }
            if (method === "fuzzyFileSearch/sessionUpdate") {
                const sessionId = typeof params.sessionId === "string" && params.sessionId.trim() ? params.sessionId.trim() : "";
                const session = sessionId ? codexCompatFuzzyFileSearchSessions.get(sessionId) : null;
                const files = session ? runCompatFuzzyFileSearch(session.roots, session.query) : [];
                sendCodexMessageToWebContents(sender, {
                    type: "mcp-notification",
                    hostId,
                    method: "fuzzyFileSearch/sessionUpdated",
                    params: {
                        sessionId,
                        query: session?.query ?? "",
                        files,
                    },
                });
                sendCodexMessageToWebContents(sender, {
                    type: "mcp-notification",
                    hostId,
                    method: "fuzzyFileSearch/sessionCompleted",
                    params: {
                        sessionId,
                    },
                });
                appendCodexCompatLog(`mcp-notification method=fuzzyFileSearch/sessionUpdated hostId=${hostId ?? "default"} payload=${summarizeForCompatLog({ sessionId, files: files.slice(0, 10) }, 420)}`);
                appendCodexCompatLog(`mcp-notification method=fuzzyFileSearch/sessionCompleted hostId=${hostId ?? "default"} payload=${summarizeForCompatLog({ sessionId }, 220)}`);
            }
            if (method === "turn/start") {
                const result = responsePayload.result && typeof responsePayload.result === "object" && !Array.isArray(responsePayload.result)
                    ? responsePayload.result
                    : {};
                const turn = result.turn && typeof result.turn === "object" && !Array.isArray(result.turn)
                    ? result.turn
                    : {};
                const turnId = typeof turn.id === "string" ? turn.id : `local-turn-${(0, node_crypto_1.randomUUID)()}`;
                const threadId = typeof params.threadId === "string" && params.threadId.trim() ? params.threadId.trim() : `local-thread-${(0, node_crypto_1.randomUUID)()}`;
                const userItemId = `local-user-item-${(0, node_crypto_1.randomUUID)()}`;
                const assistantItemId = `local-assistant-item-${(0, node_crypto_1.randomUUID)()}`;
                const userContent = readCompatTurnInputItems(params);
                const prompt = extractCompatTurnText(params);
                const existingThread = codexCompatThreads.get(threadId) || null;
                const resolvedTurnPrompt = resolveCompatTurnPrompt(prompt, params.collaborationMode, existingThread?.collaborationMode || null);
                const imageInputs = extractCompatTurnImageInputs(params);
                const effectiveCollaborationMode = resolvedTurnPrompt.collaborationMode;
                const initialThread = ensureCompatThread({
                    id: threadId,
                    cwd: typeof params.cwd === "string" && params.cwd.trim() ? params.cwd.trim() : undefined,
                    model: typeof params.model === "string" && params.model.trim() ? params.model.trim() : null,
                    reasoningEffort: typeof params.reasoningEffort === "string" && params.reasoningEffort.trim()
                        ? params.reasoningEffort.trim()
                        : null,
                    collaborationMode: effectiveCollaborationMode,
                });
                const sendCompatNotification = (notificationMethod, notificationParams) => {
                    sendCodexMessageToWebContents(sender, {
                        type: "mcp-notification",
                        hostId,
                        method: notificationMethod,
                        params: notificationParams,
                    });
                    appendCodexCompatLog(`mcp-notification method=${notificationMethod} hostId=${hostId ?? "default"} payload=${summarizeForCompatLog(notificationParams, 420)}`);
                };
                sendCompatNotification("turn/started", {
                    threadId,
                    turn: {
                        id: turnId,
                        status: "inProgress",
                        error: null,
                    },
                });
                sendCompatNotification("item/completed", {
                    threadId,
                    turnId,
                    item: {
                        id: userItemId,
                        type: "userMessage",
                        content: userContent,
                        attachments: Array.isArray(params.attachments) ? cloneCompatJson(params.attachments) : [],
                    },
                });
                sendCompatNotification("item/started", {
                    threadId,
                    turnId,
                    item: {
                        id: assistantItemId,
                        type: "agentMessage",
                        text: "",
                        phase: null,
                    },
                });
                void (async () => {
                    let assistantText = "";
                    let finalizedThread = initialThread;
                    const normalizedPrompt = resolvedTurnPrompt.prompt.trim();
                    const progressLines = [];
                    const pushProgressLine = (message) => {
                        const normalized = message.trim();
                        if (!normalized)
                            return;
                        progressLines.push(normalized);
                        sendCompatNotification("item/agentMessage/delta", {
                            threadId: initialThread.id,
                            turnId,
                            itemId: assistantItemId,
                            delta: `${progressLines.length === 1 ? "" : "\n"}${normalized}`,
                        });
                    };
                    try {
                        const hasAssistPayload = Boolean(normalizedPrompt) || imageInputs.length > 0;
                        let hostResult = hasAssistPayload
                            ? await runCompatHostAssist(initialThread, normalizedPrompt || "Please analyze the attached image and help with the request.", {
                                onProgress: pushProgressLine,
                                collaborationMode: effectiveCollaborationMode,
                                imageInputs,
                            })
                            : { text: "Please enter a message before sending.", runId: null, conversationId: null, userInputRequest: null };
                        let activeRunId = hostResult.runId;
                        let activeConversationId = hostResult.conversationId || initialThread.historySessionId;
                        while (hostResult.userInputRequest && activeRunId) {
                            const userInputResponse = await requestCompatMcpFromWebContents(sender, hostId, "item/tool/requestUserInput", {
                                itemId: assistantItemId,
                                turnId,
                                questions: cloneCompatJson(hostResult.userInputRequest.questions),
                            });
                            const normalizedAnswers = normalizeCompatUserInputAnswers(userInputResponse);
                            if (Object.keys(normalizedAnswers).length === 0) {
                                throw new Error("I still need at least one planning answer to continue.");
                            }
                            sendCompatNotification("item/completed", {
                                threadId: initialThread.id,
                                turnId,
                                item: {
                                    id: `local-user-input-response-${(0, node_crypto_1.randomUUID)()}`,
                                    type: "userInputResponse",
                                    requestId: hostResult.userInputRequest.requestId,
                                    turnId,
                                    questions: cloneCompatJson(hostResult.userInputRequest.questions),
                                    answers: cloneCompatJson(normalizedAnswers),
                                    completed: true,
                                },
                            });
                            hostResult = await continueCompatHostAssistWithUserInput(activeRunId, hostResult.userInputRequest.requestId, normalizedAnswers, {
                                onProgress: pushProgressLine,
                            });
                            activeRunId = hostResult.runId || activeRunId;
                            activeConversationId = hostResult.conversationId || activeConversationId;
                        }
                        assistantText = humanizeCompatHostMessage(hostResult.text).trim() || compatEmptyFinalFallback();
                        finalizedThread = upsertCompatThread({
                            ...initialThread,
                            name: initialThread.name === "New thread" && normalizedPrompt ? buildCompatThreadPreview(normalizedPrompt, 48) : initialThread.name,
                            preview: buildCompatThreadPreview(assistantText),
                            updatedAt: Math.floor(Date.now() / 1000),
                            historySessionId: activeConversationId || initialThread.historySessionId,
                            lastRunId: activeRunId,
                            conversationId: activeConversationId || initialThread.conversationId,
                        });
                    }
                    catch (error) {
                        const errorText = error instanceof Error ? error.message : String(error);
                        assistantText = humanizeCompatHostMessage(errorText) || "Binary couldn't complete this turn.";
                        finalizedThread = upsertCompatThread({
                            ...initialThread,
                            preview: buildCompatThreadPreview(assistantText),
                            updatedAt: Math.floor(Date.now() / 1000),
                        });
                        appendCodexCompatLog(`host-assist-error threadId=${threadId} turnId=${turnId} error=${errorText}`);
                    }
                    sendCompatNotification("item/completed", {
                        threadId: finalizedThread.id,
                        turnId,
                        item: {
                            id: assistantItemId,
                            type: "agentMessage",
                            text: assistantText,
                            phase: null,
                        },
                    });
                    sendCompatNotification("turn/completed", {
                        threadId: finalizedThread.id,
                        turn: {
                            id: turnId,
                            status: "completed",
                            error: null,
                        },
                    });
                })();
            }
            appendCodexCompatLog(`mcp-response method=${method} hostId=${hostId ?? "default"} id=${requestId} payload=${summarizeForCompatLog(responsePayload, 420)}`);
            return { ok: true };
        }
        case "mcp-response": {
            const responsePayload = message.response && typeof message.response === "object"
                ? message.response
                : {};
            const responseId = typeof responsePayload.id === "string" && responsePayload.id.trim()
                ? responsePayload.id.trim()
                : "";
            if (responseId) {
                const pending = codexCompatPendingMcpRequests.get(responseId);
                if (pending) {
                    clearTimeout(pending.timeoutHandle);
                    codexCompatPendingMcpRequests.delete(responseId);
                    pending.resolve(responsePayload.result);
                    appendCodexCompatLog(`mcp-response<-view id=${responseId} payload=${summarizeForCompatLog(responsePayload.result, 420)}`);
                }
            }
            return { ok: true };
        }
        case "terminal-create": {
            const sessionState = getOrCreateTerminalSession(message);
            ensureTerminalProcess(sessionState);
            notifyTerminalAttached(sender, sessionState);
            return { ok: true };
        }
        case "terminal-attach": {
            const sessionState = getOrCreateTerminalSession(message);
            if (Number.isFinite(Number(message.cols))) {
                sessionState.cols = Math.max(40, Math.floor(Number(message.cols)));
            }
            if (Number.isFinite(Number(message.rows))) {
                sessionState.rows = Math.max(12, Math.floor(Number(message.rows)));
            }
            ensureTerminalProcess(sessionState);
            notifyTerminalAttached(sender, sessionState);
            return { ok: true };
        }
        case "terminal-write": {
            const sessionState = getOrCreateTerminalSession(message);
            const data = typeof message.data === "string" ? message.data : typeof message.input === "string" ? message.input : "";
            if (data) {
                if (!sessionState.pty && node_process_1.default.platform === "win32") {
                    sendTerminalData(sessionState.sessionId, data);
                }
                writeTerminalInput(sessionState, data);
            }
            return { ok: true };
        }
        case "terminal-run-action": {
            const sessionState = getOrCreateTerminalSession(message);
            runTerminalCommand(sessionState, typeof message.cwd === "string" ? message.cwd : undefined, typeof message.command === "string" ? message.command : undefined);
            return { ok: true };
        }
        case "terminal-resize": {
            const sessionState = getOrCreateTerminalSession(message);
            const cols = Number.isFinite(Number(message.cols)) ? Math.max(40, Math.floor(Number(message.cols))) : sessionState.cols;
            const rows = Number.isFinite(Number(message.rows)) ? Math.max(12, Math.floor(Number(message.rows))) : sessionState.rows;
            sessionState.cols = cols;
            sessionState.rows = rows;
            ensureTerminalProcess(sessionState);
            if (sessionState.pty) {
                try {
                    sessionState.pty.resize(cols, rows);
                }
                catch {
                    // Ignore resize failures and keep the session alive.
                }
            }
            return { ok: true };
        }
        case "terminal-close": {
            const sessionState = getOrCreateTerminalSession(message);
            closeTerminalSession(sessionState);
            codexTerminalSessions.delete(sessionState.sessionId);
            sendCodexMessageToWebContents(sender, {
                type: "terminal-exit",
                sessionId: sessionState.sessionId,
                code: 0,
                signal: null,
            });
            return { ok: true };
        }
        case "power-save-blocker-set": {
            const enable = Boolean(message.enabled);
            if (enable) {
                if (powerSaveBlockerId == null || !electron_1.powerSaveBlocker.isStarted(powerSaveBlockerId)) {
                    powerSaveBlockerId = electron_1.powerSaveBlocker.start("prevent-app-suspension");
                }
            }
            else if (powerSaveBlockerId != null) {
                if (electron_1.powerSaveBlocker.isStarted(powerSaveBlockerId)) {
                    electron_1.powerSaveBlocker.stop(powerSaveBlockerId);
                }
                powerSaveBlockerId = null;
            }
            return { ok: true };
        }
        case "electron-set-badge-count": {
            const count = Number(message.count ?? 0);
            if (Number.isFinite(count)) {
                electron_1.app.setBadgeCount(Math.max(0, Math.trunc(count)));
            }
            return { ok: true };
        }
        case "electron-set-window-mode": {
            const mode = typeof message.mode === "string" && message.mode.trim()
                ? message.mode.trim()
                : "unknown";
            codexCompatWindowMode = mode;
            appendCodexCompatLog(`electron-set-window-mode mode=${mode} payload=${summarizeForCompatLog(message, 420)}`);
            sendCodexMessageToWebContents(sender, {
                type: "electron-window-mode-changed",
                mode,
            });
            return { ok: true, mode: codexCompatWindowMode };
        }
        case "show-settings":
        case "open-keyboard-shortcuts":
        case "open-extension-settings":
        case "open-thread-overlay":
        case "thread-overlay-set-always-on-top":
        case "desktop-notification-show":
        case "desktop-notification-hide":
        case "set-telemetry-user":
        case "electron-request-microphone-permission":
        case "open-in-hotkey-window":
        case "hotkey-window-dismiss":
        case "hotkey-window-enabled-changed":
        case "hotkey-window-home-pointer-interaction-changed":
        case "hotkey-window-transition-done":
        case "heartbeat-automations-enabled-changed":
        case "electron-desktop-features-changed":
        case "heartbeat-automation-thread-state-changed":
            return { ok: true };
        default:
            if (type && !seenUnsupportedCodexMessageTypes.has(type)) {
                seenUnsupportedCodexMessageTypes.add(type);
                appendCodexCompatLog(`unsupported-message-from-view type=${type}`);
                const logPath = node_path_1.default.join(uiDebugDir(), "codex-compat-unsupported-messages.log");
                void node_fs_1.promises.mkdir(uiDebugDir(), { recursive: true }).then(() => {
                    return node_fs_1.promises.appendFile(logPath, `${nowIso()} ${type}\n`, "utf8");
                }).catch(() => {
                    // Ignore debug logging failures.
                });
            }
            return { ok: true };
    }
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
function defaultMainWindowBounds() {
    const workArea = electron_1.screen.getPrimaryDisplay().workArea;
    const maxW = Math.max(MAIN_WINDOW_MIN.width, workArea.width - MAIN_WINDOW_WORK_MARGIN * 2);
    const maxH = Math.max(MAIN_WINDOW_MIN.height, workArea.height - MAIN_WINDOW_WORK_MARGIN * 2);
    let width = MAIN_WINDOW_IDEAL.width;
    let height = MAIN_WINDOW_IDEAL.height;
    const scale = Math.min(1, maxW / width, maxH / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const x = workArea.x + Math.round((workArea.width - width) / 2);
    const y = workArea.y + Math.round((workArea.height - height) / 2);
    return { x, y, width, height };
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
    const bounds = defaultMainWindowBounds();
    codexCompatReady = false;
    compatStartupRetryCount = 0;
    compatFatalErrorShown = false;
    mainWindow = new electron_1.BrowserWindow({
        ...bounds,
        minWidth: MAIN_WINDOW_MIN.width,
        minHeight: MAIN_WINDOW_MIN.height,
        backgroundColor: desktopAppearance.theme === "dark" ? "#1b1b1b" : "#f8f9ff",
        title: "Binary IDE",
        autoHideMenuBar: true,
        titleBarStyle: node_process_1.default.platform === "darwin" ? "hiddenInset" : "hidden",
        titleBarOverlay: node_process_1.default.platform === "win32"
            ? {
                color: "#111111",
                symbolColor: "#f5f5f5",
                height: 30,
            }
            : false,
        webPreferences: {
            preload: node_path_1.default.join(packageRoot, "dist", "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    if (activeUiRuntime === "codex_compat") {
        mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    }
    else {
        configureWindowSecurity(mainWindow);
    }
    mainWindow.removeMenu();
    mainWindow.setMenuBarVisibility(false);
    if (activeUiRuntime === "codex_compat") {
        appendCodexCompatLog("create-main-window codex_compat");
    }
    mainWindow.webContents.on("did-finish-load", () => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog("did-finish-load");
        }
        if (activeUiRuntime !== "codex_compat")
            return;
        startCompatWatchdog(mainWindow);
    });
    mainWindow.webContents.on("dom-ready", () => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog("dom-ready");
            void mainWindow?.webContents.executeJavaScript("(() => { if (window.__binaryCompatErrorHookInstalled) return true; window.__binaryCompatErrorHookInstalled = true; window.addEventListener('error', (event) => { try { const stack = event?.error?.stack || event?.message || 'unknown-error'; console.error('[compat-window-error]', stack); } catch {} }, true); window.addEventListener('unhandledrejection', (event) => { try { const reason = event?.reason; const detail = reason?.stack || reason?.message || String(reason); console.error('[compat-unhandled-rejection]', detail); } catch {} }, true); return true; })()", true).then(() => {
                appendCodexCompatLog("dom-ready-error-hook-installed");
            }).catch((error) => {
                appendCodexCompatLog(`dom-ready-error-hook-failed ${error instanceof Error ? error.message : String(error)}`);
            });
            void mainWindow?.webContents.executeJavaScript("(() => ({ hasBridge: Boolean(window.electronBridge), hasSendMessageFromView: typeof window.electronBridge?.sendMessageFromView === 'function', codexWindowType: window.codexWindowType ?? null }))()", true).then((probe) => {
                appendCodexCompatLog(`dom-ready-probe ${JSON.stringify(probe)}`);
            }).catch((error) => {
                appendCodexCompatLog(`dom-ready-probe-error ${error instanceof Error ? error.message : String(error)}`);
            });
            void injectCompatPluginOverlay(mainWindow);
        }
    });
    mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog(`preload-error path=${preloadPath} error=${String(error)}`);
        }
    });
    mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog(`console level=${level} source=${sourceId}:${line} message=${message}`);
        }
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog(`render-process-gone reason=${String(details.reason)} exitCode=${String(details.exitCode)}`);
        }
    });
    mainWindow.webContents.on("unresponsive", () => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog(`window-unresponsive inflight=${protocolInflightRequests} pending=${protocolPendingSummary()}`);
        }
    });
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog(`did-fail-load code=${String(errorCode)} description=${String(errorDescription || "")}`);
            if (isCompatAbortLikeError(errorCode, errorDescription)) {
                appendCodexCompatLog("did-fail-load ignored-abort");
                return;
            }
            handleCompatStartupIssue("compat-did-fail-load");
            return;
        }
    });
    const compatLoadGuard = setTimeout(() => {
        if (activeUiRuntime !== "codex_compat")
            return;
        if (codexCompatReady)
            return;
        const webContents = mainWindow?.webContents;
        appendCodexCompatLog(`load-guard-timeout ready=${codexCompatReady} url=${webContents?.getURL?.() ?? ""} isLoading=${String(webContents?.isLoadingMainFrame?.())} crashed=${String(webContents?.isCrashed?.())} inflight=${protocolInflightRequests} pending=${protocolPendingSummary()}`);
        handleCompatStartupIssue("compat-load-guard-timeout");
    }, compatLoadGuardMs);
    void loadWindowSurface(mainWindow, "main").then(() => {
        clearTimeout(compatLoadGuard);
        if (activeUiRuntime === "codex_compat") {
            appendCodexCompatLog("load-surface-success");
            startCompatWatchdog(mainWindow);
        }
    }).catch((error) => {
        clearTimeout(compatLoadGuard);
        if (activeUiRuntime === "codex_compat") {
            const errorMessage = error instanceof Error ? error.message : String(error);
            appendCodexCompatLog(`load-surface-error error=${errorMessage}`);
            if (isCompatAbortLikeError(undefined, errorMessage)) {
                appendCodexCompatLog("load-surface-error ignored-abort");
                return;
            }
            handleCompatStartupIssue("compat-load-surface-error");
            return;
        }
    });
    const compatProbeTimer = setInterval(() => {
        if (activeUiRuntime !== "codex_compat" || codexCompatReady) {
            clearInterval(compatProbeTimer);
            return;
        }
        if (!mainWindow || mainWindow.isDestroyed()) {
            clearInterval(compatProbeTimer);
            return;
        }
        void mainWindow.webContents.executeJavaScript("(() => ({ readyState: document.readyState, rootChildren: document.querySelector('#root')?.children?.length ?? -1, bodyTextLength: (document.body?.innerText || '').trim().length, title: document.title }))()", true).then((probe) => {
            appendCodexCompatLog(`compat-probe ${JSON.stringify(probe)}`);
        }).catch((error) => {
            appendCodexCompatLog(`compat-probe-error ${error instanceof Error ? error.message : String(error)}`);
        });
    }, 15_000);
    mainWindow.on("close", () => {
        clearInterval(compatProbeTimer);
        clearCompatWatchdog();
        closeAuxiliaryWindows();
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
        clearInterval(compatProbeTimer);
        clearCompatWatchdog();
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
    if (activeUiRuntime === "codex_compat") {
        playerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    }
    else {
        configureWindowSecurity(playerWindow);
    }
    playerWindow.setAlwaysOnTop(true, "screen-saver");
    playerWindow.setSkipTaskbar(true);
    playerWindow.setVisibleOnAllWorkspaces(Boolean(overlayState.pinned), { visibleOnFullScreen: true });
    applyOverlayInteraction();
    void loadWindowSurface(playerWindow, "player");
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
        backgroundColor: "#000000",
        webPreferences: {
            preload: node_path_1.default.join(packageRoot, "dist", "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    if (activeUiRuntime === "codex_compat") {
        interventionWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    }
    else {
        configureWindowSecurity(interventionWindow);
    }
    interventionWindow.setAlwaysOnTop(true, "screen-saver");
    interventionWindow.setSkipTaskbar(true);
    void loadWindowSurface(interventionWindow, "intervention");
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
        explicit: true,
    };
    await saveDesktopState();
    broadcast("binary:appearance-updated", desktopAppearance);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(CODEX_IPC.systemThemeVariantUpdated, currentRendererThemeVariant());
    }
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
        requestedUiRuntime,
        activeUiRuntime,
    };
});
electron_1.ipcMain.handle("binary:host:openhands-capabilities", async () => {
    return await getOpenHandsCapabilities();
});
electron_1.ipcMain.handle("binary:host:get-preferences", async () => {
    return await getHostPreferences();
});
electron_1.ipcMain.handle("binary:host:set-preferences", async (_event, patch) => {
    return await setHostPreferences((patch && typeof patch === "object" ? patch : {}));
});
electron_1.ipcMain.handle("binary:choose-workspace", async () => {
    return await chooseCompatWorkspaceRoot();
});
electron_1.ipcMain.handle("binary:choose-binary-file", async () => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: "Choose a binary target",
        properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths[0] || null;
});
electron_1.ipcMain.handle("binary:read-text-file", async (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath.trim())
        return "";
    const resolved = node_path_1.default.resolve(filePath);
    const extension = node_path_1.default.extname(resolved).toLowerCase();
    if (!IMPORTABLE_TEXT_EXTENSIONS.has(extension)) {
        throw new Error("Binary Desktop only imports text-based config files.");
    }
    const stats = await node_fs_1.promises.stat(resolved);
    if (!stats.isFile()) {
        throw new Error("Binary Desktop can only import regular files.");
    }
    if (stats.size > MAX_IMPORT_FILE_BYTES) {
        throw new Error("Binary Desktop import files must be 1 MB or smaller.");
    }
    return await node_fs_1.promises.readFile(resolved, "utf8");
});
electron_1.ipcMain.handle("binary:open-external", async (_event, url) => {
    if (typeof url !== "string" || !url.trim())
        return false;
    if (!isAllowedExternalUrl(url)) {
        throw new Error("Binary Desktop only opens http and https links externally.");
    }
    await electron_1.shell.openExternal(url);
    return true;
});
electron_1.ipcMain.handle("binary:debug:dump-ui-state", async (_event, payload) => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const debugPayload = payload && typeof payload === "object"
        ? {
            capturedAt: now.toISOString(),
            payload,
        }
        : {
            capturedAt: now.toISOString(),
            payload: null,
        };
    const dir = uiDebugDir();
    await node_fs_1.promises.mkdir(dir, { recursive: true });
    const latestPath = node_path_1.default.join(dir, "ui-debug-latest.json");
    const archivePath = node_path_1.default.join(dir, `ui-debug-${stamp}.json`);
    const serialized = JSON.stringify(debugPayload, null, 2);
    await node_fs_1.promises.writeFile(latestPath, serialized, "utf8");
    await node_fs_1.promises.writeFile(archivePath, serialized, "utf8");
    return { latestPath, archivePath };
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
electron_1.ipcMain.on("binary:renderer-runtime-error", (_event, payload) => {
    if (activeUiRuntime !== "codex_compat")
        return;
    if (!payload || typeof payload !== "object")
        return;
    const data = payload;
    appendCodexCompatLog(`renderer-runtime-error kind=${String(data.kind ?? "")} source=${String(data.source ?? "")}:${String(data.line ?? 0)}:${String(data.column ?? 0)} message=${String(data.message ?? "")} stack=${String(data.stack ?? "")}`);
});
electron_1.ipcMain.on(CODEX_IPC.getSentryInitOptions, (event) => {
    appendCodexCompatLog("ipc-sync getSentryInitOptions");
    event.returnValue = {
        dsn: CODEX_SENTRY_DSN,
        environment: "binary-desktop",
        codexAppSessionId,
        release: `binary-desktop@${electron_1.app.getVersion()}`,
    };
});
electron_1.ipcMain.on(CODEX_IPC.getBuildFlavor, (event) => {
    appendCodexCompatLog("ipc-sync getBuildFlavor");
    event.returnValue = CODEX_BUILD_FLAVOR;
});
electron_1.ipcMain.on(CODEX_IPC.getSystemThemeVariant, (event) => {
    appendCodexCompatLog("ipc-sync getSystemThemeVariant");
    event.returnValue = currentRendererThemeVariant();
});
electron_1.ipcMain.handle(CODEX_IPC.showContextMenu, async (event, payload) => {
    return await showCompatContextMenu(event.sender, payload);
});
electron_1.ipcMain.handle(CODEX_IPC.showApplicationMenu, async (event, payload) => {
    return await showCompatApplicationMenu(event.sender, payload);
});
electron_1.ipcMain.handle(CODEX_IPC.getFastModeRolloutMetrics, async () => {
    return {
        enabled: false,
        reason: "binary-compat-default",
    };
});
electron_1.ipcMain.handle(CODEX_IPC.triggerSentryTest, async () => {
    return true;
});
electron_1.ipcMain.handle(CODEX_IPC.workerFromView, async (event, raw) => {
    const packet = raw && typeof raw === "object" ? raw : {};
    const workerId = typeof packet.workerId === "string" ? packet.workerId : "default";
    const payload = Object.prototype.hasOwnProperty.call(packet, "payload") ? packet.payload : null;
    if (typeof event.sender.id === "number") {
        const subs = codexWorkerSubscriptions.get(workerId) || new Set();
        subs.add(event.sender.id);
        codexWorkerSubscriptions.set(workerId, subs);
    }
    event.sender.send(getCodexWorkerChannel(workerId), { workerId, payload });
    return true;
});
electron_1.ipcMain.handle(CODEX_IPC.messageFromView, async (event, payload) => {
    return await handleCodexMessageFromView(event.sender, payload);
});
electron_1.app.whenReady().then(async () => {
    const loadedState = await readDesktopState();
    overlayState = loadedState.overlay;
    runSurfaceState = loadedState.runSurfaceState;
    desktopAppearance = loadedState.appearance;
    setCompatWorkspaceRoots(loadedState.workspaceRoots || [], loadedState.activeWorkspaceRoot || undefined);
    activeUiRuntime = requestedUiRuntime;
    appendCodexCompatLog(`startup-config runtime=${activeUiRuntime} traceProtocol=${compatTraceProtocol}`);
    try {
        await registerAppProtocolHandler();
    }
    catch (error) {
        appendCodexCompatLog(`protocol-register-error ${error instanceof Error ? error.message : String(error)}`);
    }
    await runProtocolSelfTest();
    if (activeUiRuntime === "codex_compat" && !(0, node_fs_1.existsSync)(compatMainRendererPath)) {
        appendCodexCompatLog(`compat-main-missing path=${compatMainRendererPath}`);
    }
    startBinaryHost();
    ensureCompatInitialWorkspaceRoot();
    if (node_process_1.default.platform === "win32") {
        void trustCompatHostWorkspaceRoots(readCompatWorkspaceRootOptions());
    }
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
    clearCompatWatchdog();
    if (powerSaveBlockerId != null && electron_1.powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        electron_1.powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
    for (const controller of codexFetchAbortControllers.values()) {
        controller.abort();
    }
    codexFetchAbortControllers.clear();
    for (const controller of codexFetchStreamAbortControllers.values()) {
        controller.abort();
    }
    codexFetchStreamAbortControllers.clear();
    closeAuxiliaryWindows();
    electron_1.globalShortcut.unregisterAll();
});
electron_1.app.on("window-all-closed", () => {
    if (node_process_1.default.platform !== "darwin")
        electron_1.app.quit();
});

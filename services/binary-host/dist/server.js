import { existsSync, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { continueHostedRun, streamHostedAssist } from "./hosted-transport.js";
import { decorateUiEvent } from "./ui-events.js";
import { AutonomyExecutionController, } from "./autonomy-execution-controller.js";
import { BrowserToolExecutor, collectBrowserContext } from "./browser-tool-executor.js";
import { BrowserRuntimeController } from "./browser-runtime.js";
import { DesktopToolExecutor, collectDesktopContext } from "./desktop-tool-executor.js";
import { MachineAutonomyController, defaultMachineAutonomyPolicy, } from "./machine-autonomy.js";
import { MachineWorldModelService } from "./machine-world-model.js";
import { WorldToolExecutor } from "./world-tool-executor.js";
const HOST_VERSION = "0.2.0";
const HOST = process.env.BINARY_IDE_HOST_BIND || "127.0.0.1";
const PORT = Number(process.env.BINARY_IDE_HOST_PORT || "7777");
const CONFIG_DIR = path.join(os.homedir(), ".binary-ide");
const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const HOST_DIR = path.join(CONFIG_DIR, "host");
const STATE_PATH = path.join(HOST_DIR, "state.json");
const SECRET_FALLBACK_PATH = path.join(HOST_DIR, "secrets.json");
const WORLD_MODEL_PATH = path.join(HOST_DIR, "world-model.json");
const RUNS_DIR = path.join(HOST_DIR, "runs");
const JSON_LIMIT_BYTES = 1_500_000;
const MAX_EVENT_HISTORY = 4_000;
const MAX_TOOL_RESULT_HISTORY = 400;
const MAX_CHECKPOINT_HISTORY = 100;
const HEARTBEAT_INTERVAL_MS = 4_000;
const STALE_LEASE_MS = 20_000;
const MAX_OBSERVATION_ONLY_STREAK = 8;
const MAX_PENDING_SIGNATURE_REPEATS = 3;
const HOST_WORKSPACE_TOOLS = [
    "list_files",
    "read_file",
    "search_workspace",
    "get_diagnostics",
    "git_status",
    "git_diff",
    "create_checkpoint",
    "edit",
    "write_file",
    "mkdir",
    "run_command",
    "get_workspace_memory",
];
const HOST_DESKTOP_TOOLS = [
    "desktop_list_apps",
    "desktop_get_active_window",
    "desktop_list_windows",
    "desktop_open_app",
    "desktop_open_url",
    "desktop_focus_window",
    "desktop_wait",
];
const HOST_BROWSER_TOOLS = [
    "browser_list_pages",
    "browser_get_active_page",
    "browser_open_page",
    "browser_focus_page",
    "browser_navigate",
    "browser_snapshot_dom",
    "browser_query_elements",
    "browser_click",
    "browser_type",
    "browser_press_keys",
    "browser_scroll",
    "browser_wait_for",
    "browser_read_text",
    "browser_read_form_state",
    "browser_capture_page",
    "browser_get_network_activity",
    "browser_get_console_messages",
];
const HOST_WORLD_TOOLS = [
    "world_get_summary",
    "world_get_active_context",
    "world_query_graph",
    "world_get_neighbors",
    "world_get_recent_changes",
    "world_get_affordances",
    "world_find_routine",
    "world_record_observation",
    "world_record_proof",
    "world_commit_memory",
    "world_score_route",
];
const activeExecutions = new Map();
const runControllers = new Map();
const machineAutonomyController = new MachineAutonomyController();
const browserRuntimeController = new BrowserRuntimeController();
const worldModelService = new MachineWorldModelService(WORLD_MODEL_PATH);
let activeFocusLease = null;
function nowIso() {
    return new Date().toISOString();
}
function sanitizeFocusLease(lease) {
    if (!lease)
        return null;
    if (new Date(lease.expiresAt).getTime() <= Date.now()) {
        activeFocusLease = null;
        return null;
    }
    return lease;
}
function detectTerminalStack(command, workspaceRoot) {
    const normalized = String(command || "").toLowerCase();
    if (normalized.includes("npm ") ||
        normalized.includes("pnpm ") ||
        normalized.includes("yarn ") ||
        normalized.includes("node ") ||
        normalized.includes("npx ")) {
        return "node_js_ts";
    }
    if (normalized.includes("python") || normalized.includes("pytest") || normalized.includes("pip ")) {
        return "python";
    }
    if (workspaceRoot) {
        if (existsSync(path.join(workspaceRoot, "package.json")))
            return "node_js_ts";
        if (existsSync(path.join(workspaceRoot, "pyproject.toml")) || existsSync(path.join(workspaceRoot, "requirements.txt"))) {
            return "python";
        }
    }
    return "generic";
}
function buildTerminalState(run, pendingToolCall, toolResult) {
    if (pendingToolCall.toolCall.name !== "run_command")
        return null;
    const command = String(pendingToolCall.toolCall.arguments.command || "").trim();
    const preferredProjectRoot = extractRequestedProjectRoot(run.request.task);
    const cwd = typeof pendingToolCall.toolCall.arguments.cwd === "string" && pendingToolCall.toolCall.arguments.cwd.trim()
        ? String(pendingToolCall.toolCall.arguments.cwd).trim()
        : run.workspaceRoot;
    const projectRoot = cwd ||
        (preferredProjectRoot && run.workspaceRoot
            ? path.join(run.workspaceRoot, preferredProjectRoot.replace(/\//g, path.sep))
            : run.workspaceRoot);
    return {
        cwd,
        preferredTerminalCwd: cwd,
        projectRoot,
        stack: detectTerminalStack(command, run.workspaceRoot),
        terminalObjective: typeof pendingToolCall.toolCall.summary === "string" && pendingToolCall.toolCall.summary.trim()
            ? pendingToolCall.toolCall.summary.trim()
            : "Use the shell to inspect, build, or validate the workspace without stealing focus.",
        terminalProof: toolResult?.summary,
        lastCommand: command,
        lastCommandOutcome: !toolResult
            ? "running"
            : toolResult.ok
                ? "succeeded"
                : "failed",
    };
}
function buildExecutionState(decision, run, pendingToolCall, toolResult) {
    if (!decision)
        return null;
    const terminalState = pendingToolCall ? buildTerminalState(run, pendingToolCall, toolResult) : null;
    return {
        lane: decision.lane,
        executionVisibility: decision.executionVisibility,
        foregroundDisruptionRisk: decision.foregroundDisruptionRisk,
        interactionMode: decision.interactionMode,
        focusPolicy: decision.focusPolicy,
        sessionPolicy: decision.sessionPolicy,
        ...(decision.visibleFallbackReason ? { visibleFallbackReason: decision.visibleFallbackReason } : {}),
        focusLeaseActive: decision.focusLeaseActive,
        focusSuppressed: decision.focusSuppressed,
        backgroundSafe: decision.backgroundSafe,
        requiresVisibleInteraction: decision.requiresVisibleInteraction,
        ...(terminalState ? { terminalState } : {}),
    };
}
function buildWorldSummaryText(summary) {
    const parts = [];
    const activeContext = summary.activeContext || {};
    const activeWorkspace = typeof activeContext.activeWorkspace === "string" ? activeContext.activeWorkspace : "";
    const activePage = typeof activeContext.activePage === "string" ? activeContext.activePage : "";
    const activeWindow = typeof activeContext.activeWindow === "string" ? activeContext.activeWindow : "";
    if (activeWorkspace)
        parts.push(`workspace=${activeWorkspace}`);
    if (activePage)
        parts.push(`page=${activePage}`);
    if (activeWindow)
        parts.push(`window=${activeWindow}`);
    if (typeof summary.routineCount === "number")
        parts.push(`routines=${summary.routineCount}`);
    if (typeof summary.nodeCount === "number")
        parts.push(`nodes=${summary.nodeCount}`);
    if (typeof summary.proofCount === "number")
        parts.push(`proofs=${summary.proofCount}`);
    const affordanceSummary = summary.affordanceSummary || {};
    const backgroundSafe = Array.isArray(affordanceSummary.backgroundSafe) ? affordanceSummary.backgroundSafe.length : 0;
    if (backgroundSafe > 0)
        parts.push(`background_safe=${backgroundSafe}`);
    return parts.join(" | ");
}
async function buildWorldContextSlice() {
    const summary = await worldModelService.getSummary();
    const active = await worldModelService.getActiveContext();
    return {
        graphVersion: summary.graphVersion,
        sliceId: typeof active.sliceId === "string" ? active.sliceId : `world-slice-${summary.graphVersion}`,
        summary: buildWorldSummaryText(summary),
        activeContext: summary.activeContext,
        recentChanges: summary.recentChanges.slice(0, 6),
        affordanceSummary: summary.affordanceSummary,
        environmentFreshness: summary.environmentFreshness,
        machineRoutineIds: summary.machineRoutineIds,
    };
}
function buildResumeToken() {
    return randomUUID().replace(/-/g, "");
}
function buildHostSupportedTools(workspaceRoot) {
    return [...(workspaceRoot ? HOST_WORKSPACE_TOOLS : []), ...HOST_DESKTOP_TOOLS, ...HOST_BROWSER_TOOLS, ...HOST_WORLD_TOOLS];
}
function normalizeWorkspacePath(input) {
    return path.resolve(input);
}
function normalizeRelativeTaskPath(input) {
    return String(input || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "")
        .replace(/[),.;:]+$/g, "");
}
function taskRequestsValidation(task) {
    return /\b(run tests?|tests until they pass|validate|validation|lint|verify|proof)\b/i.test(task);
}
function extractRequestedProjectRoot(task) {
    const patterns = [
        /\b(?:project|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
        /\bnamed\s+([A-Za-z0-9._-]+)\s+in\s+the\s+current\s+workspace\b/i,
        /\bcreate\s+(?:a\s+new\s+)?(?:plain\s+\w+\s+)?(?:project\s+folder|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
    ];
    for (const pattern of patterns) {
        const match = task.match(pattern);
        if (match?.[1])
            return normalizeRelativeTaskPath(match[1]);
    }
    return null;
}
function extractRequiredArtifacts(task) {
    const projectRoot = extractRequestedProjectRoot(task);
    const seen = new Set();
    const out = [];
    if (projectRoot) {
        seen.add(projectRoot);
        out.push(projectRoot);
    }
    const tokenPattern = /\b([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+|[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)\b/g;
    for (const match of task.matchAll(tokenPattern)) {
        const raw = normalizeRelativeTaskPath(match[1] || "");
        if (!raw)
            continue;
        const normalized = projectRoot && raw !== projectRoot && !raw.startsWith(`${projectRoot}/`) ? `${projectRoot}/${raw}` : raw;
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}
async function pathExists(targetPath) {
    return fs
        .stat(targetPath)
        .then(() => true)
        .catch(() => false);
}
async function hasGitWorkspace(workspaceRoot) {
    return pathExists(path.join(workspaceRoot, ".git"));
}
function isOptionalGitValidationCommand(command) {
    return /^git\s+diff\s+--check\s+--\s+/i.test(command.trim());
}
function hasSuccessfulCommandProof(run) {
    return run.toolResults.some((toolResult) => toolResult.name === "run_command" && toolResult.ok);
}
function hasRequiredArtifactsLocally(requiredArtifacts, workspaceRoot) {
    return Promise.all(requiredArtifacts.map((relativePath) => pathExists(path.join(workspaceRoot, relativePath.replace(/\//g, path.sep))))).then((results) => results.every(Boolean));
}
function inferValidationCommand(task, workspaceRoot) {
    const projectRoot = extractRequestedProjectRoot(task);
    const normalizedRoot = projectRoot && projectRoot !== "test" && projectRoot !== "tests" ? projectRoot : null;
    const projectPackageJson = normalizedRoot
        ? path.join(workspaceRoot, normalizedRoot, "package.json")
        : path.join(workspaceRoot, "package.json");
    const projectTestIndex = normalizedRoot
        ? path.join(workspaceRoot, normalizedRoot, "test", "index.test.js")
        : path.join(workspaceRoot, "test", "index.test.js");
    const projectDurationTest = normalizedRoot
        ? path.join(workspaceRoot, normalizedRoot, "test", "duration.test.js")
        : path.join(workspaceRoot, "test", "duration.test.js");
    if (normalizedRoot) {
        if (existsSync(projectPackageJson)) {
            return "npm test --silent";
        }
        if (existsSync(projectTestIndex)) {
            return `node --test ${JSON.stringify(`${normalizedRoot}/test/index.test.js`)}`;
        }
        if (existsSync(projectDurationTest)) {
            return `node --test ${JSON.stringify(`${normalizedRoot}/test/duration.test.js`)}`;
        }
    }
    if (existsSync(projectPackageJson)) {
        return "npm test --silent";
    }
    if (existsSync(projectTestIndex)) {
        return `node --test ${JSON.stringify("test/index.test.js")}`;
    }
    if (existsSync(projectDurationTest)) {
        return `node --test ${JSON.stringify("test/duration.test.js")}`;
    }
    return null;
}
async function appendSyntheticToolResult(run, toolResult, attachedRes) {
    run.toolResults.push(toolResult);
    run.toolResults = run.toolResults.slice(-MAX_TOOL_RESULT_HISTORY);
    run.lastToolAt = toolResult.createdAt || nowIso();
    if (run.leaseState)
        run.leaseState.lastToolAt = run.lastToolAt;
    run.heartbeatAt = nowIso();
    if (run.leaseState)
        run.leaseState.heartbeatAt = run.heartbeatAt;
    await appendRunEvent(run, {
        event: "tool_result",
        data: {
            name: toolResult.name,
            ok: toolResult.ok,
            summary: toolResult.summary,
            blocked: toolResult.blocked ?? false,
            lane: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.lane === "string"
                ? toolResult.data.lane
                : undefined,
            executionVisibility: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.executionVisibility === "string"
                ? toolResult.data.executionVisibility
                : undefined,
            foregroundDisruptionRisk: toolResult.data &&
                typeof toolResult.data === "object" &&
                typeof toolResult.data.foregroundDisruptionRisk === "string"
                ? toolResult.data.foregroundDisruptionRisk
                : undefined,
            interactionMode: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.interactionMode === "string"
                ? toolResult.data.interactionMode
                : undefined,
            visibleFallbackReason: toolResult.data &&
                typeof toolResult.data === "object" &&
                typeof toolResult.data.visibleFallbackReason === "string"
                ? toolResult.data.visibleFallbackReason
                : undefined,
            terminalState: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.terminalState === "object"
                ? toolResult.data.terminalState
                : undefined,
        },
    }, attachedRes);
    await emitHostHeartbeat(run, attachedRes);
}
async function shouldSkipOptionalValidation(run, envelope, pendingToolCall) {
    if (envelope.completionStatus !== "complete")
        return false;
    if (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.length > 0)
        return false;
    if (pendingToolCall.toolCall.name !== "run_command")
        return false;
    const command = String(pendingToolCall.toolCall.arguments?.command || "");
    if (!isOptionalGitValidationCommand(command))
        return false;
    if (!run.workspaceRoot)
        return false;
    return !(await hasGitWorkspace(run.workspaceRoot));
}
async function attemptLocalCompletionProof(run, envelope, executor, attachedRes) {
    if (!run.workspaceRoot || !executor)
        return false;
    const requiredArtifacts = extractRequiredArtifacts(run.request.task);
    if (!requiredArtifacts.length)
        return false;
    if (!(await hasRequiredArtifactsLocally(requiredArtifacts, run.workspaceRoot)))
        return false;
    if (taskRequestsValidation(run.request.task) && !hasSuccessfulCommandProof(run)) {
        const command = inferValidationCommand(run.request.task, run.workspaceRoot);
        if (!command)
            return false;
        const validationResult = await executor.execute({
            step: Number(envelope.loopState?.stepCount || run.toolResults.length || 0) + 1,
            adapter: String(envelope.adapter || "host_proof"),
            requiresClientExecution: true,
            createdAt: nowIso(),
            toolCall: {
                id: `host_validation_${randomUUID()}`,
                name: "run_command",
                kind: "command",
                summary: "Binary Host local completion proof",
                arguments: { command },
            },
        });
        await appendSyntheticToolResult(run, validationResult, attachedRes);
        if (!validationResult.ok)
            return false;
    }
    run.finalEnvelope = attachHostMetadata({
        ...envelope,
        completionStatus: "complete",
        missingRequirements: [],
        pendingToolCall: null,
        final: typeof envelope.final === "string" && envelope.final.trim()
            ? envelope.final
            : "Binary Host verified the completed workspace locally.",
    }, run);
    run.updatedAt = nowIso();
    await refreshRunPreferences(run);
    await finalizeRun(run, "completed", attachedRes, {
        message: "Binary Host completed the run after local verification.",
    });
    return true;
}
function deriveWorkspaceTrustMode(grant) {
    if (!grant)
        return "untrusted";
    if (!grant.mutate)
        return "trusted_read_only";
    if (grant.commands === "prompt")
        return "trusted_prompt_commands";
    return "trusted_full_access";
}
function isObserveTool(name) {
    return ![
        "edit",
        "write_file",
        "mkdir",
        "run_command",
        "create_checkpoint",
        "desktop_open_app",
        "desktop_open_url",
        "desktop_focus_window",
        "desktop_click",
        "desktop_type",
        "desktop_keypress",
        "desktop_scroll",
        "desktop_wait",
        "browser_open_page",
        "browser_focus_page",
        "browser_navigate",
        "browser_click",
        "browser_type",
        "browser_press_keys",
        "browser_scroll",
    ].includes(name);
}
function buildPendingSignature(pendingToolCall) {
    if (!pendingToolCall)
        return "";
    return JSON.stringify({
        name: pendingToolCall.toolCall.name,
        arguments: pendingToolCall.toolCall.arguments,
    });
}
function truncateText(value, maxLength) {
    if (typeof value !== "string")
        return undefined;
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, Math.max(0, maxLength - 15))}\n...[truncated]`;
}
function sanitizeToolResultForContinue(toolResult) {
    const next = {
        ...toolResult,
        summary: truncateText(toolResult.summary, 20_000) || toolResult.summary,
        ...(typeof toolResult.error === "string" ? { error: truncateText(toolResult.error, 4_000) } : {}),
    };
    if (toolResult.data && typeof toolResult.data === "object") {
        const data = { ...toolResult.data };
        if (typeof data.stdout === "string")
            data.stdout = truncateText(data.stdout, 8_000) || "";
        if (typeof data.stderr === "string")
            data.stderr = truncateText(data.stderr, 8_000) || "";
        if (typeof data.content === "string")
            data.content = truncateText(data.content, 16_000) || "";
        next.data = data;
    }
    return next;
}
function isTerminalStatus(status) {
    return status === "completed" || status === "failed" || status === "cancelled";
}
function maskApiKey(value) {
    if (!value || value.length < 10)
        return null;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
function withCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
}
function writeJson(res, statusCode, body) {
    const payload = Buffer.from(JSON.stringify(body));
    withCors(res);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(payload.byteLength),
        "Cache-Control": "no-store",
    });
    res.end(payload);
}
function writeSseHeaders(res) {
    withCors(res);
    res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
    });
}
function sendSseEvent(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
async function ensureHostDirs() {
    await fs.mkdir(HOST_DIR, { recursive: true });
    await fs.mkdir(RUNS_DIR, { recursive: true });
    await worldModelService.initialize();
}
async function readJsonFile(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
async function writeJsonFile(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
function defaultPreferences() {
    return {
        baseUrl: process.env.BINARY_IDE_BASE_URL || "http://localhost:3000",
        trustedWorkspaces: [],
        recentSessions: [],
        artifactHistory: [],
        preferredTransport: "host",
        machineAutonomy: defaultMachineAutonomyPolicy(),
        backgroundAgents: [],
    };
}
async function loadPreferences() {
    const existing = await readJsonFile(STATE_PATH);
    const defaultValue = defaultPreferences();
    return {
        ...defaultValue,
        ...(existing || {}),
        baseUrl: String(process.env.BINARY_IDE_BASE_URL || existing?.baseUrl || defaultValue.baseUrl).replace(/\/+$/, ""),
        trustedWorkspaces: Array.isArray(existing?.trustedWorkspaces) ? existing.trustedWorkspaces : [],
        recentSessions: Array.isArray(existing?.recentSessions) ? existing.recentSessions : [],
        artifactHistory: Array.isArray(existing?.artifactHistory) ? existing.artifactHistory : [],
        backgroundAgents: Array.isArray(existing?.backgroundAgents) ? existing.backgroundAgents : [],
        machineAutonomy: existing?.machineAutonomy && typeof existing.machineAutonomy === "object"
            ? {
                ...defaultValue.machineAutonomy,
                ...existing.machineAutonomy,
            }
            : defaultValue.machineAutonomy,
    };
}
async function savePreferences(value) {
    await writeJsonFile(STATE_PATH, value);
}
async function readLegacyConfig() {
    return (await readJsonFile(LEGACY_CONFIG_PATH)) || {};
}
async function writeLegacyApiKey(apiKey) {
    const current = await readLegacyConfig();
    const next = { ...current };
    if (apiKey)
        next.apiKey = apiKey;
    else
        delete next.apiKey;
    await writeJsonFile(LEGACY_CONFIG_PATH, next);
}
async function loadOptionalKeytar() {
    try {
        const dynamicImport = new Function("specifier", "return import(specifier);");
        const imported = (await dynamicImport("keytar"));
        return imported.default || imported;
    }
    catch {
        return null;
    }
}
async function getStoredSecretFile() {
    return (await readJsonFile(SECRET_FALLBACK_PATH)) || {};
}
async function setStoredSecretFile(key, value) {
    const current = await getStoredSecretFile();
    if (value)
        current[key] = value;
    else
        delete current[key];
    await writeJsonFile(SECRET_FALLBACK_PATH, current);
}
async function getApiKeyRecord() {
    const keytar = await loadOptionalKeytar();
    if (keytar) {
        const apiKey = await keytar.getPassword("Binary IDE", "apiKey");
        if (apiKey) {
            return { apiKey, storageMode: "secure", secureStorageAvailable: true };
        }
    }
    const fallbackSecrets = await getStoredSecretFile();
    if (typeof fallbackSecrets.apiKey === "string" && fallbackSecrets.apiKey.trim()) {
        return { apiKey: fallbackSecrets.apiKey.trim(), storageMode: "file", secureStorageAvailable: Boolean(keytar) };
    }
    const legacyConfig = await readLegacyConfig();
    const legacyKey = typeof legacyConfig.apiKey === "string" ? legacyConfig.apiKey.trim() : "";
    if (legacyKey) {
        return { apiKey: legacyKey, storageMode: "file", secureStorageAvailable: Boolean(keytar) };
    }
    return { apiKey: null, storageMode: "none", secureStorageAvailable: Boolean(keytar) };
}
async function setApiKey(apiKey) {
    const keytar = await loadOptionalKeytar();
    if (keytar) {
        await keytar.setPassword("Binary IDE", "apiKey", apiKey);
        await setStoredSecretFile("apiKey", apiKey);
        await writeLegacyApiKey(apiKey);
        return { storageMode: "secure", secureStorageAvailable: true };
    }
    await setStoredSecretFile("apiKey", apiKey);
    await writeLegacyApiKey(apiKey);
    return { storageMode: "file", secureStorageAvailable: false };
}
async function clearApiKey() {
    const keytar = await loadOptionalKeytar();
    if (keytar) {
        await keytar.deletePassword("Binary IDE", "apiKey");
    }
    await setStoredSecretFile("apiKey", undefined);
    await writeLegacyApiKey(undefined);
    return { secureStorageAvailable: Boolean(keytar) };
}
async function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on("data", (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.byteLength;
            if (total > JSON_LIMIT_BYTES) {
                reject(new Error("Request body exceeded the 1.5MB limit."));
                req.destroy();
                return;
            }
            chunks.push(buffer);
        });
        req.on("end", () => {
            try {
                const raw = Buffer.concat(chunks).toString("utf8").trim();
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch (error) {
                reject(error);
            }
        });
        req.on("error", reject);
    });
}
async function createHostToolExecutor(input) {
    const executionController = new AutonomyExecutionController(input.preferences.machineAutonomy);
    const focusLease = sanitizeFocusLease(activeFocusLease);
    if (focusLease) {
        const remainingMs = Math.max(500, new Date(focusLease.expiresAt).getTime() - Date.now());
        executionController.updateFocusLease({
            surface: focusLease.surface,
            source: focusLease.source,
            leaseMs: remainingMs,
            active: true,
        });
    }
    const desktopExecutor = new DesktopToolExecutor(machineAutonomyController, input.preferences.machineAutonomy, executionController);
    const browserExecutor = new BrowserToolExecutor(browserRuntimeController, input.preferences.machineAutonomy, executionController);
    const worldExecutor = new WorldToolExecutor(worldModelService);
    const decorateResult = (pendingToolCall, toolResult, decision) => {
        const executionState = buildExecutionState(decision, input.run, pendingToolCall, toolResult);
        if (!executionState)
            return toolResult;
        input.run.lastExecutionState = executionState;
        return {
            ...toolResult,
            data: {
                ...(toolResult.data && typeof toolResult.data === "object" ? toolResult.data : {}),
                executionVisibility: executionState.executionVisibility,
                foregroundDisruptionRisk: executionState.foregroundDisruptionRisk,
                interactionMode: executionState.interactionMode,
                focusPolicy: executionState.focusPolicy,
                sessionPolicy: executionState.sessionPolicy,
                backgroundSafe: executionState.backgroundSafe,
                requiresVisibleInteraction: executionState.requiresVisibleInteraction,
                focusLeaseActive: executionState.focusLeaseActive,
                focusSuppressed: executionState.focusSuppressed,
                ...(executionState.visibleFallbackReason
                    ? { visibleFallbackReason: executionState.visibleFallbackReason }
                    : {}),
                ...(executionState.terminalState ? { terminalState: executionState.terminalState } : {}),
            },
        };
    };
    if (!input.workspaceRoot) {
        return {
            async execute(pendingToolCall) {
                const decision = executionController.decide(pendingToolCall);
                if (String(pendingToolCall.toolCall.name || "").startsWith("world_")) {
                    return decorateResult(pendingToolCall, await worldExecutor.execute(pendingToolCall), decision);
                }
                if (String(pendingToolCall.toolCall.name || "").startsWith("browser_")) {
                    return decorateResult(pendingToolCall, await browserExecutor.execute(pendingToolCall), decision);
                }
                return decorateResult(pendingToolCall, await desktopExecutor.execute(pendingToolCall), decision);
            },
        };
    }
    const moduleRef = (await import("../../../sdk/playground-ai-cli/dist/tool-executor.js"));
    const workspaceExecutor = new moduleRef.CliToolExecutor(input.workspaceRoot, extractRequestedProjectRoot(input.task));
    return {
        async execute(pendingToolCall) {
            const decision = executionController.decide(pendingToolCall);
            if (String(pendingToolCall.toolCall.name || "").startsWith("world_")) {
                return decorateResult(pendingToolCall, await worldExecutor.execute(pendingToolCall), decision);
            }
            if (String(pendingToolCall.toolCall.name || "").startsWith("browser_")) {
                return decorateResult(pendingToolCall, await browserExecutor.execute(pendingToolCall), decision);
            }
            if (String(pendingToolCall.toolCall.name || "").startsWith("desktop_")) {
                return decorateResult(pendingToolCall, await desktopExecutor.execute(pendingToolCall), decision);
            }
            return decorateResult(pendingToolCall, await workspaceExecutor.execute(pendingToolCall), decision);
        },
    };
}
function hashWorkspaceRoot(input) {
    return createHash("sha256").update(String(input || "")).digest("hex").slice(0, 12);
}
async function persistHostRun(run) {
    await writeJsonFile(path.join(RUNS_DIR, `${run.id}.json`), run);
}
function isWorkspaceTrusted(preferences, workspaceRoot) {
    const resolved = normalizeWorkspacePath(workspaceRoot);
    return preferences.trustedWorkspaces.find((grant) => normalizeWorkspacePath(grant.path) === resolved) || null;
}
async function readAllRuns() {
    const files = await fs.readdir(RUNS_DIR).catch(() => []);
    const runs = [];
    for (const file of files) {
        if (!file.endsWith(".json"))
            continue;
        const run = await readJsonFile(path.join(RUNS_DIR, file));
        if (run)
            runs.push(run);
    }
    return runs;
}
async function loadRunRecord(id) {
    const direct = await readJsonFile(path.join(RUNS_DIR, `${id}.json`));
    const run = direct ||
        (await readAllRuns()).find((item) => item.id === id || item.runId === id || item.traceId === id || item.sessionId === id) ||
        null;
    if (!run)
        return null;
    if (run.status === "running" &&
        !activeExecutions.has(run.id) &&
        run.heartbeatAt &&
        Date.now() - new Date(run.heartbeatAt).getTime() > STALE_LEASE_MS) {
        run.status = "paused";
        run.takeoverReason = "Recovered a stale unattended run after a host restart or expired worker lease.";
        run.resumeToken = buildResumeToken();
        run.updatedAt = nowIso();
        await persistHostRun(run);
    }
    return run;
}
function buildBudgetState(envelope) {
    const loopState = envelope?.loopState;
    if (!loopState)
        return null;
    const maxSteps = typeof loopState.maxSteps === "number" ? loopState.maxSteps : undefined;
    const usedSteps = typeof loopState.stepCount === "number" ? loopState.stepCount : 0;
    const maxMutations = typeof loopState.maxMutations === "number" ? loopState.maxMutations : undefined;
    const usedMutations = typeof loopState.mutationCount === "number" ? loopState.mutationCount : 0;
    const missingRequirements = Array.isArray(envelope?.missingRequirements) ? envelope.missingRequirements : [];
    const exhaustedReason = missingRequirements.find((item) => /budget_exceeded/i.test(item)) ||
        (typeof envelope?.progressState?.stallReason === "string" ? envelope.progressState.stallReason : undefined);
    return {
        maxSteps,
        usedSteps,
        remainingSteps: typeof maxSteps === "number" ? Math.max(0, maxSteps - usedSteps) : undefined,
        maxMutations,
        usedMutations,
        remainingMutations: typeof maxMutations === "number" ? Math.max(0, maxMutations - usedMutations) : undefined,
        exhausted: Boolean(exhaustedReason),
        ...(exhaustedReason ? { reason: exhaustedReason } : {}),
    };
}
function buildCheckpointState(run) {
    const last = run.checkpoints[run.checkpoints.length - 1];
    return {
        count: run.checkpoints.length,
        ...(last?.capturedAt ? { lastCheckpointAt: last.capturedAt } : {}),
        ...(last?.summary ? { lastCheckpointSummary: last.summary } : {}),
    };
}
function buildRunSummary(run) {
    return {
        ...run,
        lastExecutionState: run.lastExecutionState ?? null,
        eventCount: run.events.length,
    };
}
function attachHostMetadata(envelope, run) {
    const mergedLoopState = envelope.loopState || run.lastExecutionState
        ? {
            ...(envelope.loopState || {}),
            ...(run.lastExecutionState?.executionVisibility
                ? { executionVisibility: run.lastExecutionState.executionVisibility }
                : {}),
            ...(run.lastExecutionState?.foregroundDisruptionRisk
                ? { foregroundDisruptionRisk: run.lastExecutionState.foregroundDisruptionRisk }
                : {}),
            ...(run.lastExecutionState?.interactionMode
                ? { interactionMode: run.lastExecutionState.interactionMode }
                : {}),
            ...(run.lastExecutionState?.focusPolicy ? { focusPolicy: run.lastExecutionState.focusPolicy } : {}),
            ...(run.lastExecutionState?.sessionPolicy
                ? { sessionPolicy: run.lastExecutionState.sessionPolicy }
                : {}),
            ...(run.lastExecutionState?.visibleFallbackReason
                ? { visibleFallbackReason: run.lastExecutionState.visibleFallbackReason }
                : {}),
            ...(run.lastExecutionState?.terminalState ? { terminalState: run.lastExecutionState.terminalState } : {}),
        }
        : envelope.loopState;
    const mergedProgressState = envelope.progressState || run.lastExecutionState
        ? {
            ...(envelope.progressState || {}),
            ...(run.lastExecutionState?.executionVisibility
                ? { executionVisibility: run.lastExecutionState.executionVisibility }
                : {}),
            ...(run.lastExecutionState?.interactionMode
                ? { interactionMode: run.lastExecutionState.interactionMode }
                : {}),
            ...(run.lastExecutionState?.visibleFallbackReason
                ? { visibleFallbackReason: run.lastExecutionState.visibleFallbackReason }
                : {}),
            ...(run.lastExecutionState?.terminalState ? { terminalState: run.lastExecutionState.terminalState } : {}),
        }
        : envelope.progressState;
    return {
        ...envelope,
        ...(mergedLoopState ? { loopState: mergedLoopState } : {}),
        ...(mergedProgressState ? { progressState: mergedProgressState } : {}),
        leaseId: run.leaseId,
        heartbeatAt: run.heartbeatAt,
        lastToolAt: run.lastToolAt,
        budgetState: run.budgetState ?? null,
        checkpointState: run.checkpointState ?? null,
        resumeToken: run.resumeToken,
        workspaceTrustMode: run.workspaceTrustMode,
        lastExecutionState: run.lastExecutionState ?? null,
        focusLease: sanitizeFocusLease(activeFocusLease),
    };
}
function applyEnvelopeToRun(run, envelope) {
    if (typeof envelope.traceId === "string")
        run.traceId = envelope.traceId;
    if (typeof envelope.sessionId === "string")
        run.sessionId = envelope.sessionId;
    if (typeof envelope.runId === "string")
        run.runId = envelope.runId;
    run.budgetState = buildBudgetState(envelope);
    run.checkpointState = buildCheckpointState(run);
    run.finalEnvelope = attachHostMetadata(envelope, run);
    if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
        run.takeoverReason = envelope.progressState.stallReason;
    }
}
function enrichPendingToolCallForUi(run, preferences, pendingToolCall) {
    const controller = new AutonomyExecutionController(preferences.machineAutonomy);
    const focusLease = sanitizeFocusLease(activeFocusLease);
    if (focusLease) {
        const remainingMs = Math.max(500, new Date(focusLease.expiresAt).getTime() - Date.now());
        controller.updateFocusLease({
            surface: focusLease.surface,
            source: focusLease.source,
            leaseMs: remainingMs,
            active: true,
        });
    }
    const decision = controller.decide(pendingToolCall);
    const executionState = buildExecutionState(decision, run, pendingToolCall, null);
    run.lastExecutionState = executionState;
    return {
        ...pendingToolCall,
        ...(executionState?.executionVisibility ? { executionVisibility: executionState.executionVisibility } : {}),
        ...(executionState?.foregroundDisruptionRisk
            ? { foregroundDisruptionRisk: executionState.foregroundDisruptionRisk }
            : {}),
        ...(executionState?.interactionMode ? { interactionMode: executionState.interactionMode } : {}),
        ...(executionState?.focusPolicy ? { focusPolicy: executionState.focusPolicy } : {}),
        ...(executionState?.sessionPolicy ? { sessionPolicy: executionState.sessionPolicy } : {}),
        ...(executionState?.visibleFallbackReason
            ? { visibleFallbackReason: executionState.visibleFallbackReason }
            : {}),
    };
}
function nextEventSeq(run) {
    return (run.events[run.events.length - 1]?.seq || 0) + 1;
}
async function appendRunEvent(run, event, attachedRes) {
    const decoratedEvent = decorateUiEvent(event);
    const stored = {
        seq: nextEventSeq(run),
        capturedAt: nowIso(),
        event: decoratedEvent,
    };
    run.events.push(stored);
    run.events = run.events.slice(-MAX_EVENT_HISTORY);
    run.updatedAt = stored.capturedAt;
    await persistHostRun(run);
    if (attachedRes && !attachedRes.destroyed) {
        sendSseEvent(attachedRes, decoratedEvent);
    }
}
function blockedToolResult(pendingToolCall, message) {
    return {
        toolCallId: pendingToolCall.toolCall.id,
        name: pendingToolCall.toolCall.name,
        ok: false,
        blocked: true,
        summary: message,
        error: message,
        createdAt: nowIso(),
    };
}
function sanitizeToolResultForUi(toolResult) {
    const data = toolResult.data && typeof toolResult.data === "object" ? { ...toolResult.data } : undefined;
    if (data && "dataBase64" in data)
        delete data.dataBase64;
    return {
        toolCallId: toolResult.toolCallId,
        name: toolResult.name,
        ok: toolResult.ok,
        blocked: toolResult.blocked ?? false,
        summary: toolResult.summary,
        ...(toolResult.error ? { error: toolResult.error } : {}),
        ...(data ? { data } : {}),
        ...(toolResult.createdAt ? { createdAt: toolResult.createdAt } : {}),
    };
}
function looksLikeDangerousGlobalCommand(command) {
    const normalized = String(command || "").toLowerCase();
    return [
        /\brm\s+-rf\s+\/(?!\w)/,
        /\brmdir\s+\/s\s+\/q\s+[a-z]:\\?$/i,
        /\bdel\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
        /\bformat\b/i,
        /\bshutdown\b/i,
        /\breboot\b/i,
        /\bmkfs\b/i,
        /\bdiskpart\b/i,
        /\bsc\s+delete\b/i,
        /\bnet\s+user\b/i,
    ].some((pattern) => pattern.test(normalized));
}
async function enforceToolPolicy(run, preferences, pendingToolCall) {
    const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
    if (pendingToolCall.toolCall.name === "run_command") {
        if (!grant) {
            return blockedToolResult(pendingToolCall, "Binary Host refused to run a command because the workspace is not trusted.");
        }
        if (grant.commands === "prompt") {
            return blockedToolResult(pendingToolCall, "Binary Host blocked the command because this workspace requires command confirmation.");
        }
        const command = String(pendingToolCall.toolCall.arguments.command || "").trim();
        if (looksLikeDangerousGlobalCommand(command) && grant.elevated !== "allow") {
            return blockedToolResult(pendingToolCall, "Binary Host blocked a dangerous machine-level command outside the trusted workspace policy.");
        }
    }
    return null;
}
async function emitHostStatus(run, message, attachedRes, extra) {
    await appendRunEvent(run, {
        event: "host.status",
        data: {
            message,
            runId: run.id,
            workspaceRoot: run.workspaceRoot || null,
            workspaceHash: hashWorkspaceRoot(run.workspaceRoot),
            client: run.client,
            ...extra,
        },
    }, attachedRes);
}
async function emitHostHeartbeat(run, attachedRes) {
    run.heartbeatAt = nowIso();
    if (run.leaseState)
        run.leaseState.heartbeatAt = run.heartbeatAt;
    await appendRunEvent(run, {
        event: "host.heartbeat",
        data: {
            runId: run.id,
            status: run.status,
            heartbeatAt: run.heartbeatAt,
            lastToolAt: run.lastToolAt || null,
        },
    }, attachedRes);
}
async function emitHostBudget(run, attachedRes) {
    await appendRunEvent(run, {
        event: "host.budget",
        data: {
            runId: run.id,
            budgetState: run.budgetState ?? null,
        },
    }, attachedRes);
}
async function emitHostCheckpoint(run, checkpoint, attachedRes) {
    await appendRunEvent(run, {
        event: "host.checkpoint",
        data: {
            runId: run.id,
            checkpoint,
            checkpointState: run.checkpointState,
        },
    }, attachedRes);
}
async function emitHostStall(run, reason, attachedRes) {
    await appendRunEvent(run, {
        event: "host.stall",
        data: {
            runId: run.id,
            reason,
            lastPendingToolCallSignature: run.lastPendingToolCallSignature || null,
        },
    }, attachedRes);
}
async function emitTakeoverRequired(run, reason, attachedRes) {
    await appendRunEvent(run, {
        event: "host.takeover_required",
        data: {
            runId: run.id,
            reason,
            resumeToken: run.resumeToken,
        },
    }, attachedRes);
}
function detectStall(run, envelope) {
    if ((run.repeatedPendingSignatureCount || 0) >= MAX_PENDING_SIGNATURE_REPEATS) {
        return "Binary Host detected repeated identical pending tool calls without new proof.";
    }
    if ((run.observationOnlyStreak || 0) >= MAX_OBSERVATION_ONLY_STREAK) {
        return "Binary Host detected too many observation-only turns without a mutation or terminal proof.";
    }
    if (run.budgetState?.exhausted) {
        return run.budgetState.reason || "The hosted run exhausted its budget.";
    }
    if (typeof envelope.progressState?.stallReason === "string" && envelope.progressState.stallReason.trim()) {
        return envelope.progressState.stallReason;
    }
    return null;
}
function summarizeReceipt(envelope) {
    const receipt = envelope.receipt && typeof envelope.receipt === "object" ? envelope.receipt : null;
    if (!receipt)
        return null;
    const id = typeof receipt.id === "string" ? receipt.id : null;
    const label = typeof receipt.title === "string" ? receipt.title : typeof receipt.status === "string" ? receipt.status : null;
    if (!id || !label)
        return null;
    return {
        id,
        label,
        url: typeof receipt.downloadUrl === "string" ? receipt.downloadUrl : undefined,
        createdAt: nowIso(),
    };
}
function updatePendingStats(run, envelope) {
    if (!envelope.pendingToolCall) {
        run.lastPendingToolCallSignature = undefined;
        run.repeatedPendingSignatureCount = 0;
        run.observationOnlyStreak = 0;
        return;
    }
    const signature = buildPendingSignature(envelope.pendingToolCall);
    run.repeatedPendingSignatureCount =
        signature && signature === run.lastPendingToolCallSignature
            ? (run.repeatedPendingSignatureCount || 0) + 1
            : 1;
    run.lastPendingToolCallSignature = signature || undefined;
    run.observationOnlyStreak = isObserveTool(envelope.pendingToolCall.toolCall.name)
        ? (run.observationOnlyStreak || 0) + 1
        : 0;
}
function recordToolCheckpoint(run, pendingToolCall, toolResult) {
    if (!toolResult.ok)
        return null;
    if (pendingToolCall.toolCall.name !== "create_checkpoint" && isObserveTool(pendingToolCall.toolCall.name)) {
        return null;
    }
    return {
        capturedAt: toolResult.createdAt || nowIso(),
        summary: toolResult.summary,
        ...(typeof pendingToolCall.step === "number" ? { step: pendingToolCall.step } : {}),
    };
}
async function refreshRunPreferences(run) {
    const preferences = await loadPreferences();
    if (run.sessionId) {
        preferences.recentSessions = [
            {
                sessionId: run.sessionId,
                ...(run.runId ? { runId: run.runId } : {}),
                updatedAt: run.updatedAt,
                ...(run.workspaceRoot ? { workspaceRoot: run.workspaceRoot } : {}),
            },
            ...preferences.recentSessions.filter((item) => item.sessionId !== run.sessionId),
        ].slice(0, 30);
    }
    const artifact = run.finalEnvelope ? summarizeReceipt(run.finalEnvelope) : null;
    if (artifact) {
        preferences.artifactHistory = [
            artifact,
            ...preferences.artifactHistory.filter((item) => item.id !== artifact.id),
        ].slice(0, 30);
    }
    await savePreferences(preferences);
}
async function runWithTransportRetry(run, attachedRes, work) {
    try {
        return await work();
    }
    catch (error) {
        await emitHostStatus(run, "Binary Host retrying a transient hosted transport failure.", attachedRes, {
            error: error instanceof Error ? error.message : String(error),
        });
        return await work();
    }
}
async function finalizeRun(run, status, attachedRes, extra) {
    run.status = status;
    run.updatedAt = nowIso();
    if (extra?.error)
        run.error = extra.error;
    run.checkpointState = buildCheckpointState(run);
    await persistHostRun(run);
    if (extra?.message) {
        await emitHostStatus(run, extra.message, attachedRes);
    }
}
async function pauseRun(run, attachedRes, reason) {
    run.takeoverReason = reason || run.takeoverReason;
    await finalizeRun(run, "paused", attachedRes, {
        message: reason || "Binary Host paused the run.",
    });
}
async function cancelRun(run, attachedRes, reason) {
    await finalizeRun(run, "cancelled", attachedRes, {
        message: reason || "Binary Host cancelled the run.",
    });
}
async function startRunExecution(runId, attachedRes) {
    const existing = activeExecutions.get(runId);
    if (existing) {
        await existing;
        return;
    }
    const execution = executeHostRun(runId, attachedRes)
        .catch(async (error) => {
        const run = await loadRunRecord(runId);
        if (run) {
            run.error = error instanceof Error ? error.message : String(error);
            run.updatedAt = nowIso();
            await persistHostRun(run);
        }
    })
        .finally(() => {
        activeExecutions.delete(runId);
        runControllers.delete(runId);
    });
    activeExecutions.set(runId, execution);
    await execution;
}
async function createQueuedRun(input) {
    const createdAt = nowIso();
    const run = {
        id: randomUUID(),
        status: "queued",
        createdAt,
        updatedAt: createdAt,
        client: input.request.client || { surface: "unknown" },
        request: input.request,
        workspaceRoot: input.request.workspaceRoot,
        workspaceTrustMode: input.workspaceTrustMode,
        traceId: randomUUID(),
        resumeToken: buildResumeToken(),
        controlHistory: [],
        toolResults: [],
        checkpoints: [],
        events: [],
    };
    run.checkpointState = buildCheckpointState(run);
    await persistHostRun(run);
    return run;
}
async function executeHostRun(runId, attachedRes) {
    const run = await loadRunRecord(runId);
    if (!run)
        throw new Error(`Unknown Binary Host run ${runId}`);
    const preferences = await loadPreferences();
    const grant = run.workspaceRoot ? isWorkspaceTrusted(preferences, run.workspaceRoot) : null;
    run.workspaceTrustMode = deriveWorkspaceTrustMode(grant);
    if (run.workspaceRoot && !grant) {
        await finalizeRun(run, "failed", attachedRes, {
            error: `Workspace ${run.workspaceRoot} is not trusted.`,
            message: "Binary Host blocked the run because the workspace is not trusted.",
        });
        return;
    }
    const auth = await getApiKeyRecord();
    if (!auth.apiKey) {
        await finalizeRun(run, "failed", attachedRes, {
            error: "No Binary IDE API key is configured in the local host.",
            message: "Binary Host could not start because no API key is configured.",
        });
        return;
    }
    const controller = {
        pauseRequested: false,
        cancelRequested: false,
    };
    runControllers.set(run.id, controller);
    run.status = "running";
    run.error = undefined;
    run.takeoverReason = undefined;
    run.leaseId = randomUUID();
    run.resumeToken = buildResumeToken();
    run.heartbeatAt = nowIso();
    run.leaseState = {
        leaseId: run.leaseId,
        workerId: `${os.hostname()}:${process.pid}`,
        startedAt: run.heartbeatAt,
        heartbeatAt: run.heartbeatAt,
        ...(run.lastToolAt ? { lastToolAt: run.lastToolAt } : {}),
    };
    run.updatedAt = nowIso();
    run.checkpointState = buildCheckpointState(run);
    await persistHostRun(run);
    await emitHostStatus(run, "Binary Host accepted the request.", attachedRes, {
        attached: Boolean(attachedRes),
    });
    await emitHostHeartbeat(run, attachedRes);
    const executor = await createHostToolExecutor({
        run,
        workspaceRoot: run.workspaceRoot,
        task: run.request.task,
        preferences,
    });
    try {
        await emitHostStatus(run, "Binary Host is contacting the hosted assist transport.", attachedRes, {
            baseUrl: preferences.baseUrl,
        });
        const [desktopContext, browserContext] = await Promise.all([
            collectDesktopContext({
                machineAutonomyController,
                policy: preferences.machineAutonomy,
            }).catch(() => ({ platform: process.platform })),
            collectBrowserContext({
                runtime: browserRuntimeController,
                policy: preferences.machineAutonomy,
            }).catch(() => ({ mode: "unavailable" })),
        ]);
        await worldModelService.ingestSnapshot({
            runId: run.id,
            task: run.request.task,
            workspaceRoot: run.workspaceRoot,
            desktopContext,
            browserContext,
            focusLease: sanitizeFocusLease(activeFocusLease),
        });
        const worldContext = await buildWorldContextSlice();
        let envelope = await runWithTransportRetry(run, attachedRes, () => streamHostedAssist({
            baseUrl: preferences.baseUrl,
            apiKey: auth.apiKey,
            request: {
                ...run.request,
                context: {
                    desktop: desktopContext,
                    browser: browserContext,
                    worldModel: worldContext,
                },
                clientCapabilities: {
                    toolLoop: true,
                    supportedTools: buildHostSupportedTools(run.workspaceRoot),
                    supportsNativeToolResults: true,
                },
            },
            onEvent: async (event) => {
                await appendRunEvent(run, event, attachedRes);
                if (typeof event.sessionId === "string")
                    run.sessionId = event.sessionId;
                const eventName = typeof event.event === "string" ? event.event : "";
                if (eventName === "meta" && event.data && typeof event.data === "object") {
                    const data = event.data;
                    if (typeof data.traceId === "string")
                        run.traceId = data.traceId;
                    if (typeof data.sessionId === "string")
                        run.sessionId = data.sessionId;
                    if (typeof data.runId === "string")
                        run.runId = data.runId;
                }
            },
        }));
        await emitHostStatus(run, "Binary Host received the initial hosted assist response.", attachedRes, {
            hostedRunId: envelope.runId || null,
            sessionId: envelope.sessionId || null,
        });
        applyEnvelopeToRun(run, envelope);
        updatePendingStats(run, envelope);
        await persistHostRun(run);
        await emitHostBudget(run, attachedRes);
        if (envelope.pendingToolCall) {
            await appendRunEvent(run, {
                event: "tool_request",
                data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
            }, attachedRes);
        }
        while (envelope.pendingToolCall && envelope.runId) {
            if (controller.cancelRequested) {
                await cancelRun(run, attachedRes, "Binary Host cancelled the run before the next tool execution.");
                return;
            }
            if (controller.pauseRequested) {
                await pauseRun(run, attachedRes, "Binary Host paused the run before the next tool execution.");
                return;
            }
            const pendingToolCall = envelope.pendingToolCall;
            if (await shouldSkipOptionalValidation(run, envelope, pendingToolCall)) {
                run.finalEnvelope = attachHostMetadata({
                    ...envelope,
                    pendingToolCall: null,
                    final: typeof envelope.final === "string" && envelope.final.trim()
                        ? envelope.final
                        : "Binary Host completed the run after skipping an optional non-git validation step.",
                }, run);
                run.updatedAt = nowIso();
                await refreshRunPreferences(run);
                await finalizeRun(run, "completed", attachedRes, {
                    message: "Binary Host completed the run after skipping an optional non-git validation step.",
                });
                return;
            }
            const blocked = await enforceToolPolicy(run, preferences, pendingToolCall);
            const toolResult = blocked ||
                (await executor.execute(pendingToolCall));
            run.toolResults.push(toolResult);
            run.toolResults = run.toolResults.slice(-MAX_TOOL_RESULT_HISTORY);
            run.lastToolAt = toolResult.createdAt || nowIso();
            if (run.leaseState)
                run.leaseState.lastToolAt = run.lastToolAt;
            run.heartbeatAt = nowIso();
            if (run.leaseState)
                run.leaseState.heartbeatAt = run.heartbeatAt;
            if (!isObserveTool(pendingToolCall.toolCall.name)) {
                run.observationOnlyStreak = 0;
            }
            await worldModelService.recordToolReceipt({
                runId: run.id,
                task: run.request.task,
                workspaceRoot: run.workspaceRoot,
                pendingToolCall,
                toolResult,
            });
            await appendRunEvent(run, {
                event: "tool_result",
                data: {
                    name: toolResult.name,
                    ok: toolResult.ok,
                    summary: toolResult.summary,
                    blocked: toolResult.blocked ?? false,
                    lane: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.lane === "string"
                        ? toolResult.data.lane
                        : undefined,
                    executionVisibility: toolResult.data &&
                        typeof toolResult.data === "object" &&
                        typeof toolResult.data.executionVisibility === "string"
                        ? toolResult.data.executionVisibility
                        : undefined,
                    foregroundDisruptionRisk: toolResult.data &&
                        typeof toolResult.data === "object" &&
                        typeof toolResult.data.foregroundDisruptionRisk === "string"
                        ? toolResult.data.foregroundDisruptionRisk
                        : undefined,
                    interactionMode: toolResult.data &&
                        typeof toolResult.data === "object" &&
                        typeof toolResult.data.interactionMode === "string"
                        ? toolResult.data.interactionMode
                        : undefined,
                    visibleFallbackReason: toolResult.data &&
                        typeof toolResult.data === "object" &&
                        typeof toolResult.data.visibleFallbackReason === "string"
                        ? toolResult.data.visibleFallbackReason
                        : undefined,
                    terminalState: toolResult.data &&
                        typeof toolResult.data === "object" &&
                        typeof toolResult.data.terminalState === "object"
                        ? toolResult.data.terminalState
                        : undefined,
                    proof: toolResult.data && typeof toolResult.data === "object" && typeof toolResult.data.proof === "object"
                        ? toolResult.data.proof
                        : undefined,
                    result: sanitizeToolResultForUi(toolResult),
                },
            }, attachedRes);
            const checkpoint = recordToolCheckpoint(run, pendingToolCall, toolResult);
            if (checkpoint) {
                run.checkpoints.push(checkpoint);
                run.checkpoints = run.checkpoints.slice(-MAX_CHECKPOINT_HISTORY);
                run.checkpointState = buildCheckpointState(run);
                await emitHostCheckpoint(run, checkpoint, attachedRes);
            }
            await emitHostHeartbeat(run, attachedRes);
            envelope = await runWithTransportRetry(run, attachedRes, () => continueHostedRun({
                baseUrl: preferences.baseUrl,
                apiKey: auth.apiKey,
                runId: envelope.runId,
                toolResult: sanitizeToolResultForContinue(toolResult),
                sessionId: envelope.sessionId,
            }));
            applyEnvelopeToRun(run, envelope);
            updatePendingStats(run, envelope);
            await appendRunEvent(run, {
                event: "meta",
                data: attachHostMetadata(envelope, run),
            }, attachedRes);
            if (envelope.pendingToolCall) {
                await appendRunEvent(run, {
                    event: "tool_request",
                    data: enrichPendingToolCallForUi(run, preferences, envelope.pendingToolCall),
                }, attachedRes);
            }
            if (envelope.final) {
                await appendRunEvent(run, {
                    event: "final",
                    data: envelope.final,
                }, attachedRes);
            }
            await emitHostBudget(run, attachedRes);
            const stallReason = detectStall(run, envelope);
            if (stallReason) {
                if (await attemptLocalCompletionProof(run, envelope, executor, attachedRes)) {
                    return;
                }
                run.status = "takeover_required";
                run.takeoverReason = stallReason;
                run.updatedAt = nowIso();
                await persistHostRun(run);
                await emitHostStall(run, stallReason, attachedRes);
                await emitTakeoverRequired(run, stallReason, attachedRes);
                await emitHostStatus(run, "Binary Host needs operator takeover to continue safely.", attachedRes, {
                    reason: stallReason,
                });
                return;
            }
        }
        run.finalEnvelope = attachHostMetadata(envelope, run);
        run.updatedAt = nowIso();
        await refreshRunPreferences(run);
        if (await attemptLocalCompletionProof(run, envelope, executor, attachedRes)) {
            return;
        }
        if (envelope.completionStatus === "incomplete" ||
            (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.length > 0)) {
            const reason = (Array.isArray(envelope.missingRequirements) && envelope.missingRequirements.join("; ")) ||
                "The hosted run stopped without proving completion.";
            run.takeoverReason = reason;
            await finalizeRun(run, "takeover_required", attachedRes, {
                message: "Binary Host paused for takeover because completion could not be proven.",
            });
            await emitTakeoverRequired(run, reason, attachedRes);
            return;
        }
        await worldModelService.commitMemory({
            label: "Successful run",
            summary: typeof run.finalEnvelope?.final === "string" && run.finalEnvelope.final.trim()
                ? run.finalEnvelope.final.trim().slice(0, 2000)
                : `Binary completed: ${run.request.task}`,
            scope: run.workspaceRoot ? "workspace" : "run",
            tags: Array.from(new Set([
                "successful_run",
                run.workspaceRoot ? path.basename(run.workspaceRoot) : "",
                run.lastExecutionState?.interactionMode || "",
            ].filter(Boolean))),
            data: {
                runId: run.id,
                task: run.request.task,
                workspaceRoot: run.workspaceRoot || null,
            },
        });
        await finalizeRun(run, "completed", attachedRes, {
            message: "Binary Host completed the run.",
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        run.error = message;
        run.updatedAt = nowIso();
        if (run.runId || run.toolResults.length > 0) {
            run.status = "takeover_required";
            run.takeoverReason = message;
            await persistHostRun(run);
            await emitTakeoverRequired(run, message, attachedRes);
            await emitHostStatus(run, "Binary Host preserved the run for takeover after an execution failure.", attachedRes, {
                error: message,
            });
            return;
        }
        await finalizeRun(run, "failed", attachedRes, {
            error: message,
            message: "Binary Host failed before the hosted run could be recovered.",
        });
    }
    finally {
        if (attachedRes && !attachedRes.destroyed && !attachedRes.writableEnded) {
            attachedRes.write("data: [DONE]\n\n");
            attachedRes.end();
        }
    }
}
async function handleAssist(req, res) {
    const body = (await readJsonBody(req));
    const task = String(body.task || "").trim();
    if (!task) {
        writeJson(res, 400, { error: "Invalid request", message: "task is required" });
        return;
    }
    const preferences = await loadPreferences();
    const request = {
        task,
        mode: body.mode || "auto",
        model: String(body.model || "Binary IDE"),
        historySessionId: typeof body.historySessionId === "string" ? body.historySessionId : undefined,
        workspaceRoot: typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
            ? normalizeWorkspacePath(body.workspaceRoot)
            : undefined,
        detach: body.detach === true,
        client: body.client && typeof body.client === "object" ? body.client : { surface: "unknown" },
    };
    const trustGrant = request.workspaceRoot ? isWorkspaceTrusted(preferences, request.workspaceRoot) : null;
    if (request.workspaceRoot && !trustGrant) {
        writeJson(res, 403, {
            error: "Workspace not trusted",
            message: `Trust ${request.workspaceRoot} with POST /v1/workspaces/trust before running local tool execution through Binary Host.`,
        });
        return;
    }
    const run = await createQueuedRun({
        request,
        workspaceTrustMode: deriveWorkspaceTrustMode(trustGrant),
    });
    if (request.detach) {
        void startRunExecution(run.id);
        writeJson(res, 202, buildRunSummary(run));
        return;
    }
    writeSseHeaders(res);
    req.on("close", () => {
        if (!res.writableEnded) {
            res.end();
        }
    });
    await startRunExecution(run.id, res);
}
const server = createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (method === "OPTIONS") {
        withCors(res);
        res.writeHead(204);
        res.end();
        return;
    }
    try {
        await ensureHostDirs();
        if (method === "GET" && url.pathname === "/v1/healthz") {
            const auth = await getApiKeyRecord();
            writeJson(res, 200, {
                ok: true,
                service: "binary-host",
                version: HOST_VERSION,
                transport: "localhost-http",
                secureStorageAvailable: auth.secureStorageAvailable,
            });
            return;
        }
        if (method === "GET" && url.pathname === "/v1/auth/status") {
            const auth = await getApiKeyRecord();
            writeJson(res, 200, {
                hasApiKey: Boolean(auth.apiKey),
                maskedApiKey: maskApiKey(auth.apiKey),
                storageMode: auth.storageMode,
                configPath: LEGACY_CONFIG_PATH,
            });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/auth/api-key") {
            const body = await readJsonBody(req);
            const apiKey = String(body.apiKey || "").trim();
            if (!apiKey) {
                writeJson(res, 400, { error: "Invalid request", message: "apiKey is required" });
                return;
            }
            const status = await setApiKey(apiKey);
            writeJson(res, 200, {
                hasApiKey: true,
                maskedApiKey: maskApiKey(apiKey),
                storageMode: status.storageMode,
                configPath: LEGACY_CONFIG_PATH,
            });
            return;
        }
        if (method === "DELETE" && url.pathname === "/v1/auth/api-key") {
            const status = await clearApiKey();
            writeJson(res, 200, {
                hasApiKey: false,
                maskedApiKey: null,
                storageMode: "none",
                configPath: LEGACY_CONFIG_PATH,
                secureStorageAvailable: status.secureStorageAvailable,
            });
            return;
        }
        if (method === "GET" && url.pathname === "/v1/preferences") {
            writeJson(res, 200, await loadPreferences());
            return;
        }
        if (method === "GET" && url.pathname === "/v1/focus-lease") {
            writeJson(res, 200, { lease: sanitizeFocusLease(activeFocusLease) });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/focus-lease") {
            const body = await readJsonBody(req);
            const controller = new AutonomyExecutionController((await loadPreferences()).machineAutonomy);
            const lease = controller.updateFocusLease({
                surface: body.surface === "desktop" || body.surface === "cli" || body.surface === "unknown"
                    ? body.surface
                    : "desktop",
                source: typeof body.source === "string" ? body.source : "typing",
                leaseMs: typeof body.leaseMs === "number" ? body.leaseMs : undefined,
                active: body.active !== false,
            });
            activeFocusLease = lease;
            writeJson(res, 200, { lease });
            return;
        }
        if (method === "GET" && url.pathname === "/v1/autonomy/status") {
            const preferences = await loadPreferences();
            const discovered = await machineAutonomyController.listApps();
            const browser = await browserRuntimeController.getStatus(preferences.machineAutonomy).catch(() => ({
                enabled: preferences.machineAutonomy.enabled,
                allowBrowserNative: preferences.machineAutonomy.allowBrowserNative,
                mode: "unavailable",
            }));
            writeJson(res, 200, {
                enabled: preferences.machineAutonomy.enabled,
                platform: process.platform,
                policy: preferences.machineAutonomy,
                appCount: discovered.apps.length,
                indexedAt: discovered.indexedAt,
                browser,
                focusLease: sanitizeFocusLease(activeFocusLease),
            });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/autonomy/configure") {
            const body = await readJsonBody(req);
            const current = await loadPreferences();
            current.machineAutonomy = {
                ...current.machineAutonomy,
                ...body,
                updatedAt: nowIso(),
            };
            await savePreferences(current);
            writeJson(res, 200, current.machineAutonomy);
            return;
        }
        if (method === "GET" && url.pathname === "/v1/autonomy/apps") {
            const forceRefresh = url.searchParams.get("refresh") === "1";
            const discovered = await machineAutonomyController.listApps({ forceRefresh });
            writeJson(res, 200, discovered);
            return;
        }
        if (method === "GET" && url.pathname === "/v1/autonomy/browser/status") {
            const preferences = await loadPreferences();
            const browser = await browserRuntimeController.getStatus(preferences.machineAutonomy);
            writeJson(res, 200, browser);
            return;
        }
        if (method === "GET" && url.pathname === "/v1/autonomy/browser/pages") {
            const preferences = await loadPreferences();
            const pages = await browserRuntimeController.listPages(preferences.machineAutonomy);
            writeJson(res, 200, { pages });
            return;
        }
        if (method === "GET" && url.pathname === "/v1/world-model/status") {
            writeJson(res, 200, await worldModelService.getStatus());
            return;
        }
        if (method === "GET" && url.pathname === "/v1/world-model/summary") {
            writeJson(res, 200, await worldModelService.getSummary());
            return;
        }
        if (method === "GET" && url.pathname === "/v1/world-model/active-context") {
            writeJson(res, 200, await worldModelService.getActiveContext());
            return;
        }
        if (method === "GET" && url.pathname === "/v1/world-model/recent-changes") {
            const limitRaw = url.searchParams.get("limit");
            const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
            writeJson(res, 200, {
                changes: await worldModelService.getRecentChanges(limit),
            });
            return;
        }
        if (method === "GET" && url.pathname === "/v1/world-model/routines") {
            const query = String(url.searchParams.get("query") || "").trim();
            const limitRaw = url.searchParams.get("limit");
            const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 8;
            writeJson(res, 200, {
                routines: await worldModelService.findRoutine(query, limit),
            });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/world-model/query") {
            const body = await readJsonBody(req);
            writeJson(res, 200, await worldModelService.queryGraph({
                query: typeof body.query === "string" ? body.query : undefined,
                type: typeof body.type === "string" ? body.type : undefined,
                limit: typeof body.limit === "number" ? body.limit : undefined,
            }));
            return;
        }
        if (method === "POST" && url.pathname === "/v1/world-model/memory/commit") {
            const body = await readJsonBody(req);
            const label = String(body.label || "").trim();
            if (!label) {
                writeJson(res, 400, { error: "Invalid request", message: "label is required" });
                return;
            }
            writeJson(res, 200, await worldModelService.commitMemory({
                label,
                summary: typeof body.summary === "string" && body.summary.trim() ? body.summary.trim() : label,
                scope: body.scope === "workspace" || body.scope === "domain" || body.scope === "run" || body.scope === "machine"
                    ? body.scope
                    : "machine",
                tags: Array.isArray(body.tags) ? body.tags.map((item) => String(item)) : [],
                data: body.data && typeof body.data === "object" ? body.data : {},
            }));
            return;
        }
        if (method === "POST" && url.pathname === "/v1/autonomy/apps/launch") {
            const body = await readJsonBody(req);
            const query = String(body.query || "").trim();
            if (!query) {
                writeJson(res, 400, { error: "Invalid request", message: "query is required" });
                return;
            }
            const preferences = await loadPreferences();
            if (!preferences.machineAutonomy.enabled || !preferences.machineAutonomy.allowAppLaunch) {
                writeJson(res, 403, {
                    error: "Autonomy disabled",
                    message: "Enable machine autonomy app launching before requesting local app launches.",
                });
                return;
            }
            try {
                const launched = await machineAutonomyController.launchApp(query);
                writeJson(res, 200, launched);
            }
            catch (error) {
                writeJson(res, 404, {
                    error: "App not found",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }
        if (method === "GET" && url.pathname === "/v1/autonomy/agents") {
            const preferences = await loadPreferences();
            writeJson(res, 200, {
                agents: preferences.backgroundAgents,
            });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/autonomy/agents") {
            const body = await readJsonBody(req);
            const name = String(body.name || "").trim();
            const prompt = String(body.prompt || "").trim();
            if (!name || !prompt) {
                writeJson(res, 400, { error: "Invalid request", message: "name and prompt are required" });
                return;
            }
            const current = await loadPreferences();
            const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : randomUUID();
            const now = nowIso();
            const nextAgent = {
                id,
                name,
                prompt,
                status: body.status === "paused" ? "paused" : "active",
                trigger: body.trigger === "scheduled" ||
                    body.trigger === "file_event" ||
                    body.trigger === "process_event" ||
                    body.trigger === "notification"
                    ? body.trigger
                    : "manual",
                scheduleMinutes: typeof body.scheduleMinutes === "number" && Number.isFinite(body.scheduleMinutes)
                    ? Math.max(5, Math.min(1_440, Math.floor(body.scheduleMinutes)))
                    : undefined,
                workspaceRoot: typeof body.workspaceRoot === "string" && body.workspaceRoot.trim()
                    ? normalizeWorkspacePath(body.workspaceRoot)
                    : undefined,
                model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined,
                createdAt: current.backgroundAgents.find((item) => item.id === id)?.createdAt || now,
                updatedAt: now,
                lastRunAt: current.backgroundAgents.find((item) => item.id === id)?.lastRunAt,
            };
            current.backgroundAgents = [
                nextAgent,
                ...current.backgroundAgents.filter((item) => item.id !== id),
            ].slice(0, 60);
            await savePreferences(current);
            writeJson(res, 200, nextAgent);
            return;
        }
        const agentRunMatch = url.pathname.match(/^\/v1\/autonomy\/agents\/([^/]+)\/run$/);
        if (method === "POST" && agentRunMatch) {
            const agentId = decodeURIComponent(agentRunMatch[1] || "");
            const body = await readJsonBody(req);
            const current = await loadPreferences();
            const agent = current.backgroundAgents.find((item) => item.id === agentId);
            if (!agent) {
                writeJson(res, 404, { error: "Not found", message: "Unknown background agent." });
                return;
            }
            if (agent.status !== "active") {
                writeJson(res, 409, { error: "Agent paused", message: "Resume the background agent before running it." });
                return;
            }
            const workspaceRoot = agent.workspaceRoot;
            const trustGrant = workspaceRoot ? isWorkspaceTrusted(current, workspaceRoot) : null;
            if (workspaceRoot && !trustGrant) {
                writeJson(res, 403, {
                    error: "Workspace not trusted",
                    message: `Trust ${workspaceRoot} before running this background agent.`,
                });
                return;
            }
            const request = {
                task: typeof body.task === "string" && body.task.trim() ? body.task.trim() : agent.prompt,
                mode: body.mode || "auto",
                model: typeof body.model === "string" && body.model.trim() ? body.model.trim() : agent.model || "Binary IDE",
                historySessionId: typeof body.historySessionId === "string" ? body.historySessionId : undefined,
                workspaceRoot,
                detach: true,
                client: {
                    surface: "desktop",
                    version: `background-agent:${agent.id}`,
                },
            };
            const run = await createQueuedRun({
                request,
                workspaceTrustMode: deriveWorkspaceTrustMode(trustGrant),
            });
            agent.lastRunAt = nowIso();
            agent.updatedAt = nowIso();
            current.backgroundAgents = [
                agent,
                ...current.backgroundAgents.filter((item) => item.id !== agent.id),
            ].slice(0, 60);
            await savePreferences(current);
            void startRunExecution(run.id);
            writeJson(res, 202, {
                agent,
                run: buildRunSummary(run),
            });
            return;
        }
        if (method === "POST" && url.pathname === "/v1/preferences") {
            const body = await readJsonBody(req);
            const current = await loadPreferences();
            const next = {
                ...current,
                ...body,
                baseUrl: String(body.baseUrl || current.baseUrl).replace(/\/+$/, ""),
                trustedWorkspaces: Array.isArray(body.trustedWorkspaces) ? body.trustedWorkspaces : current.trustedWorkspaces,
                recentSessions: Array.isArray(body.recentSessions) ? body.recentSessions : current.recentSessions,
                artifactHistory: Array.isArray(body.artifactHistory) ? body.artifactHistory : current.artifactHistory,
                backgroundAgents: Array.isArray(body.backgroundAgents) ? body.backgroundAgents : current.backgroundAgents,
                machineAutonomy: body.machineAutonomy && typeof body.machineAutonomy === "object"
                    ? {
                        ...current.machineAutonomy,
                        ...body.machineAutonomy,
                        updatedAt: nowIso(),
                    }
                    : current.machineAutonomy,
            };
            await savePreferences(next);
            writeJson(res, 200, next);
            return;
        }
        if (method === "POST" && url.pathname === "/v1/workspaces/trust") {
            const body = await readJsonBody(req);
            const target = String(body.path || "").trim();
            if (!target) {
                writeJson(res, 400, { error: "Invalid request", message: "path is required" });
                return;
            }
            const current = await loadPreferences();
            const grant = {
                path: normalizeWorkspacePath(target),
                mutate: typeof body.mutate === "boolean" ? body.mutate : true,
                commands: body.commands === "prompt" ? "prompt" : "allow",
                network: body.network === "allow" ? "allow" : "deny",
                elevated: body.elevated === "allow" ? "allow" : "deny",
                grantedAt: nowIso(),
            };
            current.trustedWorkspaces = [grant, ...current.trustedWorkspaces.filter((item) => normalizeWorkspacePath(item.path) !== grant.path)].slice(0, 60);
            await savePreferences(current);
            writeJson(res, 200, current.trustedWorkspaces);
            return;
        }
        if (method === "POST" && url.pathname === "/v1/runs/assist") {
            await handleAssist(req, res);
            return;
        }
        if (method === "GET" && url.pathname === "/v1/runs") {
            const limitRaw = url.searchParams.get("limit");
            const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
            const runs = await readAllRuns();
            writeJson(res, 200, {
                runs: runs
                    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
                    .slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 20)
                    .map((run) => buildRunSummary(run)),
            });
            return;
        }
        const runMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)$/);
        if (method === "GET" && runMatch) {
            const run = await loadRunRecord(decodeURIComponent(runMatch[1] || ""));
            if (!run) {
                writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
                return;
            }
            writeJson(res, 200, run);
            return;
        }
        const eventsMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/events$/);
        if (method === "GET" && eventsMatch) {
            const run = await loadRunRecord(decodeURIComponent(eventsMatch[1] || ""));
            if (!run) {
                writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
                return;
            }
            const afterRaw = url.searchParams.get("after");
            const after = afterRaw ? Number.parseInt(afterRaw, 10) : 0;
            writeJson(res, 200, {
                run: buildRunSummary(run),
                events: run.events.filter((event) => event.seq > (Number.isFinite(after) ? after : 0)),
                done: isTerminalStatus(run.status) || run.status === "takeover_required",
            });
            return;
        }
        const controlMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/control$/);
        if (method === "POST" && controlMatch) {
            const run = await loadRunRecord(decodeURIComponent(controlMatch[1] || ""));
            if (!run) {
                writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
                return;
            }
            const body = await readJsonBody(req);
            const action = String(body.action || "").trim();
            if (!["pause", "resume", "cancel", "repair", "takeover", "retry_last_turn"].includes(action)) {
                writeJson(res, 400, { error: "Invalid request", message: "Unknown control action." });
                return;
            }
            const note = typeof body.note === "string" ? body.note.trim() : null;
            run.controlHistory.push({
                action,
                note,
                at: nowIso(),
            });
            const controller = runControllers.get(run.id) || {
                pauseRequested: false,
                cancelRequested: false,
            };
            runControllers.set(run.id, controller);
            if (action === "pause") {
                controller.pauseRequested = true;
                if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
                    run.status = "paused";
                    run.takeoverReason = note || "Paused by operator.";
                    run.updatedAt = nowIso();
                    await persistHostRun(run);
                }
            }
            else if (action === "cancel") {
                controller.cancelRequested = true;
                if (!activeExecutions.has(run.id) && !isTerminalStatus(run.status)) {
                    run.status = "cancelled";
                    run.updatedAt = nowIso();
                    await persistHostRun(run);
                }
            }
            else if (action === "takeover") {
                controller.pauseRequested = true;
                run.status = "takeover_required";
                run.takeoverReason = note || "Operator takeover requested.";
                run.updatedAt = nowIso();
                await persistHostRun(run);
            }
            else {
                controller.pauseRequested = false;
                controller.cancelRequested = false;
                if (!activeExecutions.has(run.id)) {
                    run.status = "queued";
                    run.takeoverReason = undefined;
                    run.error = undefined;
                    run.updatedAt = nowIso();
                    await persistHostRun(run);
                    void startRunExecution(run.id);
                }
            }
            writeJson(res, 200, buildRunSummary(await loadRunRecord(run.id) || run));
            return;
        }
        const exportMatch = url.pathname.match(/^\/v1\/runs\/([^/]+)\/export$/);
        if (method === "GET" && exportMatch) {
            const run = await loadRunRecord(decodeURIComponent(exportMatch[1] || ""));
            if (!run) {
                writeJson(res, 404, { error: "Not found", message: "Unknown Binary Host run." });
                return;
            }
            writeJson(res, 200, run);
            return;
        }
        if (method === "GET" && url.pathname === "/v1/debug/runs") {
            const files = await fs.readdir(RUNS_DIR).catch(() => []);
            writeJson(res, 200, {
                runs: files
                    .filter((name) => name.endsWith(".json"))
                    .sort((a, b) => b.localeCompare(a))
                    .slice(0, 50),
            });
            return;
        }
        writeJson(res, 404, {
            error: "Not found",
            message: `Unknown route ${url.pathname}`,
        });
    }
    catch (error) {
        writeJson(res, 500, {
            error: "Internal error",
            message: error instanceof Error ? error.message : String(error),
        });
    }
});
server.listen(PORT, HOST, () => {
    process.stdout.write(`Binary Host listening on http://${HOST}:${PORT}\n`);
});

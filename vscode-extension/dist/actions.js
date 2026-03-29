"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRunner = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const patch_utils_1 = require("./patch-utils");
const apply_recovery_utils_1 = require("./apply-recovery-utils");
const validation_utils_1 = require("./validation-utils");
const api_client_1 = require("./api-client");
const config_1 = require("./config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function unwrapExecuteApprovalResponse(raw) {
    if (raw && typeof raw === "object" && "data" in raw) {
        const inner = raw.data;
        if (inner && typeof inner === "object")
            return inner;
    }
    return raw;
}
function extractContentFromAddPatch(patch) {
    const lines = patch.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inHunk = false;
    for (const line of lines) {
        if (line.startsWith("@@")) {
            inHunk = true;
            continue;
        }
        if (!inHunk)
            continue;
        if (line.startsWith("+++ ") || line.startsWith("--- "))
            continue;
        if (line.startsWith("-"))
            return null;
        if (line.startsWith("+") || line.startsWith(" ")) {
            out.push(line.slice(1));
        }
    }
    return out.length ? out.join("\n") : null;
}
function uniquePaths(paths) {
    return Array.from(new Set(paths.map((value) => String(value || "").trim()).filter(Boolean)));
}
function summarizeCommandResult(result) {
    const base = `${result.exitCode === 0 ? "OK" : "FAIL"} ${result.command}`;
    if (result.timedOut)
        return `${base} (timed out)`;
    if (result.exitCode !== 0 && result.stderr.trim())
        return `${base}: ${result.stderr.trim().slice(0, 200)}`;
    return base;
}
class ActionRunner {
    constructor() {
        this.undoBatch = null;
        this.recentTouchedPaths = [];
        this.workspaceHasLintScript = null;
        this.pythonAvailable = null;
        this.onDidChangeUndoEmitter = new vscode.EventEmitter();
        this.onDidChangeUndo = this.onDidChangeUndoEmitter.event;
    }
    getRecentTouchedPaths() {
        return this.recentTouchedPaths.slice();
    }
    canUndo() {
        return this.undoBatch !== null;
    }
    createCheckpoint(reason) {
        this.undoBatch = this.undoBatch || {
            files: [],
            createdDirectories: [],
        };
        this.onDidChangeUndoEmitter.fire(this.canUndo());
        return reason?.trim()
            ? `Checkpoint created: ${reason.trim().slice(0, 200)}`
            : "Checkpoint created for the current Binary IDE run.";
    }
    ensureUndoBatch() {
        if (!this.undoBatch) {
            this.undoBatch = {
                files: [],
                createdDirectories: [],
            };
        }
        return this.undoBatch;
    }
    async captureUndoSnapshot(filePath) {
        const batch = this.ensureUndoBatch();
        if (batch.files.some((entry) => entry.path === filePath))
            return;
        const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(filePath);
        if (!absolutePath)
            return;
        try {
            batch.files.push({
                path: filePath,
                existed: true,
                content: await fs.readFile(absolutePath, "utf8"),
            });
        }
        catch {
            batch.files.push({
                path: filePath,
                existed: false,
                content: "",
            });
        }
    }
    rememberCreatedDirectory(directoryPath) {
        const batch = this.ensureUndoBatch();
        if (!batch.createdDirectories.includes(directoryPath)) {
            batch.createdDirectories.push(directoryPath);
        }
    }
    async apply(input) {
        if (input.mode === "plan") {
            return {
                summary: "Plan mode does not execute local actions.",
                details: [],
                changedFiles: [],
                createdDirectories: [],
                blockedActions: [],
                commandResults: [],
                canUndo: this.canUndo(),
            };
        }
        const rootPath = (0, config_1.getWorkspaceRootPath)();
        if (!rootPath) {
            return {
                summary: "Open a workspace folder before applying local changes.",
                details: [],
                changedFiles: [],
                createdDirectories: [],
                blockedActions: [],
                commandResults: [],
                canUndo: this.canUndo(),
            };
        }
        const collapsed = (0, apply_recovery_utils_1.collapseConflictingFileActions)(input.actions);
        const approvalRaw = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/execute`, input.auth, {
            sessionId: input.sessionId,
            workspaceFingerprint: input.workspaceFingerprint,
            actions: collapsed.actions,
        }, { signal: input.signal });
        const approval = unwrapExecuteApprovalResponse(approvalRaw);
        const approvedActions = (approval.results || [])
            .filter((result) => result.status === "approved" && result.action)
            .map((result) => result.action);
        const blockedActions = (approval.results || [])
            .filter((result) => result.status === "blocked")
            .map((result) => `${result.action?.type || "action"} blocked${result.reason ? `: ${result.reason}` : ""}`);
        const createdDirectories = [];
        const touchedFiles = uniquePaths(approvedActions
            .filter((action) => action.type === "edit" || action.type === "write_file")
            .map((action) => action.path));
        for (const filePath of touchedFiles) {
            await this.captureUndoSnapshot(filePath);
        }
        const details = [];
        const changedFiles = [];
        for (const action of approvedActions) {
            if (action.type === "mkdir") {
                const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(action.path);
                if (!absolutePath) {
                    details.push(`Skipped invalid directory path ${action.path}.`);
                    continue;
                }
                await fs.mkdir(absolutePath, { recursive: true });
                createdDirectories.push(action.path);
                this.rememberCreatedDirectory(action.path);
                details.push(`Created directory ${action.path}.`);
                continue;
            }
            if (action.type === "write_file") {
                const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(action.path);
                if (!absolutePath) {
                    details.push(`Skipped invalid file path ${action.path}.`);
                    continue;
                }
                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                let previous = "";
                try {
                    previous = await fs.readFile(absolutePath, "utf8");
                }
                catch {
                    previous = "";
                }
                if (previous === action.content) {
                    details.push(`No content change for ${action.path}.`);
                    continue;
                }
                await fs.writeFile(absolutePath, action.content, "utf8");
                changedFiles.push(action.path);
                details.push(`Wrote ${action.path}.`);
                continue;
            }
            if (action.type === "edit") {
                const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(action.path);
                const patch = String(action.patch || action.diff || "");
                if (!absolutePath || !patch.trim()) {
                    details.push(`Skipped invalid edit action for ${action.path}.`);
                    continue;
                }
                let previous = "";
                let existed = true;
                try {
                    previous = await fs.readFile(absolutePath, "utf8");
                }
                catch {
                    existed = false;
                }
                if (!existed) {
                    const createdContent = extractContentFromAddPatch(patch);
                    if (!createdContent) {
                        details.push(`Edit could not create missing file ${action.path}.`);
                        continue;
                    }
                    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                    await fs.writeFile(absolutePath, createdContent, "utf8");
                    changedFiles.push(action.path);
                    details.push(`Created ${action.path} from additive patch.`);
                    continue;
                }
                const result = (0, patch_utils_1.applyUnifiedDiff)(previous, patch);
                if (result.status !== "applied" || typeof result.content !== "string") {
                    details.push(`Patch failed for ${action.path}: ${result.reason || result.status}.`);
                    continue;
                }
                if (result.content === previous) {
                    details.push(`Patch produced no content change for ${action.path}.`);
                    continue;
                }
                await fs.writeFile(absolutePath, result.content, "utf8");
                changedFiles.push(action.path);
                details.push(`Patched ${action.path}.`);
            }
        }
        const commandActions = approvedActions.filter((action) => action.type === "command");
        const explicitCommands = input.mode === "auto"
            ? commandActions.filter((action) => action.category === "validation")
            : commandActions;
        const validationCommands = await this.buildValidationCommands(rootPath, changedFiles);
        const commandQueue = [...explicitCommands.map((action) => ({
                command: action.command,
                timeoutMs: action.timeoutMs ?? 60000,
            }))];
        for (const command of validationCommands) {
            if (!commandQueue.some((item) => item.command === command.command)) {
                commandQueue.push(command);
            }
        }
        const commandResults = [];
        for (const command of commandQueue) {
            const result = await this.runCommand(command.command, rootPath, command.timeoutMs);
            commandResults.push(result);
            details.push(summarizeCommandResult(result));
        }
        if (changedFiles.length > 0) {
            const batch = this.ensureUndoBatch();
            for (const directory of createdDirectories) {
                if (!batch.createdDirectories.includes(directory))
                    batch.createdDirectories.push(directory);
            }
            this.recentTouchedPaths = uniquePaths([...changedFiles, ...this.recentTouchedPaths]).slice(0, 16);
        }
        else if (this.undoBatch && this.undoBatch.files.length === 0 && this.undoBatch.createdDirectories.length === 0) {
            this.undoBatch = null;
        }
        this.onDidChangeUndoEmitter.fire(this.canUndo());
        const summaryParts = [
            changedFiles.length ? `Applied changes to ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}.` : "",
            createdDirectories.length
                ? `Created ${createdDirectories.length} director${createdDirectories.length === 1 ? "y" : "ies"}.`
                : "",
            commandResults.length ? `Ran ${commandResults.length} command${commandResults.length === 1 ? "" : "s"}.` : "",
            blockedActions.length ? `${blockedActions.length} action${blockedActions.length === 1 ? "" : "s"} blocked by policy.` : "",
        ].filter(Boolean);
        return {
            summary: summaryParts.join(" ") || "No local changes were applied.",
            details,
            changedFiles: uniquePaths(changedFiles),
            createdDirectories: uniquePaths(createdDirectories),
            blockedActions,
            commandResults,
            canUndo: this.canUndo(),
        };
    }
    async undoLastBatch() {
        if (!this.undoBatch)
            return "There is no recent Binary IDE change batch to undo.";
        const rootPath = (0, config_1.getWorkspaceRootPath)();
        if (!rootPath)
            return "Open a workspace folder before undoing changes.";
        for (const entry of [...this.undoBatch.files].reverse()) {
            const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(entry.path);
            if (!absolutePath)
                continue;
            await fs.mkdir(path.dirname(absolutePath), { recursive: true });
            if (!entry.existed) {
                await fs.rm(absolutePath, { force: true }).catch(() => null);
            }
            else {
                await fs.writeFile(absolutePath, entry.content, "utf8");
            }
        }
        for (const directory of [...this.undoBatch.createdDirectories].reverse()) {
            const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(directory);
            if (!absolutePath)
                continue;
            await fs.rm(absolutePath, { recursive: false, force: true }).catch(() => null);
        }
        this.undoBatch = null;
        this.onDidChangeUndoEmitter.fire(false);
        return "Reverted the last Binary IDE change batch.";
    }
    async buildValidationCommands(workspaceFolder, changedFiles) {
        if (changedFiles.length === 0)
            return [];
        const hasWorkspaceLintScript = await this.hasLintScript(workspaceFolder);
        const pythonAvailable = await this.isPythonAvailable(workspaceFolder);
        const plans = changedFiles.map((filePath) => (0, validation_utils_1.planQuickValidationForFile)({
            filePath,
            absFile: path.join(workspaceFolder, (0, config_1.normalizeWorkspaceRelativePath)(filePath) || filePath),
            workspaceFolder,
            changed: true,
            hasWorkspaceLintScript,
            pythonAvailable,
        }));
        return uniquePaths(plans.flatMap((plan) => plan.commands)).map((command) => ({
            command,
            timeoutMs: 60000,
        }));
    }
    async hasLintScript(workspaceFolder) {
        if (this.workspaceHasLintScript !== null)
            return this.workspaceHasLintScript;
        try {
            const packageJson = JSON.parse(await fs.readFile(path.join(workspaceFolder, "package.json"), "utf8"));
            this.workspaceHasLintScript = typeof packageJson.scripts?.lint === "string";
        }
        catch {
            this.workspaceHasLintScript = false;
        }
        return this.workspaceHasLintScript;
    }
    async isPythonAvailable(workspaceFolder) {
        if (this.pythonAvailable !== null)
            return this.pythonAvailable;
        const result = await this.runCommand("python --version", workspaceFolder, 15000);
        this.pythonAvailable = result.exitCode === 0;
        return this.pythonAvailable;
    }
    async runCommand(command, cwd, timeoutMs) {
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                timeout: timeoutMs,
                windowsHide: true,
                maxBuffer: 2000000,
                shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
            });
            return {
                command,
                exitCode: 0,
                stdout: String(stdout || ""),
                stderr: String(stderr || ""),
                timedOut: false,
            };
        }
        catch (error) {
            const typed = error;
            return {
                command,
                exitCode: typeof typed.code === "number" ? typed.code : 1,
                stdout: String(typed.stdout || ""),
                stderr: String(typed.stderr || typed.signal || ""),
                timedOut: typed.killed === true,
            };
        }
    }
}
exports.ActionRunner = ActionRunner;
//# sourceMappingURL=actions.js.map
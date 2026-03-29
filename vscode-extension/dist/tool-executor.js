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
exports.ToolExecutor = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const binary_client_1 = require("./binary-client");
const api_client_1 = require("./api-client");
const config_1 = require("./config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function isGitMissingRepositoryOutput(stdout, stderr) {
    const blob = `${stderr}\n${stdout}`;
    return /not a git repository/i.test(blob);
}
function summarizeCommandFailure(result) {
    if (result.timedOut) {
        return `Command timed out: ${result.command}`;
    }
    const detail = String(result.stderr || result.stdout || "").trim();
    return detail
        ? `Command failed (${result.exitCode}): ${detail.slice(0, 400)}`
        : `Command failed (${result.exitCode}): ${result.command}`;
}
function findMutationFailureDetail(details) {
    return details.find((line) => /^(FAIL\b|Skipped\b|Patch failed\b|Patch produced no content change\b|Edit could not create missing file\b)/.test(line));
}
function isExcludedPath(relativePath) {
    const normalized = relativePath.toLowerCase();
    return (normalized.startsWith(".git/") ||
        normalized.includes("/.git/") ||
        normalized.startsWith("node_modules/") ||
        normalized.includes("/node_modules/") ||
        normalized.startsWith(".next/") ||
        normalized.includes("/.next/"));
}
class ToolExecutor {
    constructor(actionRunner, indexManager) {
        this.actionRunner = actionRunner;
        this.indexManager = indexManager;
        this.binaryToolContextProvider = null;
    }
    setBinaryToolContextProvider(provider) {
        this.binaryToolContextProvider = provider;
    }
    getBinaryToolContext() {
        return this.binaryToolContextProvider?.() || {
            activeBuild: null,
            targetEnvironment: {
                runtime: "node18",
                platform: "portable",
                packageManager: "npm",
            },
        };
    }
    getSupportedTools() {
        return [
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
            "binary_start_build",
            "binary_refine_build",
            "binary_cancel_build",
            "binary_branch_build",
            "binary_rewind_build",
            "binary_validate_build",
            "binary_execute_build",
            "binary_publish_build",
        ];
    }
    async executeToolCall(input) {
        const toolCall = input.pendingToolCall.toolCall;
        const args = toolCall.arguments || {};
        try {
            if (input.signal?.aborted) {
                throw new Error("Prompt aborted");
            }
            if (toolCall.name === "list_files") {
                const result = await this.listFiles(String(args.query || ""), Number(args.limit || 30));
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: `Listed ${result.files.length} workspace file(s).`,
                    data: result,
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "read_file") {
                const filePath = String(args.path || "");
                const result = await this.readFile(filePath, args.startLine, args.endLine);
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: `Read ${result.path}${result.range ? ` (${result.range})` : ""}.`,
                    data: result,
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "search_workspace") {
                const query = String(args.query || "").trim();
                const limit = clamp(Number(args.limit || 6), 1, 12);
                const rows = await this.indexManager.query(query, undefined);
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: `Found ${rows.slice(0, limit).length} workspace snippet(s) for "${query}".`,
                    data: {
                        query,
                        matches: rows.slice(0, limit).map((row) => ({
                            path: row.path,
                            score: row.score,
                            source: row.source,
                            reason: row.reason,
                            content: row.content,
                        })),
                    },
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "get_diagnostics") {
                const diagnostics = await this.getDiagnostics(typeof args.path === "string" ? args.path : undefined);
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: diagnostics.length
                        ? `Collected ${diagnostics.length} diagnostic item(s).`
                        : "No current diagnostics were found.",
                    data: { diagnostics },
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "git_status") {
                const result = await this.runGitCommand("git status --short");
                const noRepo = isGitMissingRepositoryOutput(result.stdout, result.stderr);
                if (noRepo) {
                    return {
                        toolCallId: toolCall.id,
                        name: toolCall.name,
                        ok: true,
                        summary: "Workspace is not a Git repository; no status to report.",
                        data: result,
                        createdAt: new Date().toISOString(),
                    };
                }
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: result.exitCode === 0,
                    summary: result.exitCode === 0 ? "Captured git status." : `git status failed: ${result.stderr || result.stdout}`,
                    data: result,
                    error: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "git_diff") {
                const command = typeof args.path === "string" && args.path.trim()
                    ? `git diff -- ${args.path}`
                    : "git diff --stat";
                const result = await this.runGitCommand(command);
                const noRepo = isGitMissingRepositoryOutput(result.stdout, result.stderr);
                if (noRepo) {
                    return {
                        toolCallId: toolCall.id,
                        name: toolCall.name,
                        ok: true,
                        summary: "Workspace is not a Git repository; no diff to report.",
                        data: result,
                        createdAt: new Date().toISOString(),
                    };
                }
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: result.exitCode === 0,
                    summary: result.exitCode === 0 ? "Captured git diff." : `git diff failed: ${result.stderr || result.stdout}`,
                    data: result,
                    error: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "create_checkpoint") {
                const summary = this.actionRunner.createCheckpoint(typeof args.reason === "string" ? args.reason : undefined);
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary,
                    data: { reason: typeof args.reason === "string" ? args.reason : null },
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "patch_file" ||
                toolCall.name === "edit_file" ||
                toolCall.name === "edit" ||
                toolCall.name === "write_file" ||
                toolCall.name === "mkdir" ||
                toolCall.name === "run_command") {
                const report = await this.runMutationTool({
                    name: toolCall.name,
                    args,
                    auth: input.auth,
                    sessionId: input.sessionId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    signal: input.signal,
                });
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: report.ok,
                    blocked: report.blocked,
                    summary: report.summary,
                    data: report.data,
                    error: report.error,
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "get_workspace_memory") {
                const response = await (0, api_client_1.requestJson)("GET", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/memory/workspace?workspaceFingerprint=${encodeURIComponent(input.workspaceFingerprint)}`, input.auth, undefined, { signal: input.signal });
                const memory = response?.data?.memory || null;
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: true,
                    summary: memory?.summary
                        ? `Loaded workspace memory updated at ${memory.updatedAt || "unknown time"}.`
                        : "No persisted workspace memory was found.",
                    data: {
                        memory,
                    },
                    createdAt: new Date().toISOString(),
                };
            }
            if (toolCall.name === "binary_start_build" ||
                toolCall.name === "binary_refine_build" ||
                toolCall.name === "binary_cancel_build" ||
                toolCall.name === "binary_branch_build" ||
                toolCall.name === "binary_rewind_build" ||
                toolCall.name === "binary_validate_build" ||
                toolCall.name === "binary_execute_build" ||
                toolCall.name === "binary_publish_build") {
                const result = await this.runBinaryTool({
                    name: toolCall.name,
                    args,
                    auth: input.auth,
                    sessionId: input.sessionId,
                    workspaceFingerprint: input.workspaceFingerprint,
                });
                return {
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    ok: result.ok,
                    blocked: result.blocked,
                    summary: result.summary,
                    data: result.data,
                    error: result.error,
                    createdAt: new Date().toISOString(),
                };
            }
            return {
                toolCallId: toolCall.id,
                name: toolCall.name,
                ok: false,
                summary: `Unsupported tool ${toolCall.name}.`,
                error: `Unsupported tool ${toolCall.name}.`,
                createdAt: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                toolCallId: toolCall.id,
                name: toolCall.name,
                ok: false,
                summary: error instanceof Error ? error.message : String(error),
                error: error instanceof Error ? error.message : String(error),
                createdAt: new Date().toISOString(),
            };
        }
    }
    async listFiles(query, limit) {
        const rows = await vscode.workspace.findFiles("**/*", undefined, 2000);
        const items = rows
            .map((uri) => (0, config_1.toWorkspaceRelativePath)(uri))
            .filter((value) => Boolean(value))
            .filter((value) => !isExcludedPath(value));
        const normalizedQuery = query.trim().toLowerCase();
        const filtered = normalizedQuery
            ? items.filter((item) => item.toLowerCase().includes(normalizedQuery))
            : items;
        return {
            files: filtered.sort((a, b) => a.localeCompare(b)).slice(0, clamp(limit, 1, 200)),
        };
    }
    async readFile(filePath, startLineValue, endLineValue) {
        const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(filePath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${filePath}`);
        const raw = await fs.readFile(absolutePath, "utf8");
        const lines = raw.replace(/\r\n/g, "\n").split("\n");
        const startLine = Number.isFinite(Number(startLineValue)) ? clamp(Number(startLineValue), 1, lines.length || 1) : 1;
        const endLine = Number.isFinite(Number(endLineValue)) ? clamp(Number(endLineValue), startLine, lines.length || startLine) : Math.min(lines.length || 1, startLine + 199);
        return {
            path: filePath,
            range: `${startLine}-${endLine}`,
            content: lines.slice(startLine - 1, endLine).join("\n"),
            lineCount: lines.length,
        };
    }
    async getDiagnostics(pathFilter) {
        const normalizedPath = pathFilter?.trim().replace(/\\/g, "/").toLowerCase();
        return vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            path: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .filter((item) => !normalizedPath || item.path?.toLowerCase() === normalizedPath)
            .slice(0, 100);
    }
    async runGitCommand(command) {
        const cwd = (0, config_1.getWorkspaceRootPath)();
        if (!cwd) {
            return {
                command,
                exitCode: 1,
                stdout: "",
                stderr: "Open a workspace folder before running git tools.",
            };
        }
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd,
                windowsHide: true,
                maxBuffer: 2000000,
                shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
            });
            return {
                command,
                exitCode: 0,
                stdout: String(stdout || ""),
                stderr: String(stderr || ""),
            };
        }
        catch (error) {
            const typed = error;
            return {
                command,
                exitCode: typeof typed.code === "number" ? typed.code : 1,
                stdout: String(typed.stdout || ""),
                stderr: String(typed.stderr || ""),
            };
        }
    }
    async runMutationTool(input) {
        const commandCategory = input.args.category === "implementation" || input.args.category === "validation"
            ? input.args.category
            : "implementation";
        const action = input.name === "patch_file" || input.name === "edit_file" || input.name === "edit"
            ? {
                type: "edit",
                path: String(input.args.path || ""),
                patch: String(input.args.patch || ""),
            }
            : input.name === "write_file"
                ? {
                    type: "write_file",
                    path: String(input.args.path || ""),
                    content: String(input.args.content || ""),
                    overwrite: typeof input.args.overwrite === "boolean" ? input.args.overwrite : true,
                }
                : input.name === "mkdir"
                    ? {
                        type: "mkdir",
                        path: String(input.args.path || ""),
                    }
                    : {
                        type: "command",
                        command: String(input.args.command || ""),
                        timeoutMs: typeof input.args.timeoutMs === "number" ? input.args.timeoutMs : undefined,
                        category: commandCategory,
                    };
        const report = await this.actionRunner.apply({
            mode: input.name === "run_command" ? "yolo" : "auto",
            actions: [action],
            auth: input.auth,
            sessionId: input.sessionId,
            workspaceFingerprint: input.workspaceFingerprint,
            signal: input.signal,
        });
        const changedTarget = input.name === "patch_file" || input.name === "edit_file" || input.name === "edit" || input.name === "write_file"
            ? report.changedFiles.includes(String(input.args.path || ""))
            : input.name === "mkdir"
                ? report.createdDirectories.includes(String(input.args.path || ""))
                : report.commandResults.length > 0;
        const commandFailure = report.commandResults.find((result) => result.exitCode !== 0 || result.timedOut);
        const blocked = report.blockedActions.length > 0 &&
            report.changedFiles.length === 0 &&
            report.createdDirectories.length === 0 &&
            report.commandResults.length === 0;
        const detailFailure = findMutationFailureDetail(report.details);
        const firstFailure = report.blockedActions[0] ||
            (commandFailure ? summarizeCommandFailure(commandFailure) : undefined) ||
            (!changedTarget ? detailFailure || report.summary : undefined);
        const ok = !blocked && !commandFailure && changedTarget;
        return {
            ok,
            blocked,
            summary: ok ? report.summary : firstFailure || report.summary,
            data: {
                changedFiles: report.changedFiles,
                createdDirectories: report.createdDirectories,
                blockedActions: report.blockedActions,
                commandResults: report.commandResults,
                details: report.details,
            },
            error: blocked || firstFailure ? String(firstFailure) : undefined,
        };
    }
    resolveBinaryBuildId(args) {
        const explicit = typeof args.buildId === "string" ? args.buildId.trim() : "";
        if (explicit)
            return explicit;
        return this.getBinaryToolContext().activeBuild?.id || null;
    }
    resolveBinaryRuntime(args) {
        const current = this.getBinaryToolContext().targetEnvironment;
        const runtime = args.runtime === "node20" ? "node20" : current.runtime;
        return {
            ...current,
            runtime,
        };
    }
    summarizeBinaryBuild(build) {
        const parts = [
            `Build ${build.id}`,
            `${build.status}`,
            build.phase ? `phase=${build.phase}` : "",
            typeof build.progress === "number" ? `progress=${build.progress}` : "",
            build.publish?.downloadUrl ? "published" : "",
        ].filter(Boolean);
        return parts.join(", ");
    }
    async runBinaryTool(input) {
        const activeBuild = this.getBinaryToolContext().activeBuild;
        let resolvedBuildId = null;
        try {
            if (input.name === "binary_start_build") {
                const intent = String(input.args.intent || "").trim();
                if (!intent) {
                    return {
                        ok: false,
                        summary: "Binary build start requires an intent.",
                        data: {},
                        error: "Missing intent.",
                    };
                }
                const build = await (0, binary_client_1.createBinaryBuild)({
                    auth: input.auth,
                    intent,
                    workspaceFingerprint: input.workspaceFingerprint,
                    historySessionId: input.sessionId || null,
                    targetEnvironment: this.resolveBinaryRuntime(input.args),
                });
                return {
                    ok: true,
                    summary: `Started binary build. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_publish_build") {
                resolvedBuildId = this.resolveBinaryBuildId(input.args);
                if (!resolvedBuildId) {
                    return {
                        ok: false,
                        summary: "No active binary build is available to publish.",
                        data: {},
                        error: "Missing buildId.",
                    };
                }
                const approved = await vscode.window.showWarningMessage(`Publish binary build ${resolvedBuildId}? This creates an external download URL.`, { modal: true }, "Publish");
                if (approved !== "Publish") {
                    return {
                        ok: false,
                        blocked: true,
                        summary: `Publish canceled for build ${resolvedBuildId}.`,
                        data: { buildId: resolvedBuildId },
                        error: "User canceled publish.",
                    };
                }
                const build = await (0, binary_client_1.publishBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                });
                return {
                    ok: true,
                    summary: `Published binary build. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            resolvedBuildId = this.resolveBinaryBuildId(input.args);
            if (!resolvedBuildId) {
                return {
                    ok: false,
                    summary: `No active binary build is available for ${input.name}.`,
                    data: {},
                    error: "Missing buildId.",
                };
            }
            if (input.name === "binary_refine_build") {
                const intent = String(input.args.intent || "").trim();
                if (!intent) {
                    return {
                        ok: false,
                        summary: "Binary refinement requires an intent.",
                        data: { buildId: resolvedBuildId },
                        error: "Missing intent.",
                    };
                }
                const build = await (0, binary_client_1.refineBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                    intent,
                });
                return {
                    ok: true,
                    summary: `Queued binary refinement. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_cancel_build") {
                const build = await (0, binary_client_1.cancelBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                });
                return {
                    ok: true,
                    summary: `Canceled binary build. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_branch_build") {
                const build = await (0, binary_client_1.branchBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                    checkpointId: typeof input.args.checkpointId === "string" ? input.args.checkpointId : undefined,
                    intent: typeof input.args.intent === "string" ? input.args.intent.trim() || undefined : undefined,
                });
                return {
                    ok: true,
                    summary: `Created binary branch. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_rewind_build") {
                const checkpointId = typeof input.args.checkpointId === "string" && input.args.checkpointId.trim()
                    ? input.args.checkpointId.trim()
                    : activeBuild?.checkpointId || activeBuild?.checkpoints?.[0]?.id || "";
                if (!checkpointId) {
                    return {
                        ok: false,
                        summary: `No checkpoint is available to rewind build ${resolvedBuildId}.`,
                        data: { buildId: resolvedBuildId },
                        error: "Missing checkpointId.",
                    };
                }
                const build = await (0, binary_client_1.rewindBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                    checkpointId,
                });
                return {
                    ok: true,
                    summary: `Rewound binary build. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_validate_build") {
                const build = await (0, binary_client_1.validateBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                    targetEnvironment: this.resolveBinaryRuntime(input.args),
                });
                return {
                    ok: true,
                    summary: `Validated binary build. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            if (input.name === "binary_execute_build") {
                const entryPoint = typeof input.args.entryPoint === "string" && input.args.entryPoint.trim()
                    ? input.args.entryPoint.trim()
                    : activeBuild?.manifest?.entrypoint || "";
                if (!entryPoint) {
                    return {
                        ok: false,
                        summary: `No entrypoint is available to execute for build ${resolvedBuildId}.`,
                        data: { buildId: resolvedBuildId },
                        error: "Missing entryPoint.",
                    };
                }
                const build = await (0, binary_client_1.executeBinaryBuild)({
                    auth: input.auth,
                    buildId: resolvedBuildId,
                    entryPoint,
                    args: Array.isArray(input.args.args) ? input.args.args : undefined,
                });
                return {
                    ok: true,
                    summary: `Executed binary build entrypoint. ${this.summarizeBinaryBuild(build)}`,
                    data: { buildId: build.id, build },
                };
            }
            return {
                ok: false,
                summary: `Unsupported binary tool ${input.name}.`,
                data: {},
                error: `Unsupported binary tool ${input.name}.`,
            };
        }
        catch (error) {
            return {
                ok: false,
                summary: error instanceof Error ? error.message : String(error),
                data: resolvedBuildId ? { buildId: resolvedBuildId } : {},
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
exports.ToolExecutor = ToolExecutor;
//# sourceMappingURL=tool-executor.js.map
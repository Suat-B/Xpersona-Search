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
exports.CutieWorkspaceAdapter = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const cutie_policy_1 = require("./cutie-policy");
const config_1 = require("./config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
function toAbsoluteWorkspacePath(relativePath) {
    const root = (0, config_1.getWorkspaceRootPath)();
    const normalized = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(relativePath);
    if (!root || !normalized)
        return null;
    return path.join(root, normalized);
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
class CutieWorkspaceAdapter {
    constructor() {
        this.checkpoint = null;
    }
    async listFiles(query, limit) {
        const rows = await vscode.workspace.findFiles("**/*", undefined, 2000);
        const normalizedQuery = String(query || "").trim().toLowerCase();
        const files = rows
            .map((uri) => {
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (!folder)
                return null;
            return (0, cutie_policy_1.normalizeWorkspaceRelativePath)(path.relative(folder.uri.fsPath, uri.fsPath));
        })
            .filter((value) => Boolean(value))
            .filter((value) => !isExcludedPath(value))
            .filter((value) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery))
            .sort((a, b) => a.localeCompare(b))
            .slice(0, Math.max(1, Math.min(limit, 200)));
        return { files };
    }
    async readFile(filePath, startLineValue, endLineValue) {
        const absolutePath = toAbsoluteWorkspacePath(filePath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${filePath}`);
        const raw = await fs.readFile(absolutePath, "utf8");
        const lines = raw.replace(/\r\n/g, "\n").split("\n");
        const maxLine = Math.max(lines.length, 1);
        const startLine = Number.isFinite(Number(startLineValue))
            ? Math.max(1, Math.min(Number(startLineValue), maxLine))
            : 1;
        const endLine = Number.isFinite(Number(endLineValue))
            ? Math.max(startLine, Math.min(Number(endLineValue), maxLine))
            : Math.min(maxLine, startLine + 199);
        return {
            path: filePath,
            range: `${startLine}-${endLine}`,
            content: lines.slice(startLine - 1, endLine).join("\n"),
            lineCount: lines.length,
        };
    }
    async searchWorkspace(query, limit) {
        const trimmed = String(query || "").trim();
        if (!trimmed) {
            return {
                query: trimmed,
                matches: [],
            };
        }
        const root = (0, config_1.getWorkspaceRootPath)();
        if (!root)
            throw new Error("Open a workspace folder before searching.");
        const matches = await this.searchWithRipgrep(trimmed, limit).catch(() => this.searchWithWorkspaceFiles(trimmed, limit));
        return {
            query: trimmed,
            matches,
        };
    }
    async getDiagnostics(pathFilter) {
        const normalizedFilter = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(pathFilter || "");
        return vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => {
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (!folder)
                return [];
            const relativePath = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(path.relative(folder.uri.fsPath, uri.fsPath));
            return entries.map((entry) => ({
                path: relativePath || undefined,
                severity: entry.severity,
                message: entry.message,
                line: entry.range.start.line + 1,
            }));
        })
            .filter((item) => !normalizedFilter || item.path === normalizedFilter)
            .slice(0, 100);
    }
    async gitStatus() {
        return this.runProcess("git status --short", (0, config_1.getWorkspaceRootPath)() || undefined, 20000);
    }
    async gitDiff(pathFilter) {
        const normalized = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(pathFilter || "");
        const command = normalized ? `git diff -- ${normalized}` : "git diff --stat";
        return this.runProcess(command, (0, config_1.getWorkspaceRootPath)() || undefined, 20000);
    }
    createCheckpoint(reason) {
        if (!this.checkpoint) {
            this.checkpoint = {
                id: (0, cutie_policy_1.randomId)("cutie_checkpoint"),
                createdAt: (0, cutie_policy_1.nowIso)(),
                reason,
                files: [],
                createdDirectories: [],
            };
        }
        else if (reason && !this.checkpoint.reason) {
            this.checkpoint.reason = reason;
        }
        return {
            id: this.checkpoint.id,
            createdAt: this.checkpoint.createdAt,
            reason: this.checkpoint.reason,
            trackedPaths: uniqueStrings(this.checkpoint.files.map((entry) => entry.path)),
        };
    }
    async editFile(input) {
        const normalizedPath = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(input.path);
        if (!normalizedPath)
            throw new Error("edit_file requires a workspace-relative path.");
        if (!input.find)
            throw new Error("edit_file requires a non-empty find string.");
        const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);
        await this.captureUndoSnapshot(normalizedPath);
        const before = await fs.readFile(absolutePath, "utf8");
        const occurrences = before.split(input.find).length - 1;
        if (occurrences <= 0) {
            throw new Error(`edit_file could not find the requested text in ${normalizedPath}.`);
        }
        const after = input.replaceAll
            ? before.split(input.find).join(input.replace)
            : before.replace(input.find, input.replace);
        const replacedCount = input.replaceAll ? occurrences : 1;
        await fs.writeFile(absolutePath, after, "utf8");
        return {
            path: normalizedPath,
            replacedCount,
            checkpoint: this.createCheckpoint(),
        };
    }
    async writeFile(input) {
        const normalizedPath = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(input.path);
        if (!normalizedPath)
            throw new Error("write_file requires a workspace-relative path.");
        const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);
        if (!input.overwrite) {
            const existing = await fs.stat(absolutePath).catch(() => null);
            if (existing?.isFile()) {
                throw new Error(`write_file refused to overwrite ${normalizedPath} without overwrite=true.`);
            }
        }
        await this.captureUndoSnapshot(normalizedPath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, String(input.content || ""), "utf8");
        return {
            path: normalizedPath,
            bytes: Buffer.byteLength(String(input.content || ""), "utf8"),
            checkpoint: this.createCheckpoint(),
        };
    }
    async mkdir(directoryPath) {
        const normalizedPath = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(directoryPath);
        if (!normalizedPath)
            throw new Error("mkdir requires a workspace-relative path.");
        const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);
        if (!this.checkpoint)
            this.createCheckpoint("Automatic checkpoint before mkdir.");
        await fs.mkdir(absolutePath, { recursive: true });
        if (this.checkpoint && !this.checkpoint.createdDirectories.includes(normalizedPath)) {
            this.checkpoint.createdDirectories.push(normalizedPath);
        }
        return {
            path: normalizedPath,
            checkpoint: this.createCheckpoint(),
        };
    }
    async runCommand(input) {
        const validation = (0, cutie_policy_1.validateShellCommand)(input.command);
        if (!validation.ok) {
            throw new Error(validation.reason || "Command blocked by Cutie safety policy.");
        }
        const root = (0, config_1.getWorkspaceRootPath)();
        if (!root)
            throw new Error("Open a workspace folder before running commands.");
        const normalizedCwd = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(input.cwd || "");
        const absoluteCwd = normalizedCwd ? path.join(root, normalizedCwd) : root;
        return this.runProcess(input.command, absoluteCwd, Math.max(100, Math.min(input.timeoutMs || 60000, 300000)));
    }
    getCurrentCheckpoint() {
        if (!this.checkpoint)
            return null;
        return {
            id: this.checkpoint.id,
            createdAt: this.checkpoint.createdAt,
            reason: this.checkpoint.reason,
            trackedPaths: uniqueStrings(this.checkpoint.files.map((entry) => entry.path)),
        };
    }
    async searchWithRipgrep(query, limit) {
        const root = (0, config_1.getWorkspaceRootPath)();
        if (!root)
            return [];
        const result = await execAsync("rg --version", {
            windowsHide: true,
            shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
            cwd: root,
        }).catch(() => null);
        if (!result) {
            throw new Error("rg is not available.");
        }
        const command = `rg -n -F --hidden --glob "!node_modules/**" --glob "!.git/**" --glob "!.next/**" --max-count ${Math.max(1, Math.min(limit, 50))} ${JSON.stringify(query)}`;
        const response = await this.runProcess(command, root, 30000);
        if (response.exitCode !== 0 && !response.stdout.trim()) {
            return [];
        }
        return response.stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
            const match = /^(.+?):(\d+):(.*)$/.exec(line);
            if (!match)
                return null;
            return {
                path: (0, cutie_policy_1.normalizeWorkspaceRelativePath)(match[1]) || match[1],
                line: Number(match[2]) || 1,
                preview: match[3].trim(),
            };
        })
            .filter((item) => Boolean(item))
            .slice(0, Math.max(1, Math.min(limit, 50)));
    }
    async searchWithWorkspaceFiles(query, limit) {
        const files = await this.listFiles("", 300);
        const matches = [];
        const needle = query.toLowerCase();
        for (const filePath of files.files) {
            if (matches.length >= limit)
                break;
            const absolutePath = toAbsoluteWorkspacePath(filePath);
            if (!absolutePath)
                continue;
            const raw = await fs.readFile(absolutePath, "utf8").catch(() => null);
            if (!raw)
                continue;
            const lines = raw.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) {
                if (!lines[index].toLowerCase().includes(needle))
                    continue;
                matches.push({
                    path: filePath,
                    line: index + 1,
                    preview: lines[index].trim(),
                });
                if (matches.length >= limit)
                    break;
            }
        }
        return matches;
    }
    async captureUndoSnapshot(filePath) {
        if (!this.checkpoint) {
            this.createCheckpoint("Automatic checkpoint before workspace mutation.");
        }
        if (!this.checkpoint)
            return;
        if (this.checkpoint.files.some((entry) => entry.path === filePath))
            return;
        const absolutePath = toAbsoluteWorkspacePath(filePath);
        if (!absolutePath)
            return;
        try {
            this.checkpoint.files.push({
                path: filePath,
                existed: true,
                content: await fs.readFile(absolutePath, "utf8"),
            });
        }
        catch {
            this.checkpoint.files.push({
                path: filePath,
                existed: false,
                content: "",
            });
        }
    }
    async runProcess(command, cwd, timeoutMs) {
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
}
exports.CutieWorkspaceAdapter = CutieWorkspaceAdapter;
//# sourceMappingURL=cutie-workspace-adapter.js.map
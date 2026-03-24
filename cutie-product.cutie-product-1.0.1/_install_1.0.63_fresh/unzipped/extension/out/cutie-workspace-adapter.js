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
exports.CutieWorkspaceAdapter = exports.CutieWorkspaceToolError = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const cutie_file_patch_1 = require("./cutie-file-patch");
const cutie_policy_1 = require("./cutie-policy");
const config_1 = require("./config");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class CutieWorkspaceToolError extends Error {
    constructor(message, data, blocked = false) {
        super(message);
        this.data = data;
        this.blocked = blocked;
    }
}
exports.CutieWorkspaceToolError = CutieWorkspaceToolError;
function uniqueStrings(values) {
    return Array.from(new Set(values.filter(Boolean)));
}
/** VS Code documents use \\n internally; on-disk may be CRLF — compare semantically. */
function sameTextContent(a, b) {
    return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}
function toCurrentRevisionId(text, existed) {
    return (0, cutie_file_patch_1.computeWorkspaceRevisionId)(text, existed);
}
/**
 * read_file normalizes CRLF→LF in returned content so the model often proposes LF-only find strings.
 * edit_file must match against on-disk / buffer text, which may still be CRLF on Windows.
 * Try a literal match first, then the same strings after normalizing newlines for comparison only.
 */
function applyEditFindReplace(before, find, replace, replaceAll) {
    const run = (src, f, r, all) => {
        const occurrences = src.split(f).length - 1;
        if (occurrences <= 0)
            return null;
        const after = all ? src.split(f).join(r) : src.replace(f, r);
        return { after, count: all ? occurrences : 1 };
    };
    const direct = run(before, find, replace, replaceAll);
    if (direct)
        return { after: direct.after, replacedCount: direct.count };
    const findNl = find.replace(/\r\n/g, "\n");
    const repNl = replace.replace(/\r\n/g, "\n");
    const beforeNl = before.replace(/\r\n/g, "\n");
    const viaNl = run(beforeNl, findNl, repNl, replaceAll);
    if (!viaNl)
        return null;
    if (before.includes("\r\n")) {
        return {
            after: viaNl.after.replace(/\n/g, "\r\n"),
            replacedCount: viaNl.count,
        };
    }
    return { after: viaNl.after, replacedCount: viaNl.count };
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
    openDocumentForAbsolutePath(absolutePath) {
        const resolved = path.resolve(absolutePath);
        return vscode.workspace.textDocuments.find((doc) => path.resolve(doc.uri.fsPath) === resolved);
    }
    fullDocumentRange(doc) {
        if (doc.lineCount <= 0) {
            return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
        }
        const last = doc.lineAt(doc.lineCount - 1);
        return new vscode.Range(new vscode.Position(0, 0), last.range.end);
    }
    /**
     * Baseline for edits: live editor buffer when the file is open (saved or unsaved), else disk.
     * Unsaved buffers are merged by replacing the whole document and saving — no user prompts.
     */
    async readUtf8Baseline(absolutePath, _normalizedPath) {
        const open = this.openDocumentForAbsolutePath(absolutePath);
        if (open) {
            return { text: open.getText(), existed: true };
        }
        try {
            const text = await fs.readFile(absolutePath, "utf8");
            return { text, existed: true };
        }
        catch {
            return { text: "", existed: false };
        }
    }
    /**
     * Replace document text and persist. If `workspace.save` returns false (save conflicts, compare editors, etc.),
     * fall back to writing the workspace file on disk and re-syncing the buffer so Cutie can still complete edits.
     */
    async replaceEntireFileViaWorkspace(uri, newText, normalizedPath) {
        const replaceFull = async (text) => {
            const doc = await vscode.workspace.openTextDocument(uri);
            const range = this.fullDocumentRange(doc);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(uri, range, text);
            const applied = await vscode.workspace.applyEdit(edit);
            if (!applied) {
                throw new Error(`VS Code did not apply Cutie's edit to "${normalizedPath}".`);
            }
        };
        const persistIntent = async (intent) => {
            await replaceFull(intent);
            let saved = await vscode.workspace.save(uri);
            if (saved)
                return;
            await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(intent, "utf8")));
            const fromDisk = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
            await replaceFull(fromDisk);
            saved = await vscode.workspace.save(uri);
            if (saved)
                return;
            const verify = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
            if (sameTextContent(verify, intent)) {
                return;
            }
            throw new Error(`VS Code refused to save "${normalizedPath}" and the file on disk could not be updated — revert or resolve the save conflict in the editor, then retry.`);
        };
        await persistIntent(newText);
        // Keep the text model aligned with what is actually on disk (format-on-save, diff tabs, or version desync).
        let fromDisk = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
        let doc = await vscode.workspace.openTextDocument(uri);
        if (!sameTextContent(doc.getText(), fromDisk)) {
            await persistIntent(fromDisk);
            fromDisk = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
            doc = await vscode.workspace.openTextDocument(uri);
            if (!sameTextContent(doc.getText(), fromDisk)) {
                throw new Error(`Cutie could not sync "${normalizedPath}" with disk — another process may be rewriting the file. Save or revert in the editor, then retry.`);
            }
        }
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
        const open = this.openDocumentForAbsolutePath(absolutePath);
        const raw = open ? open.getText() : await fs.readFile(absolutePath, "utf8");
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
            revisionId: toCurrentRevisionId(raw, true),
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
    assertBaseRevisionMatchesCurrent(currentText, existed, baseRevision, normalizedPath) {
        const currentRevisionId = toCurrentRevisionId(currentText, existed);
        if (!baseRevision) {
            return currentRevisionId;
        }
        if (baseRevision === currentRevisionId) {
            return currentRevisionId;
        }
        throw new CutieWorkspaceToolError(`stale_revision for ${normalizedPath}`, {
            code: "stale_revision",
            path: normalizedPath,
            currentRevisionId,
            hint: `Re-read ${normalizedPath} or use the latest revision id before editing again.`,
        });
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
        const { text: before, existed } = await this.readUtf8Baseline(absolutePath, normalizedPath);
        if (!existed) {
            throw new Error(`edit_file target does not exist yet: ${normalizedPath}`);
        }
        await this.captureUndoSnapshotWithBaseline(normalizedPath, before, true);
        const applied = applyEditFindReplace(before, input.find, input.replace, Boolean(input.replaceAll));
        if (!applied) {
            throw new Error(`edit_file could not find the requested text in ${normalizedPath}.`);
        }
        const { after, replacedCount } = applied;
        const uri = vscode.Uri.file(absolutePath);
        await this.replaceEntireFileViaWorkspace(uri, after, normalizedPath);
        return {
            path: normalizedPath,
            replacedCount,
            previousContent: before,
            nextContent: after,
            checkpoint: this.createCheckpoint(),
        };
    }
    async patchFile(input) {
        const normalizedPath = (0, cutie_policy_1.normalizeWorkspaceRelativePath)(input.path);
        if (!normalizedPath)
            throw new Error("patch_file requires a workspace-relative path.");
        const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
        if (!absolutePath)
            throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);
        const { text: before, existed } = await this.readUtf8Baseline(absolutePath, normalizedPath);
        if (!existed) {
            throw new CutieWorkspaceToolError(`patch_file target does not exist yet: ${normalizedPath}`, {
                code: "missing_file",
                path: normalizedPath,
                hint: `Create ${normalizedPath} with write_file first.`,
            });
        }
        this.assertBaseRevisionMatchesCurrent(before, true, input.baseRevision, normalizedPath);
        await this.captureUndoSnapshotWithBaseline(normalizedPath, before, true);
        let after;
        let changedLineCount = 0;
        try {
            const applied = (0, cutie_file_patch_1.applyLineEditsToText)(before, input.edits || []);
            after = applied.after;
            changedLineCount = applied.changedLineCount;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new CutieWorkspaceToolError(`invalid_patch for ${normalizedPath}: ${message}`, {
                code: "invalid_patch",
                path: normalizedPath,
                currentRevisionId: toCurrentRevisionId(before, true),
                hint: `Use line edits that match the current ${normalizedPath} line layout.`,
            });
        }
        const uri = vscode.Uri.file(absolutePath);
        await this.replaceEntireFileViaWorkspace(uri, after, normalizedPath);
        return {
            path: normalizedPath,
            editCount: input.edits.length,
            revisionId: toCurrentRevisionId(after, true),
            previousContent: before,
            nextContent: after,
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
        const { text: previousContent, existed } = await this.readUtf8Baseline(absolutePath, normalizedPath);
        this.assertBaseRevisionMatchesCurrent(previousContent, existed, input.baseRevision, normalizedPath);
        await this.captureUndoSnapshotWithBaseline(normalizedPath, previousContent, existed);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const uri = vscode.Uri.file(absolutePath);
        const nextContent = String(input.content || "");
        if (!existed) {
            await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(nextContent, "utf8")));
        }
        else {
            await this.replaceEntireFileViaWorkspace(uri, nextContent, normalizedPath);
        }
        return {
            path: normalizedPath,
            bytes: Buffer.byteLength(nextContent, "utf8"),
            revisionId: toCurrentRevisionId(nextContent, true),
            previousContent,
            nextContent,
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
    async captureUndoSnapshotWithBaseline(filePath, baselineText, existed) {
        if (!this.checkpoint) {
            this.createCheckpoint("Automatic checkpoint before workspace mutation.");
        }
        if (!this.checkpoint)
            return;
        if (this.checkpoint.files.some((entry) => entry.path === filePath))
            return;
        this.checkpoint.files.push({
            path: filePath,
            existed,
            content: baselineText,
        });
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
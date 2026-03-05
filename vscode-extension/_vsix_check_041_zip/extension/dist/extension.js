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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const patch_utils_1 = require("./patch-utils");
const API_KEY_SECRET = "xpersona.apiKey";
const MODE_KEY = "xpersona.playground.mode";
const SAFETY_KEY = "xpersona.playground.safety";
const OPEN_THREADS_KEY = "xpersona.playground.openThreads";
const PINNED_THREADS_KEY = "xpersona.playground.pinnedThreads";
const EXECUTION_POLICY_CONFIG_KEY = "executionPolicy";
const MENTIONS_ENABLED_FLAG = "mentions.enabled";
const DEFAULT_PLAYGROUND_MODEL = "Playground 1";
const IDE_CONTEXT_FLAG = "xpersona.playground.ideContextV2";
const MAX_TOTAL_CONTEXT_CHARS = 350000;
const INDEX_MAX_FILE_SIZE = 250 * 1024;
const INDEX_CHUNK_SIZE = 1200;
const INDEX_CHUNK_OVERLAP = 180;
const INDEX_BATCH_SIZE = 400;
const INDEX_AUTO_INTERVAL_MS = 5 * 60 * 1000;
const ATTACHMENT_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_ATTACHMENTS_PER_REQUEST = 3;
const MAX_ATTACHMENT_DATAURL_CHARS = 8000000;
function sanitizeAssistAttachments(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== "object")
            continue;
        const mimeType = typeof item.mimeType === "string"
            ? item.mimeType.trim().toLowerCase()
            : "";
        const dataUrl = typeof item.dataUrl === "string"
            ? item.dataUrl.trim()
            : "";
        if (!ATTACHMENT_MIME_TYPES.has(mimeType))
            continue;
        if (!dataUrl || dataUrl.length > MAX_ATTACHMENT_DATAURL_CHARS)
            continue;
        if (!new RegExp(`^data:${mimeType};base64,`, "i").test(dataUrl))
            continue;
        const nameRaw = typeof item.name === "string" ? item.name.trim() : "";
        const name = nameRaw ? nameRaw.slice(0, 255) : undefined;
        out.push({
            mimeType: mimeType,
            dataUrl,
            ...(name ? { name } : {}),
        });
        if (out.length >= MAX_ATTACHMENTS_PER_REQUEST)
            break;
    }
    return out;
}
function normalizeWorkspaceRelativePath(input) {
    const trimmed = input.replace(/\\/g, "/").trim();
    if (!trimmed || trimmed.startsWith("/") || /^[a-z]:\//i.test(trimmed) || trimmed.includes(".."))
        return null;
    return trimmed;
}
function chunkText(content, chunkSize, overlap) {
    const text = content.replace(/\r\n/g, "\n");
    const chunks = [];
    let i = 0;
    while (i < text.length) {
        const end = Math.min(text.length, i + chunkSize);
        chunks.push(text.slice(i, end));
        if (end >= text.length)
            break;
        i = Math.max(i + 1, end - overlap);
    }
    return chunks;
}
function trimContextToMaxChars(ctx, maxChars) {
    const clone = {
        activeFile: ctx.activeFile ? { ...ctx.activeFile } : undefined,
        openFiles: [...(ctx.openFiles ?? [])],
        diagnostics: [...(ctx.diagnostics ?? [])],
        git: ctx.git ? { ...ctx.git } : undefined,
        indexedSnippets: [...(ctx.indexedSnippets ?? [])],
    };
    const size = () => JSON.stringify(clone).length;
    if (size() <= maxChars)
        return clone;
    while ((clone.openFiles?.length ?? 0) > 0 && size() > maxChars)
        clone.openFiles?.pop();
    while ((clone.indexedSnippets?.length ?? 0) > 0 && size() > maxChars)
        clone.indexedSnippets?.pop();
    while ((clone.diagnostics?.length ?? 0) > 0 && size() > maxChars)
        clone.diagnostics?.pop();
    if (size() > maxChars && clone.activeFile?.content) {
        clone.activeFile.content = clone.activeFile.content.slice(0, 12000);
    }
    return clone;
}
function execFileReadOnly(cmd, args, cwd, timeoutMs, maxBuffer) {
    return new Promise((resolve) => {
        (0, child_process_1.execFile)(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout, stderr) => {
            if (error)
                return resolve({ ok: false, stdout: String(stdout || ""), stderr: String(stderr || error.message || "") });
            resolve({ ok: true, stdout: String(stdout || ""), stderr: String(stderr || "") });
        });
    });
}
function sha(input) {
    return (0, crypto_1.createHash)("sha1").update(input).digest("hex");
}
function toRelPath(root, file) {
    return path.posix.normalize(path.posix.relative(root.path, file.path)).replace(/^\/+/, "");
}
function languageFromPath(p) {
    const ext = (path.extname(p || "").replace(/^\./, "").toLowerCase() || "text");
    return ext;
}
function activate(context) {
    const view = new Provider(context);
    const reg = vscode.window.registerWebviewViewProvider("xpersona.playgroundView", view);
    const cmds = [
        vscode.commands.registerCommand("xpersona.playground.prompt", () => view.show()),
        vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
            const e = vscode.window.activeTextEditor;
            if (!e)
                return;
            const t = e.selection.isEmpty ? e.document.lineAt(e.selection.active.line).text : e.document.getText(e.selection);
            await view.show(t.trim());
        }),
        vscode.commands.registerCommand("xpersona.playground.setApiKey", () => view.setApiKey()),
        vscode.commands.registerCommand("xpersona.playground.mode.auto", () => view.setMode("auto")),
        vscode.commands.registerCommand("xpersona.playground.mode.plan", () => view.setMode("plan")),
        vscode.commands.registerCommand("xpersona.playground.mode.yolo", () => view.setMode("yolo")),
        vscode.commands.registerCommand("xpersona.playground.mode.cycle", () => view.cycleMode()),
        vscode.commands.registerCommand("xpersona.playground.generate", async () => {
            const t = await vscode.window.showInputBox({ prompt: "Generate task" });
            if (t)
                view.ask(t, false);
        }),
        vscode.commands.registerCommand("xpersona.playground.debug", async () => {
            const t = await vscode.window.showInputBox({ prompt: "Debug task" });
            if (t)
                view.ask(t, false);
        }),
        vscode.commands.registerCommand("xpersona.playground.history.open", () => view.loadHistory()),
        vscode.commands.registerCommand("xpersona.playground.image.attach", async () => {
            await view.openImagePicker();
        }),
        vscode.commands.registerCommand("xpersona.playground.agents.parallelRun", async () => {
            const t = await vscode.window.showInputBox({ prompt: "Parallel task" });
            if (t)
                view.ask(t, true);
        }),
        vscode.commands.registerCommand("xpersona.playground.index.rebuild", async () => {
            await view.show();
            await view.rebuildIndex("commandPalette");
        }),
        vscode.commands.registerCommand("xpersona.playground.replay.session", () => view.replay()),
    ];
    context.subscriptions.push(reg, ...cmds);
}
function deactivate() { }
class Provider {
    hasExecutionIntent(task) {
        return /\b(create|make|add|build|implement|refactor|fix|debug|run|test|lint|typecheck|command|file|patch|edit|ship)\b/i.test(task);
    }
    hasExplicitCommandRunIntent(task) {
        return /\b(run|execute|terminal|shell|command|test|tests|lint|typecheck|build|compile|install|npm|pnpm|yarn|pytest|jest|vitest|cargo|go test|mvn|gradle)\b/i.test(task);
    }
    hasCodeTaskSignals(task) {
        return (/\b(code|file|function|class|bug|error|fix|refactor|implement|build|test|lint|typecheck|stack trace|exception|module|api|endpoint|sql|schema|patch|edit|python|javascript|typescript)\b/i.test(task) ||
            /\b[a-zA-Z0-9_./-]+\.[a-z0-9]{1,8}\b/i.test(task));
    }
    isConversationalPrompt(task) {
        const t = task.trim().toLowerCase();
        const greetingOrSmallTalk = /^(hi|hello|hey|yo|sup|thanks|thank you|thx)\b/.test(t) ||
            /\b(how are you|what can you do|who are you)\b/.test(t);
        const directQuestion = /\?$/.test(t) ||
            /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(t) ||
            /\b(explain|define|tell me)\b/.test(t);
        return (greetingOrSmallTalk ||
            (directQuestion && !this.hasCodeTaskSignals(t)));
    }
    constructor(ctx) {
        this.ctx = ctx;
        this.activeThreadId = null;
        this.threads = {};
        this.openThreadOrder = [];
        this.recentHistory = [];
        this.pinnedThreadIds = new Set();
        this.sessionId = null;
        this.timeline = [];
        this.pendingActions = [];
        this.lastRunMeta = null;
        this.activeStreamCancel = null;
        this.cancelRequested = false;
        this.commandTerminal = null;
        this.lastPlanModeNoticeAt = 0;
        this.mentionCatalog = [];
        this.mentionCatalogAt = 0;
        this.indexRunning = false;
        this.indexFreshness = "cold";
        this.lastIndexAt = 0;
        this.indexTimer = null;
        this.indexDebounceTimer = null;
        this.mode = ctx.workspaceState.get(MODE_KEY) ?? "auto";
        this.safety = ctx.workspaceState.get(SAFETY_KEY) ?? "standard";
        this.modeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
        this.modeStatusItem.command = "xpersona.playground.mode.cycle";
        this.ctx.subscriptions.push(this.modeStatusItem);
        this.updateModeStatusItem();
        const persisted = ctx.workspaceState.get(OPEN_THREADS_KEY, null);
        if (persisted?.openChats?.length) {
            for (const thread of persisted.openChats) {
                if (!thread?.id)
                    continue;
                this.threads[thread.id] = {
                    id: thread.id,
                    title: thread.title || "New chat",
                    mode: thread.mode || "auto",
                    updatedAt: thread.updatedAt || null,
                    isOpen: true,
                };
            }
            this.openThreadOrder = persisted.openChats.map((x) => x.id).filter((id) => this.threads[id]);
            this.activeThreadId = persisted.activeThreadId && this.threads[persisted.activeThreadId]
                ? persisted.activeThreadId
                : (this.openThreadOrder[0] || null);
        }
        const pinned = ctx.workspaceState.get(PINNED_THREADS_KEY, []);
        if (Array.isArray(pinned)) {
            for (const id of pinned) {
                if (typeof id === "string" && id.trim())
                    this.pinnedThreadIds.add(id.trim());
            }
        }
        this.setupBackgroundIndexing();
    }
    modeStatusPresentation(mode) {
        if (mode === "plan") {
            return {
                text: "$(checklist) Playground: Plan",
                tooltip: "Plan mode is active. Click to cycle mode.",
                color: new vscode.ThemeColor("statusBarItem.prominentForeground"),
                backgroundColor: new vscode.ThemeColor("statusBarItem.prominentBackground"),
            };
        }
        if (mode === "yolo") {
            return {
                text: "$(warning) Playground: Full",
                tooltip: "Full access mode is active. Click to cycle mode.",
                color: new vscode.ThemeColor("statusBarItem.warningForeground"),
                backgroundColor: new vscode.ThemeColor("statusBarItem.warningBackground"),
            };
        }
        return {
            text: "$(sparkle) Playground: Auto",
            tooltip: "Auto mode is active. Click to cycle mode.",
        };
    }
    updateModeStatusItem() {
        const presentation = this.modeStatusPresentation(this.mode);
        this.modeStatusItem.text = presentation.text;
        this.modeStatusItem.tooltip = presentation.tooltip;
        this.modeStatusItem.color = presentation.color;
        this.modeStatusItem.backgroundColor = presentation.backgroundColor;
        this.modeStatusItem.show();
    }
    isIdeContextV2Enabled() {
        return ((vscode.workspace.getConfiguration().get(IDE_CONTEXT_FLAG) ?? true) &&
            (vscode.workspace.getConfiguration("xpersona.playground").get("ideContextV2") ?? true));
    }
    getExecutionPolicy() {
        const configured = vscode.workspace
            .getConfiguration("xpersona.playground")
            .get(EXECUTION_POLICY_CONFIG_KEY);
        if (configured === "preview_first" || configured === "yolo_only" || configured === "full_auto") {
            return configured;
        }
        return "full_auto";
    }
    mentionsEnabled() {
        return vscode.workspace.getConfiguration("xpersona.playground").get(MENTIONS_ENABLED_FLAG) ?? true;
    }
    deriveThreadTitle(input) {
        const raw = String(input || "").replace(/\s+/g, " ").trim();
        if (!raw)
            return "New chat";
        const compact = raw
            .replace(/^(hi|hello|hey|please|pls|can you|could you|would you)\b[:,\s-]*/i, "")
            .replace(/\b(for me|please)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim();
        const candidate = (compact || raw).slice(0, 60).trim();
        if (!candidate)
            return "New chat";
        return candidate[0].toUpperCase() + candidate.slice(1);
    }
    sortOpenThreadIds(ids) {
        return ids.slice().sort((a, b) => {
            const aPinned = this.pinnedThreadIds.has(a) ? 1 : 0;
            const bPinned = this.pinnedThreadIds.has(b) ? 1 : 0;
            if (aPinned !== bPinned)
                return bPinned - aPinned;
            const aTime = this.threads[a]?.updatedAt ? new Date(this.threads[a].updatedAt).getTime() : 0;
            const bTime = this.threads[b]?.updatedAt ? new Date(this.threads[b].updatedAt).getTime() : 0;
            return bTime - aTime;
        });
    }
    async persistPinnedThreads() {
        await this.ctx.workspaceState.update(PINNED_THREADS_KEY, Array.from(this.pinnedThreadIds));
    }
    async setThreadPinned(id, pinned) {
        const threadId = String(id || "").trim();
        if (!threadId)
            return;
        if (pinned)
            this.pinnedThreadIds.add(threadId);
        else
            this.pinnedThreadIds.delete(threadId);
        await this.persistPinnedThreads();
        await this.postThreadState();
    }
    async searchWorkspaceMentions(rawQuery, rawLimit) {
        const root = this.getWorkspaceRoot();
        if (!root)
            return [];
        const query = String(rawQuery || "").replace(/\\/g, "/").trim().toLowerCase();
        const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 12, 30));
        const catalogFresh = Date.now() - this.mentionCatalogAt < 15000;
        if (!catalogFresh || this.mentionCatalog.length === 0) {
            const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, "**/*"), new vscode.RelativePattern(root, "**/{node_modules,.git,.next,dist,build}/**"), 3000);
            const folderSet = new Set();
            const items = [];
            for (const uri of files) {
                const rel = toRelPath(root.uri, uri);
                const safe = normalizeWorkspaceRelativePath(rel);
                if (!safe)
                    continue;
                items.push({ path: safe, kind: "file" });
                const parts = safe.split("/").filter(Boolean);
                for (let i = 1; i < parts.length; i += 1) {
                    folderSet.add(parts.slice(0, i).join("/"));
                }
            }
            for (const folder of folderSet)
                items.push({ path: folder, kind: "folder" });
            this.mentionCatalog = items;
            this.mentionCatalogAt = Date.now();
        }
        const rank = (candidate) => {
            const c = candidate.toLowerCase();
            const base = path.posix.basename(c);
            if (!query)
                return 1000 - c.length;
            if (base === query)
                return 1300 - c.length;
            if (c === query)
                return 1200 - c.length;
            if (base.startsWith(query))
                return 1100 - c.length;
            if (c.startsWith(query))
                return 900 - c.length;
            if (c.split("/").some((segment) => segment.startsWith(query)))
                return 700 - c.length;
            if (base.includes(query))
                return 620 - c.length;
            if (c.includes(query))
                return 500 - c.length;
            const qParts = query.split("/").filter(Boolean);
            if (qParts.length && qParts.every((part) => c.includes(part)))
                return 350 - c.length;
            return -1;
        };
        return this.mentionCatalog
            .map((item) => ({ item, score: rank(item.path) }))
            .filter((row) => row.score >= 0)
            .sort((a, b) => {
            if (a.score !== b.score)
                return b.score - a.score;
            if (a.item.kind !== b.item.kind)
                return a.item.kind === "folder" ? -1 : 1;
            return a.item.path.localeCompare(b.item.path);
        })
            .slice(0, limit)
            .map((row) => row.item);
    }
    setupBackgroundIndexing() {
        const triggerDebounced = () => {
            this.mentionCatalogAt = 0;
            if (this.indexDebounceTimer)
                clearTimeout(this.indexDebounceTimer);
            this.indexDebounceTimer = setTimeout(() => {
                void this.runBackgroundIndexing("debounced");
            }, 1200);
        };
        this.ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => triggerDebounced()), vscode.workspace.onDidSaveTextDocument(() => triggerDebounced()), vscode.workspace.onDidOpenTextDocument(() => triggerDebounced()));
        this.indexTimer = setInterval(() => {
            void this.runBackgroundIndexing("interval");
        }, INDEX_AUTO_INTERVAL_MS);
        this.ctx.subscriptions.push({ dispose: () => this.indexTimer && clearInterval(this.indexTimer) });
        void this.runBackgroundIndexing("startup");
    }
    getWorkspaceRoot() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0)
            return null;
        return folders[0];
    }
    async collectIdeContext(query, workspaceHash, key) {
        const root = this.getWorkspaceRoot();
        const activeFile = await this.collectActiveFileContext(20000);
        const openFiles = await this.collectOpenEditorsContext(20, 6000);
        const diagnostics = this.collectDiagnostics(200);
        const git = await this.collectGitSummary(root);
        const discovery = await this.runSafeDiscovery(root);
        const indexedSnippets = await this.queryIndexForPrompt(workspaceHash, query, key, 12);
        const mergedSnippets = [...indexedSnippets];
        if (discovery.rgFiles) {
            mergedSnippets.push({
                path: ".workspace/files",
                score: 0.3,
                content: discovery.rgFiles,
            });
        }
        return trimContextToMaxChars({
            activeFile: activeFile || undefined,
            openFiles,
            diagnostics,
            git: {
                status: [...(git.status || []), ...(discovery.gitStatus || [])].slice(0, 200),
                diffSummary: [git.diffSummary, discovery.gitDiff].filter(Boolean).join("\n").slice(0, 120000),
            },
            indexedSnippets: mergedSnippets,
        }, MAX_TOTAL_CONTEXT_CHARS);
    }
    async collectActiveFileContext(maxChars) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return null;
        const document = editor.document;
        const fullText = document.getText();
        const selected = editor.selection.isEmpty ? "" : document.getText(editor.selection).slice(0, 6000);
        return {
            path: document.uri.fsPath,
            language: document.languageId,
            selection: selected || undefined,
            content: fullText.slice(0, maxChars),
        };
    }
    async collectOpenEditorsContext(maxEditors, maxCharsPerFile) {
        const editors = vscode.window.visibleTextEditors.slice(0, maxEditors);
        const unique = new Set();
        const out = [];
        for (const e of editors) {
            const p = e.document.uri.fsPath;
            if (!p || unique.has(p))
                continue;
            unique.add(p);
            out.push({
                path: p,
                language: e.document.languageId,
                excerpt: e.document.getText().slice(0, maxCharsPerFile),
            });
        }
        return out;
    }
    collectDiagnostics(maxItems) {
        const all = vscode.languages.getDiagnostics();
        const out = [];
        for (const [uri, diagnostics] of all) {
            for (const d of diagnostics) {
                out.push({
                    file: uri.fsPath,
                    severity: d.severity,
                    message: d.message,
                    line: d.range.start.line + 1,
                });
                if (out.length >= maxItems)
                    return out;
            }
        }
        return out;
    }
    async collectGitSummary(root) {
        if (!root)
            return { status: [], diffSummary: "" };
        const cwd = root.uri.fsPath;
        const status = await execFileReadOnly("git", ["status", "--short"], cwd, 2500, 12000);
        const diff = await execFileReadOnly("git", ["diff", "--stat"], cwd, 2500, 12000);
        return {
            status: status.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 200),
            diffSummary: (diff.stdout || "").slice(0, 12000),
        };
    }
    async runSafeDiscovery(root) {
        if (!root)
            return {};
        const cwd = root.uri.fsPath;
        const gitStatus = await execFileReadOnly("git", ["status", "--short"], cwd, 2500, 12000);
        const gitDiff = await execFileReadOnly("git", ["diff", "--stat"], cwd, 2500, 12000);
        const rgFiles = await execFileReadOnly("rg", ["--files", "--hidden", "-g", "!node_modules", "-g", "!.git"], cwd, 3000, 12000);
        return {
            gitStatus: gitStatus.ok ? gitStatus.stdout.split(/\r?\n/).filter(Boolean).slice(0, 200) : [],
            gitDiff: gitDiff.ok ? gitDiff.stdout.slice(0, 12000) : "",
            rgFiles: rgFiles.ok ? rgFiles.stdout.split(/\r?\n/).slice(0, 300).join("\n") : "",
        };
    }
    async queryIndexForPrompt(projectKey, query, key, limit) {
        try {
            const response = await req("POST", `${base()}/api/v1/playground/index/query`, key, {
                projectKey,
                query: query.slice(0, 2000),
                limit: Math.max(1, Math.min(limit, 50)),
            });
            const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
            return rows
                .map((r) => ({
                path: String(r.pathDisplay || r.path || ""),
                score: typeof r.score === "number" ? r.score : undefined,
                content: String(r.content || "").slice(0, 60000),
            }))
                .filter((x) => x.content.length > 0)
                .slice(0, limit);
        }
        catch {
            return [];
        }
    }
    async runBackgroundIndexing(trigger) {
        if (!this.isIdeContextV2Enabled())
            return { status: "disabled", chunks: 0, message: "IDE context indexing is disabled." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "no-workspace", chunks: 0, message: "Open a workspace folder to build an index." };
        if (this.indexRunning)
            return { status: "busy", chunks: 0, message: "Index build already in progress." };
        this.indexRunning = true;
        try {
            const include = "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,java,cs,yaml,yml}";
            const exclude = "**/{node_modules,.git,.next,dist,build}/**";
            const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, include), new vscode.RelativePattern(root, exclude), 800);
            const chunks = [];
            for (const file of files) {
                try {
                    const stat = await vscode.workspace.fs.stat(file);
                    if (stat.type !== vscode.FileType.File || stat.size > INDEX_MAX_FILE_SIZE)
                        continue;
                    const doc = await vscode.workspace.openTextDocument(file);
                    const rel = toRelPath(root.uri, file);
                    const relNorm = normalizeWorkspaceRelativePath(rel);
                    if (!relNorm)
                        continue;
                    const text = doc.getText();
                    for (const chunk of chunkText(text, INDEX_CHUNK_SIZE, INDEX_CHUNK_OVERLAP)) {
                        const trimmed = chunk.trim();
                        if (!trimmed)
                            continue;
                        chunks.push({
                            pathHash: sha(relNorm),
                            chunkHash: sha(`${relNorm}:${trimmed}`),
                            pathDisplay: relNorm,
                            content: trimmed,
                            metadata: { language: doc.languageId || languageFromPath(relNorm), trigger },
                        });
                    }
                }
                catch {
                    // Ignore per-file failures.
                }
            }
            if (!chunks.length) {
                this.indexFreshness = "stale";
                return { status: "no-chunks", chunks: 0, message: "No indexable files found." };
            }
            const workspaceHash = this.computeWorkspaceHash(root);
            const key = await this.ctx.secrets.get(API_KEY_SECRET);
            if (!key)
                return { status: "no-key", chunks: 0, message: "Set your API key before rebuilding index." };
            for (let i = 0; i < chunks.length; i += INDEX_BATCH_SIZE) {
                const batch = chunks.slice(i, i + INDEX_BATCH_SIZE);
                await req("POST", `${base()}/api/v1/playground/index/upsert`, key, {
                    projectKey: workspaceHash,
                    chunks: batch,
                    cursor: `${Date.now()}:${i}`,
                    stats: { trigger, totalChunks: chunks.length },
                }).catch(() => ({}));
            }
            this.lastIndexAt = Date.now();
            this.indexFreshness = "fresh";
            this.post({
                type: "indexState",
                data: {
                    chunks: chunks.length,
                    freshness: this.indexFreshness,
                    lastQueryMatches: 0,
                    lastRebuildAt: new Date(this.lastIndexAt).toLocaleTimeString(),
                },
            });
            return { status: "ok", chunks: chunks.length };
        }
        catch (e) {
            this.indexFreshness = "stale";
            return { status: "error", chunks: 0, message: err(e) };
        }
        finally {
            this.indexRunning = false;
            if (Date.now() - this.lastIndexAt > INDEX_AUTO_INTERVAL_MS * 2) {
                this.indexFreshness = "stale";
            }
        }
    }
    async rebuildIndex(source = "webview") {
        if (!this.isIdeContextV2Enabled()) {
            this.post({ type: "status", text: "Workspace indexing is disabled. Enable xpersona.playground.ideContextV2 to rebuild." });
            return;
        }
        if (!this.getWorkspaceRoot()) {
            this.post({ type: "status", text: "Open a workspace folder first, then retry index rebuild." });
            return;
        }
        if (this.indexRunning) {
            this.post({ type: "status", text: "Index rebuild already running." });
            return;
        }
        this.post({
            type: "indexState",
            data: { chunks: 0, freshness: "rebuilding", lastQueryMatches: 0, lastRebuildAt: new Date().toLocaleTimeString() },
        });
        this.post({ type: "status", text: `Rebuilding semantic index (${source})...` });
        const result = await this.runBackgroundIndexing("manual");
        if (result.status === "ok") {
            this.post({ type: "status", text: `Index rebuild complete. ${result.chunks} chunks indexed.` });
            return;
        }
        if (result.status === "no-key") {
            this.post({ type: "status", text: "Set your API key before rebuilding workspace index." });
            return;
        }
        if (result.status === "no-chunks") {
            this.post({
                type: "indexState",
                data: { chunks: 0, freshness: "stale", lastQueryMatches: 0, lastRebuildAt: new Date().toLocaleTimeString() },
            });
            this.post({ type: "status", text: "Index rebuild finished but no supported source files were found." });
            return;
        }
        if (result.status === "busy") {
            this.post({ type: "status", text: "Index rebuild already running." });
            return;
        }
        if (result.status === "disabled") {
            this.post({ type: "status", text: "Workspace indexing is disabled." });
            return;
        }
        if (result.status === "no-workspace") {
            this.post({ type: "status", text: "Open a workspace folder first, then retry index rebuild." });
            return;
        }
        this.post({ type: "err", text: `Index rebuild failed: ${result.message || "unknown error"}` });
    }
    computeWorkspaceHash(root) {
        if (!root)
            return "single-file";
        const seed = `${root.name}:${root.uri.fsPath}`;
        return sha(seed).slice(0, 32);
    }
    threadFromApiRow(x) {
        return {
            id: String(x?.id || ""),
            title: String(x?.title || "Untitled"),
            mode: (x?.mode || "auto"),
            updatedAt: x?.updatedAt || x?.updated_at || x?.createdAt || x?.created_at || null,
            isOpen: false,
        };
    }
    upsertThread(thread, open) {
        const existing = this.threads[thread.id];
        this.threads[thread.id] = {
            id: thread.id,
            title: thread.title || existing?.title || "New chat",
            mode: thread.mode || existing?.mode || "auto",
            updatedAt: thread.updatedAt || existing?.updatedAt || null,
            isOpen: open || existing?.isOpen || false,
        };
        if (open && !this.openThreadOrder.includes(thread.id))
            this.openThreadOrder.unshift(thread.id);
        this.openThreadOrder = this.sortOpenThreadIds(this.openThreadOrder);
        if (!open)
            this.threads[thread.id].isOpen = false;
    }
    async persistOpenThreads() {
        this.openThreadOrder = this.sortOpenThreadIds(this.openThreadOrder);
        const openChats = this.openThreadOrder
            .map((id) => this.threads[id])
            .filter((x) => Boolean(x))
            .map((x) => ({ ...x, isOpen: true }));
        await this.ctx.workspaceState.update(OPEN_THREADS_KEY, {
            activeThreadId: this.activeThreadId,
            openChats,
        });
    }
    async postThreadState() {
        this.openThreadOrder = this.sortOpenThreadIds(this.openThreadOrder);
        this.post({
            type: "threadState",
            data: {
                activeThreadId: this.activeThreadId,
                openChats: this.openThreadOrder
                    .map((id) => this.threads[id])
                    .filter((x) => Boolean(x))
                    .map((x) => ({ ...x, isOpen: true })),
                recentHistory: this.recentHistory,
                pinnedIds: Array.from(this.pinnedThreadIds),
            },
        });
        await this.persistOpenThreads();
    }
    async ensureActiveThread(key, title) {
        if (this.activeThreadId && this.threads[this.activeThreadId])
            return this.activeThreadId;
        const sessionTitle = this.deriveThreadTitle(title);
        const s = await req("POST", `${base()}/api/v1/playground/sessions`, key, {
            title: sessionTitle,
            mode: this.mode,
        }).catch(() => ({}));
        const id = s?.data?.id ? String(s.data.id) : null;
        if (!id)
            return null;
        this.upsertThread({ id, title: sessionTitle, mode: this.mode, updatedAt: new Date().toISOString(), isOpen: true }, true);
        this.activeThreadId = id;
        this.sessionId = id;
        await this.postThreadState();
        return id;
    }
    resolveWebviewView(v) {
        this.view = v;
        const mediaRoot = vscode.Uri.joinPath(this.ctx.extensionUri, "media");
        v.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
        v.webview.html = html(v.webview, this.ctx.extensionUri);
        v.webview.onDidReceiveMessage(async (m) => {
            if (m.type === "check") {
                let hasKey = false;
                try {
                    const k = await this.ctx.secrets.get(API_KEY_SECRET);
                    hasKey = !!k;
                }
                catch (e) {
                    this.post({ type: "err", text: `Failed to read API key: ${err(e)}` });
                }
                this.post({ type: "api", ok: hasKey });
                this.post({ type: "mode", value: this.mode });
                this.updateModeStatusItem();
                this.post({ type: "safety", value: this.safety });
                this.post({ type: "timeline", data: this.timeline });
                this.post({ type: "pendingActions", count: this.pendingActions.length });
                this.post({ type: "mentionsConfig", enabled: this.mentionsEnabled() });
                await this.postThreadState();
            }
            else if (m.type === "saveKey") {
                if (m.key?.trim())
                    await this.ctx.secrets.store(API_KEY_SECRET, m.key.trim());
                this.post({ type: "api", ok: true });
                await this.loadHistory();
            }
            else if (m.type === "setMode") {
                await this.setMode(m.value);
            }
            else if (m.type === "setSafety") {
                await this.setSafety(m.value);
            }
            else if (m.type === "send") {
                this.post({ type: "sendAck" });
                const attachments = sanitizeAssistAttachments(m.attachments);
                if (Array.isArray(m.attachments) && m.attachments.length > attachments.length) {
                    this.post({ type: "status", text: "Some image attachments were skipped because they were invalid or unsupported." });
                }
                await this.ask(String(m.text || ""), Boolean(m.parallel), String(m.model || DEFAULT_PLAYGROUND_MODEL), String(m.reasoning || "medium"), {
                    includeIdeContext: m.includeIdeContext !== undefined ? Boolean(m.includeIdeContext) : true,
                    workspaceContextLevel: (m.workspaceContextLevel === "max" ? "max" : "max"),
                    attachments,
                });
            }
            else if (m.type === "cancel") {
                if (!this.activeStreamCancel) {
                    this.post({ type: "status", text: "Nothing to cancel right now." });
                    return;
                }
                this.cancelRequested = true;
                this.activeStreamCancel();
                this.post({ type: "status", text: "Stopping response..." });
            }
            else if (m.type === "history") {
                await this.loadHistory();
            }
            else if (m.type === "openSession") {
                await this.openSession(String(m.id || ""));
            }
            else if (m.type === "newThread") {
                await this.newThread();
            }
            else if (m.type === "switchThread") {
                await this.switchThread(String(m.id || ""));
            }
            else if (m.type === "closeThread") {
                await this.closeThread(String(m.id || ""));
            }
            else if (m.type === "replay") {
                await this.replay();
            }
            else if (m.type === "indexRebuild") {
                await this.rebuildIndex("webview");
            }
            else if (m.type === "planDecision") {
                this.post({
                    type: "status",
                    text: String(m.decision || "") === "yes" ? "Plan approved. Proceeding with implementation request." : "Plan feedback mode enabled.",
                });
            }
            else if (m.type === "clear") {
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
                this.post({ type: "status", text: "Cleared current chat view." });
            }
            else if (m.type === "execute") {
                await this.executePendingActions();
            }
            else if (m.type === "mentionSearch") {
                if (!this.mentionsEnabled()) {
                    this.post({ type: "mentionResults", query: String(m.query || ""), items: [] });
                    return;
                }
                const items = await this.searchWorkspaceMentions(String(m.query || ""), Number(m.limit || 12)).catch(() => []);
                this.post({ type: "mentionResults", query: String(m.query || ""), items });
            }
            else if (m.type === "pinThread") {
                await this.setThreadPinned(String(m.id || ""), Boolean(m.pinned));
            }
        });
    }
    async show(prefill) {
        await vscode.commands.executeCommand("workbench.view.extension.xpersona").then(undefined, () => { });
        await vscode.commands.executeCommand("xpersona.playgroundView.focus").then(undefined, () => { });
        if (prefill)
            this.post({ type: "prefill", text: prefill });
    }
    async openImagePicker() {
        await this.show();
        await new Promise((resolve) => setTimeout(resolve, 60));
        this.post({ type: "openUploadPicker" });
    }
    async setApiKey() {
        const k = await vscode.window.showInputBox({ title: "API key", password: true });
        if (!k?.trim())
            return;
        await this.ctx.secrets.store(API_KEY_SECRET, k.trim());
        this.post({ type: "api", ok: true });
    }
    async cycleMode() {
        const nextMode = this.mode === "auto" ? "plan" : this.mode === "plan" ? "yolo" : "auto";
        await this.setMode(nextMode);
    }
    async setMode(m) {
        const normalized = m === "plan" || m === "yolo" ? m : "auto";
        const changed = this.mode !== normalized;
        this.mode = normalized;
        await this.ctx.workspaceState.update(MODE_KEY, normalized);
        this.post({ type: "mode", value: normalized });
        this.updateModeStatusItem();
        if (normalized === "plan") {
            const now = Date.now();
            if (changed || now - this.lastPlanModeNoticeAt > 4000) {
                this.lastPlanModeNoticeAt = now;
                this.post({ type: "status", text: "Plan mode enabled." });
                vscode.window.setStatusBarMessage("Playground AI: Plan mode enabled", 2500);
            }
        }
    }
    async setSafety(s) {
        this.safety = s;
        await this.ctx.workspaceState.update(SAFETY_KEY, s);
        this.post({ type: "safety", value: s });
    }
    async ask(text, parallel, model = DEFAULT_PLAYGROUND_MODEL, reasoning = "medium", options = {}) {
        if (!text.trim())
            return;
        if (this.activeStreamCancel) {
            this.post({ type: "status", text: "Already responding. Stop the current run before sending another message." });
            return;
        }
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key)
            return this.post({ type: "err", text: "No API key set" });
        this.cancelRequested = false;
        this.pendingActions = [];
        this.lastRunMeta = null;
        this.post({ type: "pendingActions", count: 0 });
        this.post({ type: "start" });
        this.addTimeline("intent", text.slice(0, 120));
        const conversational = this.isConversationalPrompt(text);
        if (!conversational) {
            this.post({ type: "status", text: `Model: ${model} | Reasoning: ${reasoning}` });
        }
        // Keep the user task clean so mode classification is based on intent,
        // not runtime metadata injected into the prompt body.
        const taskWithReasoning = text;
        const requestMode = conversational ? "generate" : this.mode;
        const ideContextEnabled = this.isIdeContextV2Enabled() && (options.includeIdeContext ?? true);
        const root = this.getWorkspaceRoot();
        const workspaceHash = this.computeWorkspaceHash(root);
        const preflightStarted = Date.now();
        let collectedContext;
        let contextStatus = {
            enabled: ideContextEnabled,
            sections: 0,
            snippets: 0,
            indexFreshness: this.indexFreshness,
            discoveryCommands: 0,
            preflightMs: 0,
            notes: [],
        };
        if (ideContextEnabled) {
            try {
                collectedContext = await this.collectIdeContext(text, workspaceHash, key);
                const sectionCount = [
                    collectedContext.activeFile ? 1 : 0,
                    (collectedContext.openFiles?.length ?? 0) > 0 ? 1 : 0,
                    (collectedContext.diagnostics?.length ?? 0) > 0 ? 1 : 0,
                    collectedContext.git ? 1 : 0,
                    (collectedContext.indexedSnippets?.length ?? 0) > 0 ? 1 : 0,
                ].reduce((acc, v) => acc + v, 0);
                contextStatus = {
                    ...contextStatus,
                    sections: sectionCount,
                    snippets: collectedContext.indexedSnippets?.length ?? 0,
                    indexFreshness: this.indexFreshness,
                    discoveryCommands: (collectedContext.git?.status?.length ?? 0) > 0 || collectedContext.git?.diffSummary ? 3 : 0,
                };
            }
            catch (e) {
                contextStatus.notes?.push(`context partial: ${err(e)}`);
            }
        }
        contextStatus.preflightMs = Date.now() - preflightStarted;
        this.post({ type: "contextStatus", data: contextStatus });
        if (contextStatus.notes?.length) {
            this.post({ type: "status", text: contextStatus.notes.join(" | ") });
        }
        const activeThreadId = await this.ensureActiveThread(key, text);
        if (!activeThreadId)
            return this.post({ type: "err", text: "Failed to create chat session." });
        const runStream = async (historySessionId) => {
            let sawTokenEvent = false;
            let lastProgressState = "";
            const emitProgress = (label) => {
                if (!label || label === lastProgressState)
                    return;
                lastProgressState = label;
                this.post({ type: "status", text: label });
            };
            return (stream(`${base()}/api/v1/playground/assist`, key, {
                mode: requestMode,
                task: taskWithReasoning,
                stream: true,
                model,
                ...(options.attachments?.length ? { attachments: options.attachments } : {}),
                ...(collectedContext ? { context: trimContextToMaxChars(collectedContext, MAX_TOTAL_CONTEXT_CHARS) } : {}),
                ...(historySessionId ? { historySessionId } : {}),
                workflowIntentId: `reasoning:${reasoning}`,
                contextBudget: { maxTokens: 65536, strategy: "hybrid" },
                clientTrace: {
                    extensionVersion: String(this.ctx.extension.packageJSON?.version || "0.0.0"),
                    workspaceHash,
                },
                executionPolicy: this.getExecutionPolicy(),
                safetyProfile: this.safety,
                agentConfig: parallel
                    ? { strategy: "parallel", roles: ["planner", "implementer", "reviewer"] }
                    : { strategy: "single" },
            }, {
                onCancelReady: (cancel) => {
                    this.activeStreamCancel = cancel;
                },
            }, async (ev, p) => {
                if (ev === "token") {
                    const chunk = typeof p === "string" ? p : String(p ?? "");
                    if (chunk) {
                        sawTokenEvent = true;
                        this.post({ type: "token", text: chunk });
                    }
                }
                else if (ev === "status") {
                    const statusText = typeof p === "string" ? p : String(p ?? "");
                    if (statusText.trim())
                        this.post({ type: "status", text: statusText.trim() });
                }
                else if (ev === "log") {
                    const logText = typeof p === "string"
                        ? p
                        : typeof p?.message === "string"
                            ? String(p.message)
                            : "";
                    if (logText.trim()) {
                        if (/assist_started/i.test(logText)) {
                            emitProgress("Working on your request...");
                        }
                        else {
                            this.post({ type: "status", text: logText.trim() });
                        }
                    }
                }
                else if (ev === "final") {
                    if (!sawTokenEvent) {
                        this.post({ type: "token", text: typeof p === "string" ? p : JSON.stringify(p) });
                    }
                }
                else if (ev === "decision") {
                    if (!conversational) {
                        emitProgress(`Decision: ${p?.mode || "unknown"} (${p?.confidence ?? "?"})`);
                    }
                    this.addTimeline("decision", p?.mode || "unknown");
                }
                else if (ev === "diff_chunk") {
                    const editItems = Array.isArray(p) ? p : Array.isArray(p?.edits) ? p.edits : [];
                    if (editItems.length) {
                        for (const edit of editItems) {
                            const rawPatch = typeof edit?.patch === "string"
                                ? (edit.patch || "")
                                : typeof edit?.diff === "string"
                                    ? (edit.diff || "")
                                    : "";
                            if (edit &&
                                typeof edit.path === "string" &&
                                edit.path.trim() &&
                                rawPatch.trim()) {
                                const editPath = edit.path.trim();
                                const editPatch = rawPatch.trim();
                                this.pendingActions.push({ type: "edit", path: editPath, patch: editPatch });
                                this.post({ type: "editPreview", path: editPath, patch: editPatch });
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "commands_chunk") {
                    if (Array.isArray(p)) {
                        for (const command of p) {
                            if (typeof command === "string" && command.trim()) {
                                this.pendingActions.push({ type: "command", command: command.trim() });
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "actions_chunk") {
                    if (Array.isArray(p)) {
                        for (const action of p) {
                            if (!action || typeof action !== "object")
                                continue;
                            const type = String(action.type || "").toLowerCase();
                            if (type === "edit") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                const patch = typeof action.patch === "string" ? String(action.patch).trim() : "";
                                if (path && patch) {
                                    this.pendingActions.push({ type: "edit", path, patch });
                                    this.post({ type: "editPreview", path, patch });
                                }
                                continue;
                            }
                            if (type === "command") {
                                const command = typeof action.command === "string" ? String(action.command).trim() : "";
                                const category = action.category === "implementation" || action.category === "validation"
                                    ? (action.category)
                                    : undefined;
                                if (command)
                                    this.pendingActions.push({ type: "command", command, ...(category ? { category } : {}) });
                                continue;
                            }
                            if (type === "mkdir") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                if (path)
                                    this.pendingActions.push({ type: "mkdir", path });
                                continue;
                            }
                            if (type === "write_file") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                const content = typeof action.content === "string" ? action.content : "";
                                const overwrite = typeof action.overwrite === "boolean" ? action.overwrite : undefined;
                                if (path) {
                                    this.pendingActions.push({ type: "write_file", path, content, ...(overwrite !== undefined ? { overwrite } : {}) });
                                }
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "phase") {
                    const phaseName = String(p?.name || "phase");
                    this.addTimeline(phaseName, phaseName);
                    if (!conversational) {
                        const progressLabel = phaseName === "decision"
                            ? "Understanding request..."
                            : phaseName === "plan"
                                ? "Planning approach..."
                                : phaseName === "execute"
                                    ? "Preparing actions..."
                                    : phaseName === "verify"
                                        ? "Validating output..."
                                        : `Working: ${phaseName}`;
                        emitProgress(progressLabel);
                    }
                }
                else if (ev === "reason_codes") {
                    const codes = Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
                    this.lastRunMeta = {
                        ...(this.lastRunMeta || {}),
                        reasonCodes: codes,
                    };
                }
                else if (ev === "meta") {
                    this.lastRunMeta = (p || null);
                    this.post({ type: "meta", data: p });
                }
            }));
        };
        try {
            await runStream(activeThreadId);
        }
        catch (e) {
            if (this.cancelRequested) {
                this.post({ type: "status", text: "Response stopped." });
            }
            else {
                const message = err(e);
                if (activeThreadId && /historysessionid|unknown historysessionid/i.test(message)) {
                    this.addTimeline("session", "stale history session recovered");
                    await runStream(null).catch((inner) => this.post({ type: "err", text: err(inner) }));
                }
                else {
                    this.post({ type: "err", text: message });
                }
            }
        }
        finally {
            this.activeStreamCancel = null;
        }
        if (this.threads[activeThreadId])
            this.threads[activeThreadId].updatedAt = new Date().toISOString();
        await this.loadHistory();
        await this.postThreadState();
        this.post({ type: "end" });
        if (this.cancelRequested) {
            this.pendingActions = [];
            this.post({ type: "pendingActions", count: 0 });
            return;
        }
        if (this.pendingActions.length > 0) {
            const policy = this.getExecutionPolicy();
            const hasEditActions = this.pendingActions.some((a) => a.type === "edit" || a.type === "mkdir" || a.type === "write_file");
            const hasCommandActions = this.pendingActions.some((a) => a.type === "command");
            const meta = (this.lastRunMeta || {});
            const autonomy = meta.autonomyDecision;
            const validation = meta.validationPlan;
            const autoApplyEdits = policy === "full_auto"
                ? hasEditActions
                : policy === "preview_first"
                    ? false
                    : hasEditActions && this.mode === "yolo" && autonomy?.autoApplyEdits !== false;
            const autoRunValidation = policy === "full_auto"
                ? hasCommandActions
                : policy === "preview_first"
                    ? false
                    : (autonomy?.autoRunValidation === true || this.hasExplicitCommandRunIntent(text));
            if (hasEditActions && !autoApplyEdits) {
                this.post({
                    type: "status",
                    text: `Prepared ${this.pendingActions.length} action(s), not executed. Execution policy is ${policy}.`,
                });
                this.post({
                    type: "actionOutcome",
                    data: {
                        filesChanged: 0,
                        checksRun: 0,
                        quality: "preview_only",
                        summary: "Edits prepared for preview, not auto-applied.",
                    },
                });
                return;
            }
            const actionsToExecute = [];
            if (hasEditActions && autoApplyEdits) {
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "edit"));
            }
            if (hasCommandActions && autoRunValidation) {
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "command"));
            }
            if (actionsToExecute.length > 0) {
                if (!conversational) {
                    this.post({
                        type: "status",
                        text: `Prepared ${actionsToExecute.length} tool action(s). Auto-executing now.`,
                    });
                }
                await this.executePendingActions(actionsToExecute);
            }
            else {
                if (!conversational) {
                    const modeLabel = validation?.scope === "targeted" ? "Targeted validation skipped" : "Auto-execution skipped";
                    this.post({ type: "status", text: `Prepared ${this.pendingActions.length} action(s). ${modeLabel}. Execution policy prevented auto-run.` });
                }
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
            }
        }
    }
    async loadHistory() {
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key) {
            this.recentHistory = [];
            await this.postThreadState();
            return;
        }
        const r = await req("GET", `${base()}/api/v1/playground/sessions?limit=30`, key).catch(() => ({}));
        const items = (r?.data?.data || [])
            .map((x) => this.threadFromApiRow(x))
            .filter((x) => x.id);
        this.recentHistory = items;
        for (const item of items) {
            if (!this.threads[item.id])
                this.upsertThread(item, false);
        }
        this.post({ type: "historyItems", data: items });
        await this.postThreadState();
    }
    async openSession(id) {
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key || !id)
            return;
        const existing = this.threads[id] || this.recentHistory.find((x) => x.id === id);
        this.upsertThread(existing || { id, title: "Untitled", mode: this.mode, updatedAt: null, isOpen: true }, true);
        this.activeThreadId = id;
        this.sessionId = id;
        const r = await req("GET", `${base()}/api/v1/playground/sessions/${encodeURIComponent(id)}/messages?includeAgentEvents=true`, key).catch(() => ({}));
        const msgs = (r?.data || [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }));
        this.post({ type: "load", data: msgs.reverse(), threadId: id });
        this.addTimeline("history", `loaded ${id.slice(0, 8)}`);
        await this.postThreadState();
    }
    async newThread() {
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key)
            return this.post({ type: "err", text: "No API key set" });
        const s = await req("POST", `${base()}/api/v1/playground/sessions`, key, {
            title: "New chat",
            mode: this.mode,
        }).catch(() => ({}));
        const id = s?.data?.id ? String(s.data.id) : null;
        if (!id)
            return this.post({ type: "err", text: "Failed to create chat session." });
        this.upsertThread({ id, title: "New chat", mode: this.mode, updatedAt: new Date().toISOString(), isOpen: true }, true);
        this.activeThreadId = id;
        this.sessionId = id;
        this.post({ type: "load", data: [], threadId: id });
        await this.loadHistory();
        await this.postThreadState();
    }
    async switchThread(id) {
        if (!id)
            return;
        if (!this.threads[id]) {
            const fromHistory = this.recentHistory.find((x) => x.id === id);
            if (fromHistory)
                this.upsertThread(fromHistory, true);
        }
        else {
            this.upsertThread(this.threads[id], true);
        }
        this.activeThreadId = id;
        this.sessionId = id;
        await this.openSession(id);
    }
    async closeThread(id) {
        if (!id)
            return;
        this.openThreadOrder = this.openThreadOrder.filter((x) => x !== id);
        if (this.threads[id])
            this.threads[id].isOpen = false;
        if (this.activeThreadId === id) {
            this.activeThreadId = this.openThreadOrder[0] || null;
            this.sessionId = this.activeThreadId;
            if (this.activeThreadId) {
                await this.openSession(this.activeThreadId);
            }
            else {
                this.post({ type: "load", data: [], threadId: null });
            }
        }
        await this.postThreadState();
    }
    async replay() {
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key || !this.activeThreadId)
            return this.post({ type: "status", text: "No active session yet. Send a prompt first, then replay." });
        const r = await req("POST", `${base()}/api/v1/playground/replay`, key, {
            sessionId: this.activeThreadId,
            workspaceFingerprint: "vscode",
            mode: this.mode,
        }).catch(() => ({}));
        const s = r?.data?.driftReport?.summary || "Replay prepared.";
        const st = r?.data?.replayPlan?.steps || [];
        this.post({ type: "assistant", text: `${s}\n\n${st.map((x, i) => `${i + 1}. ${x}`).join("\n")}` });
        this.addTimeline("replay", s);
    }
    async executePendingActions(actions) {
        const key = await this.ctx.secrets.get(API_KEY_SECRET);
        if (!key)
            return this.post({ type: "err", text: "No API key set" });
        const rawActionList = (actions && actions.length ? actions : this.pendingActions).slice();
        const seenActionKeys = new Set();
        const actionList = rawActionList.filter((action) => {
            const key = JSON.stringify(action);
            if (seenActionKeys.has(key))
                return false;
            seenActionKeys.add(key);
            return true;
        });
        if (!actionList.length)
            return this.post({ type: "status", text: "No pending actions to execute." });
        this.post({ type: "status", text: `Executing ${actionList.length} action(s)...` });
        const r = await req("POST", `${base()}/api/v1/playground/execute`, key, {
            sessionId: this.activeThreadId || undefined,
            workspaceFingerprint: "vscode",
            actions: actionList.map((a) => {
                if (a.type === "edit")
                    return { type: "edit", path: a.path, patch: a.patch };
                if (a.type === "command")
                    return { type: "command", command: a.command, ...(a.category ? { category: a.category } : {}) };
                if (a.type === "mkdir")
                    return { type: "mkdir", path: a.path };
                return { type: "write_file", path: a.path, content: a.content, ...(a.overwrite !== undefined ? { overwrite: a.overwrite } : {}) };
            }),
        }).catch((e) => ({ error: err(e) }));
        if (r?.error) {
            this.post({ type: "err", text: r.error });
            return;
        }
        const results = (r?.data?.results || []);
        const logs = results.map((row) => ({
            ts: Date.now(),
            level: row.status === "approved" ? "info" : "error",
            message: row.action?.type === "edit"
                ? `${row.status?.toUpperCase() || "UNKNOWN"} edit ${row.action.path || "unknown"}${row.reason ? ` (${row.reason})` : ""}`
                : row.action?.type === "mkdir"
                    ? `${row.status?.toUpperCase() || "UNKNOWN"} mkdir ${row.action.path || "unknown"}${row.reason ? ` (${row.reason})` : ""}`
                    : row.action?.type === "write_file"
                        ? `${row.status?.toUpperCase() || "UNKNOWN"} write_file ${row.action.path || "unknown"}${row.reason ? ` (${row.reason})` : ""}`
                        : `${row.status?.toUpperCase() || "UNKNOWN"} command ${row.action?.command || "unknown"}${row.reason ? ` (${row.reason})` : ""} [exit ${row.exitCode ?? "?"}]`,
        }));
        this.post({ type: "execLogs", data: logs });
        let appliedEdits = 0;
        let launchedCommands = 0;
        const applyErrors = [];
        const perFileStatuses = [];
        for (const row of results) {
            if (row.status !== "approved" || !row.action)
                continue;
            if (row.action.type === "edit") {
                const previewPatch = row.action.patch || row.action.diff || "";
                if (previewPatch.trim()) {
                    this.post({ type: "editPreview", path: row.action.path || "unknown", patch: previewPatch });
                }
                const applied = await this.applyEditAction({
                    path: row.action.path,
                    patch: row.action.patch,
                    diff: row.action.diff,
                });
                perFileStatuses.push({
                    path: row.action.path || "unknown",
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied" || applied.status === "partial") {
                    appliedEdits += 1;
                    this.post({ type: "fileAction", path: row.action.path || "unknown", status: applied.status, reason: applied.reason || "" });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path || "unknown"}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "mkdir" && row.action.path) {
                const applied = await this.applyMkdirAction({ path: row.action.path });
                perFileStatuses.push({
                    path: row.action.path,
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied") {
                    appliedEdits += 1;
                    this.post({ type: "fileAction", path: row.action.path, status: "applied", reason: "Directory created" });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "write_file" && row.action.path) {
                const applied = await this.applyWriteFileAction({
                    path: row.action.path,
                    content: typeof row.action.content === "string" ? row.action.content : "",
                    overwrite: typeof row.action.overwrite === "boolean" ? row.action.overwrite : true,
                });
                perFileStatuses.push({
                    path: row.action.path,
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied") {
                    appliedEdits += 1;
                    this.post({ type: "fileAction", path: row.action.path, status: "applied", reason: "File created/updated" });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "command" && row.action.command) {
                this.post({ type: "terminalCommand", command: row.action.command });
                this.runApprovedCommand(row.action.command);
                launchedCommands += 1;
            }
        }
        const approved = results.filter((x) => x.status === "approved").length;
        this.post({
            type: "status",
            text: `Execute finished: ${approved}/${results.length} approved. Applied ${appliedEdits} edit(s), launched ${launchedCommands} command(s).`,
        });
        if (applyErrors.length) {
            this.post({ type: "err", text: `Some approved edits were not auto-applied:\n- ${applyErrors.join("\n- ")}` });
        }
        this.post({
            type: "actionOutcome",
            data: {
                filesChanged: appliedEdits,
                checksRun: launchedCommands,
                quality: applyErrors.length ? "needs_attention" : "good",
                summary: applyErrors.length
                    ? "Applied edits with warnings. Review rejected patches."
                    : "Actions completed successfully.",
                perFile: perFileStatuses,
            },
        });
        this.addTimeline("execute", `approved ${approved}/${results.length}`);
        const toRemove = new Set(actionList.map((action) => JSON.stringify(action)));
        this.pendingActions = this.pendingActions.filter((action) => !toRemove.has(JSON.stringify(action)));
        this.post({ type: "pendingActions", count: this.pendingActions.length });
    }
    async applyEditAction(action) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path in edit action." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open." };
        const patchText = action.patch || action.diff || "";
        if (!patchText)
            return { status: "rejected_invalid_patch", reason: "Missing patch/diff content for edit action." };
        const patchTarget = normalizeWorkspaceRelativePath((0, patch_utils_1.extractPatchTargetPath)(patchText) || rel);
        if (!patchTarget || patchTarget !== rel) {
            return { status: "rejected_path_policy", reason: "Patch path did not match approved workspace-relative path." };
        }
        const relParts = rel.split("/").filter(Boolean);
        const target = vscode.Uri.joinPath(root.uri, ...relParts);
        const parent = path.posix.dirname(rel);
        if (parent && parent !== ".") {
            const parentUri = vscode.Uri.joinPath(root.uri, ...parent.split("/").filter(Boolean));
            await vscode.workspace.fs.createDirectory(parentUri);
        }
        let original = "";
        try {
            const buf = await vscode.workspace.fs.readFile(target);
            original = Buffer.from(buf).toString("utf8");
        }
        catch {
            original = "";
        }
        const applied = (0, patch_utils_1.applyUnifiedDiff)(original, patchText);
        if (applied.status === "rejected_invalid_patch" || !applied.content) {
            return { status: applied.status, reason: applied.reason || "Unsupported patch format." };
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(applied.content, "utf8"));
        return {
            status: applied.status,
            ...(applied.reason ? { reason: applied.reason } : {}),
        };
    }
    async applyMkdirAction(action) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for mkdir action." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open." };
        const target = vscode.Uri.joinPath(root.uri, ...rel.split("/").filter(Boolean));
        await vscode.workspace.fs.createDirectory(target);
        await vscode.workspace.fs.stat(target);
        return { status: "applied" };
    }
    async applyWriteFileAction(action) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for write_file action." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open." };
        const relParts = rel.split("/").filter(Boolean);
        const target = vscode.Uri.joinPath(root.uri, ...relParts);
        const parent = path.posix.dirname(rel);
        if (parent && parent !== ".") {
            const parentUri = vscode.Uri.joinPath(root.uri, ...parent.split("/").filter(Boolean));
            await vscode.workspace.fs.createDirectory(parentUri);
        }
        const overwrite = action.overwrite !== false;
        if (!overwrite) {
            try {
                await vscode.workspace.fs.stat(target);
                return { status: "rejected_path_policy", reason: "write_file blocked: file already exists and overwrite=false." };
            }
            catch {
                // file does not exist; safe to continue
            }
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(String(action.content || ""), "utf8"));
        await vscode.workspace.fs.stat(target);
        return { status: "applied" };
    }
    runApprovedCommand(command) {
        if (!this.commandTerminal) {
            this.commandTerminal = vscode.window.createTerminal({ name: "Playground Execute" });
        }
        this.commandTerminal.show(true);
        this.commandTerminal.sendText(command, true);
    }
    addTimeline(phase, detail) {
        this.timeline.push({ ts: Date.now(), phase, detail });
        this.timeline = this.timeline.slice(-200);
        this.post({ type: "timeline", data: this.timeline });
    }
    postRun(threadId, m) {
        const normalized = threadId ? String(threadId) : "";
        if (normalized) {
            this.post({ ...m, threadId: normalized });
            return;
        }
        this.post(m);
    }
    post(m) {
        this.view?.webview.postMessage(m);
    }
}
function req(method, u, key, body) {
    return new Promise((resolve, reject) => {
        const x = new url_1.URL(u);
        const c = x.protocol === "https:" ? https : http;
        const p = body === undefined ? "" : JSON.stringify(body);
        const r = c.request({
            hostname: x.hostname,
            port: x.port || (x.protocol === "https:" ? 443 : 80),
            path: x.pathname + x.search,
            method,
            headers: {
                "X-API-Key": key,
                "Content-Type": "application/json",
                ...(body === undefined ? {} : { "Content-Length": Buffer.byteLength(p) }),
            },
        }, (res) => {
            let t = "";
            res.on("data", (d) => (t += d.toString("utf8")));
            res.on("end", () => {
                if ((res.statusCode || 500) >= 400)
                    return reject(new Error(parseErr(t, res.statusCode)));
                try {
                    resolve((t ? JSON.parse(t) : {}));
                }
                catch {
                    resolve({});
                }
            });
        });
        r.on("error", reject);
        if (p)
            r.write(p);
        r.end();
    });
}
function stream(u, key, body, options, onEvent) {
    return new Promise((resolve, reject) => {
        const CONNECT_TIMEOUT_MS = 20000;
        const IDLE_TIMEOUT_MS = 45000;
        const x = new url_1.URL(u);
        const c = x.protocol === "https:" ? https : http;
        const p = JSON.stringify(body);
        let b = "";
        let done = false;
        let idleTimer = null;
        const clearIdleTimer = () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        };
        const armIdleTimer = () => {
            clearIdleTimer();
            idleTimer = setTimeout(() => {
                try {
                    r.destroy(new Error(`Stream idle timeout after ${IDLE_TIMEOUT_MS}ms`));
                }
                catch {
                    // ignore destroy failures
                }
            }, IDLE_TIMEOUT_MS);
        };
        const finish = (cb) => {
            if (done)
                return;
            done = true;
            clearIdleTimer();
            cb();
        };
        const findSeparator = (value) => {
            const idxLf = value.indexOf("\n\n");
            const idxCrlf = value.indexOf("\r\n\r\n");
            if (idxLf < 0 && idxCrlf < 0)
                return { index: -1, len: 0 };
            if (idxLf < 0)
                return { index: idxCrlf, len: 4 };
            if (idxCrlf < 0)
                return { index: idxLf, len: 2 };
            return idxLf < idxCrlf ? { index: idxLf, len: 2 } : { index: idxCrlf, len: 4 };
        };
        const handleSseChunk = (chunk) => {
            const lines = chunk
                .split(/\r?\n/)
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice(5).trim());
            if (!lines.length)
                return false;
            const raw = lines.join("\n");
            if (raw === "[DONE]") {
                finish(resolve);
                return true;
            }
            try {
                const o = JSON.parse(raw);
                onEvent(o.event || "message", o.data ?? o.message ?? o);
            }
            catch {
                // ignore malformed SSE chunks
            }
            return false;
        };
        const r = c.request({
            hostname: x.hostname,
            port: x.port || (x.protocol === "https:" ? 443 : 80),
            path: x.pathname + x.search,
            method: "POST",
            headers: {
                "X-API-Key": key,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(p),
                Accept: "text/event-stream",
            },
        }, (res) => {
            armIdleTimer();
            if ((res.statusCode || 500) >= 400) {
                let t = "";
                res.on("data", (d) => (t += d.toString("utf8")));
                res.on("end", () => finish(() => reject(new Error(parseErr(t, res.statusCode)))));
                return;
            }
            res.on("data", (d) => {
                if (done)
                    return;
                armIdleTimer();
                b += d.toString("utf8");
                let sep = findSeparator(b);
                while (sep.index >= 0) {
                    const e = b.slice(0, sep.index);
                    b = b.slice(sep.index + sep.len);
                    if (handleSseChunk(e))
                        return;
                    sep = findSeparator(b);
                }
            });
            res.on("end", () => {
                if (!done && b.trim())
                    handleSseChunk(b);
                finish(resolve);
            });
        });
        options?.onCancelReady?.(() => {
            try {
                r.destroy(new Error("Request cancelled by user"));
            }
            catch {
                // ignore destroy failures
            }
        });
        r.setTimeout(CONNECT_TIMEOUT_MS, () => {
            try {
                r.destroy(new Error(`Connection timeout after ${CONNECT_TIMEOUT_MS}ms`));
            }
            catch {
                // ignore destroy failures
            }
        });
        r.on("error", (e) => finish(() => reject(e)));
        r.write(p);
        r.end();
    });
}
function parseErr(text, code) {
    try {
        const j = JSON.parse(text);
        return `HTTP ${code}: ${j.error?.message || j.message || j.error || text}`;
    }
    catch {
        return `HTTP ${code}: ${text.slice(0, 300)}`;
    }
}
function err(e) {
    return e instanceof Error ? e.message : String(e);
}
function base() {
    return (vscode.workspace.getConfiguration("xpersona.playground").get("baseApiUrl") || "http://localhost:3000").replace(/\/$/, "");
}
function nonce() {
    return (0, crypto_1.createHash)("sha256").update(String(Math.random())).digest("hex").slice(0, 16);
}
function html(webview, extensionUri) {
    const n = nonce();
    const scriptPath = path.join(extensionUri.fsPath, "media", "webview.js");
    const scriptSource = (() => {
        try {
            return fs.readFileSync(scriptPath, "utf8");
        }
        catch {
            return `console.error("Playground UI failed to load webview.js.");`;
        }
    })().replace(/<\/script/gi, "<\\/script");
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} https: data:`,
        // Keep styles flexible (we use a few inline style attributes), but lock scripts to a nonce.
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        // Inline nonce script avoids external webview resource fetch dependency.
        `script-src 'nonce-${n}'`,
    ].join("; ");
    return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <style nonce="${n}">
      :root {
        --bg-0: var(--vscode-editor-background, #1e1e1e);
        --bg-1: var(--vscode-sideBar-background, var(--vscode-editorWidget-background, var(--bg-0)));
        --bg-2: var(--vscode-editorWidget-background, var(--bg-1));
        --bg-3: color-mix(in srgb, var(--bg-1) 90%, var(--vscode-editor-foreground, #cccccc) 10%);
        --fg: var(--vscode-editor-foreground, #cccccc);
        --muted: var(--vscode-descriptionForeground, #8a8a8a);
        --border: var(--vscode-panel-border, var(--vscode-widget-border, var(--vscode-input-border, #3a3a3a)));
        --accent: var(--vscode-button-background, #0e639c);
        --accent-fg: var(--vscode-button-foreground);
        --ok: var(--vscode-testing-iconPassed, #22c55e);
        --err: var(--vscode-errorForeground, #ef4444);
        --surface: var(--vscode-editorWidget-background, var(--bg-1));
        --surface-border: var(--vscode-editorWidget-border, var(--border));
        --input-bg: var(--vscode-input-background, var(--bg-1));
        --input-fg: var(--vscode-input-foreground, var(--fg));
        --input-border: var(--vscode-input-border, var(--border));
        --diff-add-bg: var(--vscode-diffEditor-insertedTextBackground, rgba(34, 197, 94, 0.16));
        --diff-del-bg: var(--vscode-diffEditor-removedTextBackground, rgba(239, 68, 68, 0.16));
        --diff-add-fg: var(--vscode-gitDecoration-addedResourceForeground, #86efac);
        --diff-del-fg: var(--vscode-gitDecoration-deletedResourceForeground, #fca5a5);
        --line-fg: var(--vscode-editorLineNumber-foreground, #62708a);
        --gutter-bg: var(--vscode-editorGutter-background, #0d1016);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        flex-direction: column;
        font-family: var(--vscode-font-family);
        color: var(--fg);
        background: var(--bg-0);
      }
      button, select, input, textarea { font-family: inherit; font-size: 12px; }
      button, select, input {
        border: 1px solid var(--input-border);
        background: var(--input-bg);
        color: var(--input-fg);
        border-radius: 10px;
        padding: 7px 10px;
      }
      button {
        cursor: pointer;
        transition: transform .08s ease, border-color .2s ease, background .2s ease;
      }
      button:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
      }
      button:disabled { opacity: .55; cursor: not-allowed; transform: none; }
      .primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; font-weight: 600; }
      .ghost { background: transparent; }
      .js-gate {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.88);
        z-index: 9999;
      }
      .js-gate-card {
        width: 100%;
        max-width: 420px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--bg-1);
        padding: 14px 14px 12px;
      }
      .js-gate-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .js-gate-sub {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .setup {
        display: none;
        flex: 1;
        align-items: center;
        justify-content: center;
        padding: 22px;
      }
      .setup-card {
        width: 100%;
        max-width: 380px;
        border: 1px solid var(--border);
        border-radius: 16px;
        background: var(--bg-1);
        padding: 14px;
        box-shadow: none;
      }
      .setup-card h3 { margin: 2px 0 6px; font-size: 14px; }
      .setup-card p { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
      .app {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
      .toolbar {
        padding: 10px 12px 8px;
        border-bottom: 1px solid var(--border);
        background: #000;
        display: grid;
        gap: 6px;
      }
      .toolbar,
      .tabs {
        display: none;
      }
      .startup {
        border-bottom: 1px solid #1d1d1d;
        padding: 12px;
        background: #000;
      }
      .startup-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .startup-title {
        font-size: 12px;
        font-weight: 700;
        color: #f7f7f7;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .startup-actions {
        display: none;
      }
      .tasks-label {
        color: #9f9f9f;
        font-size: 12px;
        margin-bottom: 4px;
      }
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .task-entry {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 8px 0;
        cursor: pointer;
        border-bottom: 1px solid #121212;
      }
      .task-entry:hover {
        background: transparent;
      }
      .task-title {
        font-size: 14px;
        color: #f0f0f0;
        margin-bottom: 3px;
      }
      .task-meta {
        font-size: 12px;
        color: #747474;
      }
      .view-all {
        margin-top: 10px;
        font-size: 12px;
        color: #9f9f9f;
        background: transparent;
        border: none;
        padding: 0;
        text-align: left;
      }
      .toolbar-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .title {
        font-size: 19px;
        font-weight: 700;
        letter-spacing: .01em;
        color: #fff;
        margin-right: 6px;
      }
      .toolbar-sub {
        color: var(--muted);
        font-size: 11px;
      }
      .pill {
        font-size: 11px;
        border: none !important;
        box-shadow: none !important;
        border-radius: 999px;
        padding: 4px 9px;
        background: var(--bg-1);
      }
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 6px 12px;
        border-bottom: 1px solid var(--border);
        background: #000;
      }
      .tab {
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--bg-1);
        color: var(--muted);
        padding: 5px 10px;
        white-space: nowrap;
      }
      .tab.active {
        color: #fff;
        border-color: #3a3a3a;
        background: #111;
        font-weight: 600;
      }
      .startup,
      .tabs {
        display: none !important;
      }
      .panel {
        display: none;
        flex: 1;
        overflow: auto;
        padding: 10px 12px;
        white-space: pre-wrap;
      }
      .hidden-panel { display: none !important; }
      .panel.active { display: block; }
      .chat-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .global-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 12px 0;
      }
      .chat-title {
        font-size: 12px;
        font-weight: 700;
        color: #efefef;
        letter-spacing: .02em;
        text-transform: uppercase;
      }
      .chat-hint {
        color: var(--muted);
        font-size: 11px;
      }
      .chips {
        display: none;
        margin-bottom: 8px;
      }
      .chip {
        font-size: 11px;
        padding: 4px 9px;
        border: none !important;
        box-shadow: none !important;
        border-radius: 999px;
        background: #0b0b0b;
      }
      .messages {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .thread-list {
        border: 1px solid #1c1c1c;
        border-radius: 12px;
        padding: 8px;
        margin-bottom: 10px;
        background: #070707;
        display: grid;
        gap: 8px;
      }
      .thread-section-title {
        font-size: 11px;
        color: #8d8d8d;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .thread-row {
        border: 1px solid transparent;
        border-radius: 10px;
        padding: 7px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        cursor: pointer;
      }
      .thread-row:hover {
        border-color: #2b2b2b;
        background: #0d0d0d;
      }
      .thread-row.active {
        border-color: #345070;
        background: #0e141d;
      }
      .thread-main {
        min-width: 0;
      }
      .thread-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .thread-title {
        font-size: 12px;
        color: #f0f0f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .thread-meta {
        font-size: 10px;
        color: #8f8f8f;
      }
      .thread-close {
        border: 1px solid #2c2c2c;
        background: #0b0b0b;
        color: #d7d7d7;
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 999px;
        padding: 0;
        font-size: 12px;
        line-height: 1;
      }
      .thread-pin {
        border: 1px solid #2c2c2c;
        background: #0b0b0b;
        color: #b7b7b7;
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 999px;
        padding: 0;
        font-size: 11px;
        line-height: 1;
      }
      .thread-pin.is-pinned {
        color: #f3c969;
        border-color: #5a4620;
        background: #15110a;
      }
      .m {
        border: none;
        border-radius: 0;
        padding: 0;
        max-width: 96%;
        line-height: 1.6;
        animation: pop .16s ease;
      }
      .m-body {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .m-media-grid {
        margin-top: 8px;
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
      }
      .m-media-card {
        border: 1px solid var(--input-border);
        border-radius: 10px;
        overflow: hidden;
        background: var(--surface);
      }
      .m-media-card img {
        display: block;
        width: 100%;
        max-height: 150px;
        object-fit: cover;
        background: var(--bg-1);
      }
      .m-media-name {
        display: block;
        padding: 6px 8px;
        font-size: 10px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .m-time {
        margin-top: 6px;
        font-size: 10px;
        color: var(--muted);
        opacity: .85;
        text-align: right;
      }
      .plan-decision .m-time {
        display: none;
      }
      .plan-card {
        border: 1px solid #262626;
        border-radius: 14px;
        background: #090909;
        padding: 12px;
        display: grid;
        gap: 8px;
      }
      .plan-card-title {
        font-size: 13px;
        font-weight: 700;
        color: #f2f2f2;
        letter-spacing: .01em;
      }
      .plan-choice {
        border: 1px solid #2d2d2d;
        border-radius: 10px;
        background: #101010;
        color: #ededed;
        padding: 9px 10px;
        text-align: left;
        font-size: 12px;
        font-weight: 600;
      }
      .plan-choice:hover {
        transform: none;
        border-color: #3a3a3a;
        background: #151515;
      }
      @keyframes pop {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .u {
        margin-left: auto;
        border-color: #3a3a3a;
        background: #111;
        border: 1px solid #2d2d2d;
        border-radius: 12px;
        padding: 10px 12px;
      }
      .a { background: transparent; color: #f0f0f0; }
      .e {
        background: color-mix(in srgb, var(--err) 22%, transparent);
        border-color: color-mix(in srgb, var(--err) 55%, var(--border));
        border-radius: 10px;
        padding: 10px 12px;
      }
      .cmd {
        background: transparent;
        border: none;
        padding: 0;
        max-width: 100%;
        opacity: 0.92;
      }
      .cmd .m-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 72%, var(--muted) 28%);
      }
      .cmd .m-time { display: none; }
      .terminal-live {
        padding: 0;
        overflow: hidden;
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        background: var(--surface);
      }
      .terminal-live .m-body {
        white-space: normal;
      }
      .terminal-live .m-time { display: none; }
      .term-disclosure {
        margin: 0;
      }
      .term-disclosure > summary {
        list-style: none;
      }
      .term-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .term-disclosure > summary::before {
        content: ">";
        display: inline-block;
        margin-right: 8px;
        color: color-mix(in srgb, var(--fg) 60%, var(--muted) 40%);
        transform: rotate(90deg);
        transition: transform .15s ease;
      }
      .term-disclosure:not([open]) > summary::before {
        transform: rotate(0deg);
      }
      .term-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 10px;
        border-bottom: 1px solid var(--surface-border);
        background: color-mix(in srgb, var(--surface) 78%, var(--bg-0));
        cursor: pointer;
        user-select: none;
      }
      .term-title {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
        font-weight: 600;
      }
      .term-state {
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 64%, var(--muted));
      }
      .term-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11.5px;
        line-height: 1.45;
        padding: 8px 10px 10px;
        display: grid;
        gap: 3px;
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .term-line {
        white-space: pre-wrap;
        word-break: break-word;
      }
      .term-line.cmdline { color: color-mix(in srgb, var(--fg) 86%, var(--muted)); }
      .term-line.ok { color: color-mix(in srgb, var(--ok) 70%, var(--fg)); }
      .term-line.err { color: color-mix(in srgb, var(--err) 72%, var(--fg)); }
      .term-line.info { color: color-mix(in srgb, var(--fg) 70%, var(--muted)); }
      .term-line.summary { color: color-mix(in srgb, var(--fg) 88%, var(--muted)); border-top: 1px solid var(--surface-border); margin-top: 4px; padding-top: 6px; }
      .change {
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        overflow: hidden;
        background: var(--surface);
      }
      .change .m-time {
        display: none;
      }
      .diff-disclosure {
        margin: 0;
      }
      .diff-disclosure > summary {
        list-style: none;
      }
      .diff-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .diff-disclosure > summary::before {
        content: ">";
        display: inline-block;
        margin-right: 8px;
        color: color-mix(in srgb, var(--fg) 60%, var(--muted) 40%);
        transform: rotate(90deg);
        transition: transform .15s ease;
      }
      .diff-disclosure:not([open]) > summary::before {
        transform: rotate(0deg);
      }
      .diff-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 10px;
        border-bottom: 1px solid var(--surface-border);
        cursor: pointer;
        user-select: none;
        background: color-mix(in srgb, var(--surface) 76%, var(--bg-0));
      }
      .diff-summary-title {
        font-size: 12px;
        font-weight: 600;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
      }
      .change-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        border-bottom: 1px solid #1d1d1d;
      }
      .change-count {
        font-size: 14px;
        font-weight: 600;
      }
      .change-file {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 12px;
        font-size: 12px;
      }
      .change-path {
        color: #d8d8d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .change-stats {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        white-space: nowrap;
      }
      .change-stats .add { color: #56d364; }
      .change-stats .del { color: #ff7b7b; }
      .patch {
        padding: 0;
        overflow: hidden;
        background: #0b0d12;
        border-color: #2a303d;
      }
      .patch .m-body {
        white-space: normal;
      }
      .patch .m-time {
        padding: 0 10px 9px;
      }
      .diff-card {
        border-bottom: 1px solid var(--surface-border);
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        background: color-mix(in srgb, var(--surface) 68%, var(--bg-0));
        border-bottom: 1px solid var(--surface-border);
      }
      .diff-title {
        color: color-mix(in srgb, var(--fg) 78%, var(--muted));
        font-size: 11px;
      }
      .diff-path {
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        font-weight: 600;
      }
      .diff-stats {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11px;
      }
      .diff-stats .add {
        color: var(--diff-add-fg);
      }
      .diff-stats .del {
        color: var(--diff-del-fg);
      }
      .diff-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 12px;
        line-height: 1.45;
        max-height: 280px;
        overflow: auto;
      }
      .diff-row {
        display: grid;
        grid-template-columns: 44px 44px 16px 1fr;
        width: fit-content;
        min-width: 100%;
      }
      .diff-row .ln {
        color: var(--line-fg);
        text-align: right;
        padding: 0 8px 0 0;
        border-right: 1px solid color-mix(in srgb, var(--surface-border) 70%, transparent);
        background: var(--gutter-bg);
      }
      .diff-row .sig {
        text-align: center;
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-row .txt {
        white-space: pre;
        padding: 0 8px;
      }
      .diff-row.ctx .sig,
      .diff-row.ctx .txt {
        color: color-mix(in srgb, var(--fg) 72%, var(--muted));
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-row.add .sig,
      .diff-row.add .txt {
        background: var(--diff-add-bg);
        color: color-mix(in srgb, var(--diff-add-fg) 75%, var(--fg));
      }
      .diff-row.del .sig,
      .diff-row.del .txt {
        background: var(--diff-del-bg);
        color: color-mix(in srgb, var(--diff-del-fg) 72%, var(--fg));
      }
      .diff-row.meta .sig,
      .diff-row.meta .txt {
        color: color-mix(in srgb, var(--fg) 55%, var(--muted));
        background: color-mix(in srgb, var(--surface) 62%, var(--bg-0));
      }
      .diff-trunc {
        color: color-mix(in srgb, var(--fg) 62%, var(--muted));
        font-size: 11px;
        padding: 6px 10px 8px;
        border-top: 1px solid var(--surface-border);
      }
      .typing .m-time { display: none; }
      .typing-dots {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .typing-dots i {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 70%, white 30%);
        opacity: .75;
        animation: dotPulse 1s infinite ease-in-out;
      }
      .typing-dots i:nth-child(2) { animation-delay: .16s; }
      .typing-dots i:nth-child(3) { animation-delay: .32s; }
      @keyframes dotPulse {
        0%, 80%, 100% { transform: translateY(0); opacity: .45; }
        40% { transform: translateY(-3px); opacity: 1; }
      }
      .item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        margin-bottom: 8px;
        background: #080808;
      }
      .item-title { font-weight: 600; margin-bottom: 4px; }
      .item-sub { color: var(--muted); font-size: 11px; }
      .input {
        border-top: 1px solid #161616;
        padding: 10px 12px;
        display: grid;
        gap: 7px;
        background: linear-gradient(to top, #000000 72%, rgba(0, 0, 0, 0.98));
        position: relative;
      }
      .composer-form {
        display: grid;
        gap: 7px;
        position: relative;
      }
      .hidden {
        display: none !important;
      }
      .mode-banner {
        margin: 0 12px 8px;
        padding: 9px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        color: #d7ebff;
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.34), rgba(6, 182, 212, 0.25));
        border: 1px solid rgba(138, 188, 255, 0.65);
        box-shadow: 0 0 0 1px rgba(34, 112, 214, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .mode-plan-chip {
        height: 32px;
        display: inline-flex;
        align-items: center;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid rgba(138, 188, 255, 0.6);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.32), rgba(6, 182, 212, 0.22));
        color: #d7ebff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }
      .startup.hidden,
      .panel.hidden {
        display: none !important;
      }
      .startup,
      .tabs {
        display: none !important;
      }
      .settings-bar {
        display: none;
      }
      .settings-group {
        display: none;
        align-items: center;
        gap: 6px;
      }
      .settings-group.show {
        display: inline-flex;
      }
      .upload-btn {
        border: 1px solid #2f2f2f;
        background: #101010;
        color: #f0f0f0;
        padding: 0 10px;
        border-radius: 999px;
        height: 32px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        flex: 0 0 auto;
      }
      .upload-btn::before {
        content: "+";
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 1px solid #4a4a4a;
        color: #d5d5d5;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        line-height: 1;
      }
      .upload-btn:hover {
        transform: none;
        border-color: #4a4a4a;
        background: #141414;
      }
      .tool-muted {
        color: #8f8f8f;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .file-input {
        display: none;
      }
      .tool-toggle {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        color: #ebebeb;
      }
      .tool-toggle input {
        appearance: none;
        width: 30px;
        height: 18px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid #2f2f2f;
        background: #151515;
        position: relative;
        cursor: pointer;
      }
      .tool-toggle input::after {
        content: "";
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        top: 2px;
        left: 2px;
        background: #8a8a8a;
        transition: transform .16s ease, background .16s ease;
      }
      .tool-toggle input:checked {
        background: rgba(34, 119, 216, 0.46);
        border-color: rgba(92, 165, 249, 0.86);
      }
      .tool-toggle input:checked::after {
        transform: translateX(12px);
        background: #ffffff;
      }
      textarea {
        width: 100%;
        min-height: 76px;
        max-height: 210px;
        resize: vertical;
        border: 1px solid #272727;
        border-radius: 18px;
        background: #050505;
        color: var(--fg);
        padding: 12px 14px;
        line-height: 1.45;
        font-size: 13px;
      }
      textarea:focus {
        outline: none;
        border-color: #3a3a3a;
      }
      .mention-menu {
        position: absolute;
        left: 2px;
        right: 2px;
        bottom: 118px;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        background: #0a0a0a;
        box-shadow: 0 16px 28px rgba(0, 0, 0, 0.4);
        max-height: 210px;
        overflow: auto;
        z-index: 24;
      }
      .mention-item {
        width: 100%;
        border: none;
        border-bottom: 1px solid #1b1b1b;
        background: transparent;
        color: #e8e8e8;
        text-align: left;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
      }
      .mention-item:last-child { border-bottom: none; }
      .mention-item.active { background: #111a27; }
      .mention-path {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .mention-kind {
        color: #9a9a9a;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .input-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        min-width: 0;
      }
      .menu-icon {
        height: 28px;
        min-width: 74px;
        border-radius: 999px;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #0c0c0c;
        border: 1px solid #2e2e2e;
        color: #d9d9d9;
      }
      .action-menu {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(3px);
        z-index: 60;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 14px;
      }
      .action-menu-sheet {
        width: min(640px, 100%);
        max-height: 86vh;
        overflow: auto;
        border: 1px solid #272727;
        border-radius: 18px;
        background: radial-gradient(circle at top right, rgba(30, 58, 138, 0.2), rgba(10, 10, 10, 0.98) 45%), #080808;
        box-shadow: 0 26px 42px rgba(0, 0, 0, 0.52);
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .sheet-title {
        font-size: 14px;
        font-weight: 700;
        color: #f4f4f4;
      }
      .sheet-sub {
        color: #9a9a9a;
        font-size: 11px;
      }
      .sheet-close {
        border: 1px solid #2e2e2e;
        background: #101010;
        border-radius: 999px;
        width: 28px;
        height: 28px;
        min-width: 28px;
        padding: 0;
        color: #d8d8d8;
        font-size: 16px;
      }
      .sheet-grid {
        display: grid;
        gap: 10px;
      }
      .sheet-card {
        border: 1px solid #1f1f1f;
        border-radius: 14px;
        background: #0a0a0a;
        padding: 10px;
        display: grid;
        gap: 8px;
      }
      .sheet-card-title {
        font-size: 12px;
        font-weight: 600;
        color: #f1f1f1;
      }
      .api-key-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .api-key-input {
        width: 100%;
        border: 1px solid #2d2d2d;
        border-radius: 8px;
        background: #080808;
        color: #efefef;
        padding: 7px 9px;
        font-size: 12px;
      }
      .api-key-input:focus {
        outline: none;
        border-color: #3f6ea0;
      }
      .api-key-save {
        border: 1px solid #2e2e2e;
        border-radius: 8px;
        background: #111111;
        color: #ececec;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 600;
      }
      .api-key-hint {
        color: #8f8f8f;
        font-size: 11px;
      }
      .action-item {
        border: none;
        border-radius: 8px;
        background: #101010;
        color: #e8e8e8;
        text-align: left;
        padding: 7px 8px;
        font-size: 12px;
      }
      .action-item:hover {
        background: #141414;
        transform: none;
      }
      .action-sep {
        height: 1px;
        background: #1d1d1d;
        margin: 3px 2px;
      }
      .sheet-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .sheet-toggle {
        justify-content: space-between;
        width: 100%;
      }
      .sheet-toggle .tool-toggle {
        width: 100%;
        justify-content: space-between;
      }
      .input-actions > * {
        min-width: 0;
      }
      .spacer { flex: 1; }
      .hint {
        color: var(--muted);
        font-size: 11px;
        white-space: nowrap;
      }
      .composer-select {
        border-radius: 999px;
        padding: 0 10px;
        background: #0f0f0f !important;
        border: 1px solid #2f2f2f !important;
        box-shadow: none !important;
        color: #dcdcdc;
        font-size: 12px;
        font-weight: 500;
        height: 32px;
        max-width: none;
        flex: 0 0 auto;
        min-width: 96px;
      }
      .composer-select:focus {
        outline: none;
      }
      .composer-select option {
        color: #111111;
        background: #f3f3f3;
      }
      .composer-select option:checked {
        color: #ffffff;
        background: #1f6feb;
      }
      .context-pill {
        display: inline-flex;
        align-items: center;
        border: 1px dashed #2d4a6f !important;
        box-shadow: none !important;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 500;
        color: #7ab7ff;
        background: rgba(16, 32, 56, 0.35) !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: none;
        flex: 0 0 auto;
      }
      .attach-hint {
        font-size: 11px;
        color: #9c9c9c;
        min-height: 16px;
      }
      .attach-hint.error {
        color: #f4a8ae;
      }
      .send-round {
        width: 52px;
        height: 32px;
        min-width: 52px;
        border-radius: 999px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
        background: #111111 !important;
        border: 1px solid #303030 !important;
        color: #f4f4f4 !important;
        flex-shrink: 0;
      }
      .send-round.is-streaming {
        min-width: 56px;
        width: 56px;
        background: #3a1012 !important;
        border-color: #a63a40 !important;
        color: #ffd8da !important;
      }
      .footer-row {
        margin-top: 2px;
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        padding: 0;
      }
      .footer-muted {
        color: var(--muted);
      }
      .footer-accent {
        color: #f2d74e;
      }
      .kbd {
        border: 1px solid var(--border);
        border-bottom-width: 2px;
        border-radius: 6px;
        padding: 1px 5px;
        font-size: 10px;
        color: var(--muted);
      }
      .jump-wrap {
        position: sticky;
        bottom: 10px;
        display: flex;
        justify-content: flex-end;
        pointer-events: none;
        margin-top: 8px;
      }
      .jump-btn {
        display: none;
        pointer-events: auto;
        border-radius: 999px;
        padding: 6px 10px;
        background: #0a0a0a;
        border: 1px solid #2a2a2a;
        color: var(--fg);
        font-size: 11px;
        box-shadow: none;
      }
      .jump-btn.show { display: inline-flex; }
      /* Theme alignment for visible chat UI */
      .global-top {
        border-bottom: 1px solid var(--border);
        padding: 8px 12px 6px;
        background: var(--bg-1);
      }
      .chat-title,
      .sheet-title,
      .sheet-card-title,
      .thread-title,
      .a {
        color: var(--fg);
      }
      .global-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .thread-section-title,
      .tool-muted,
      .attach-hint,
      .api-key-hint,
      .sheet-sub,
      .tasks-label,
      .task-meta,
      .view-all {
        color: var(--muted);
      }
      .thread-list {
        border-color: var(--border);
        background: var(--surface);
      }
      .thread-row:hover {
        border-color: var(--input-border);
        background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--surface) 88%, var(--fg) 12%));
      }
      .thread-row.active {
        border-color: var(--vscode-focusBorder, var(--accent));
        background: var(--vscode-list-activeSelectionBackground, color-mix(in srgb, var(--accent) 22%, var(--surface)));
      }
      .mention-menu {
        border-color: var(--input-border);
        background: var(--input-bg);
      }
      .mention-item.active {
        background: var(--vscode-list-activeSelectionBackground, color-mix(in srgb, var(--accent) 22%, var(--input-bg)));
      }
      .thread-close,
      .thread-pin,
      .menu-icon,
      .quick-new,
      .upload-btn,
      .composer-select,
      .api-key-input,
      .api-key-save,
      .action-item,
      textarea,
      .jump-btn,
      .sheet-close {
        border-color: var(--input-border);
        background: var(--input-bg);
        color: var(--input-fg);
      }
      .upload-btn::before {
        border-color: color-mix(in srgb, var(--fg) 36%, var(--input-border));
        color: color-mix(in srgb, var(--fg) 80%, var(--muted));
      }
      .menu-icon:hover,
      .quick-new:hover,
      .upload-btn:hover,
      .api-key-save:hover,
      .action-item:hover,
      .jump-btn:hover,
      .sheet-close:hover {
        transform: none;
        background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--input-bg) 84%, var(--fg) 16%));
      }
      .input {
        border-top: 1px solid var(--border);
        background: var(--bg-1);
      }
      textarea::placeholder {
        color: var(--muted);
      }
      textarea:focus,
      .composer-select:focus,
      .api-key-input:focus {
        outline: 1px solid var(--vscode-focusBorder, var(--accent));
        border-color: var(--vscode-focusBorder, var(--accent));
      }
      .action-menu {
        background: color-mix(in srgb, var(--bg-0) 66%, transparent);
      }
      .action-menu-sheet {
        border-color: var(--border);
        background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, var(--surface)) 0%, var(--surface) 34%, var(--bg-1) 100%);
        box-shadow: 0 20px 38px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
      }
      .sheet-card {
        border-color: var(--border);
        background: color-mix(in srgb, var(--surface) 88%, var(--bg-0));
      }
      .composer-select option {
        color: var(--input-fg);
        background: var(--input-bg);
      }
      .composer-select option:checked {
        color: var(--accent-fg);
        background: var(--accent);
      }
      .context-pill {
        border-color: color-mix(in srgb, var(--accent) 70%, var(--input-border)) !important;
        color: color-mix(in srgb, var(--accent) 75%, var(--fg));
        background: color-mix(in srgb, var(--accent) 16%, transparent) !important;
      }
      .attach-hint.error {
        color: var(--err);
      }
      .send-round {
        background: var(--accent) !important;
        border-color: transparent !important;
        color: var(--accent-fg) !important;
      }
      .quick-new {
        border-color: transparent;
        background: color-mix(in srgb, var(--accent) 84%, var(--input-bg));
        color: var(--accent-fg);
        font-weight: 600;
      }
      .settings-icon {
        width: 32px;
        min-width: 32px;
        padding: 0;
        font-size: 14px;
      }
      .panel-icon {
        width: 32px;
        min-width: 32px;
        padding: 0;
        font-size: 14px;
      }
      .quick-new:hover {
        background: var(--vscode-button-hoverBackground, var(--accent));
      }
      .send-round:hover {
        background: var(--vscode-button-hoverBackground, var(--accent)) !important;
      }
      .send-round.is-streaming {
        background: color-mix(in srgb, var(--err) 22%, var(--input-bg)) !important;
        border-color: color-mix(in srgb, var(--err) 58%, var(--input-border)) !important;
        color: color-mix(in srgb, var(--err) 88%, var(--fg)) !important;
      }
      .footer-accent {
        color: var(--vscode-terminal-ansiYellow, #f2d74e);
      }
      @media (max-width: 420px) {
        .input {
          padding: 8px 10px;
        }
        .composer-tools {
          padding: 7px 8px;
          gap: 6px;
        }
        .upload-btn {
          font-size: 12px;
        }
        textarea {
          min-height: 68px;
          padding: 10px 11px;
          font-size: 12px;
        }
        .input-actions {
          gap: 6px;
          flex-wrap: wrap;
        }
        .action-menu {
          padding: 10px;
        }
        .action-menu-sheet {
          max-height: 92vh;
          border-radius: 14px;
          padding: 10px;
        }
        .composer-select {
          max-width: none;
          font-size: 11px;
          padding: 0 2px;
          flex: 0 1 auto;
        }
        .context-pill {
          max-width: none;
          font-size: 11px;
          padding: 0;
        }
        .hint {
          display: none;
        }
        .tool-muted {
          display: none;
        }
        .mode-banner {
          margin: 0 10px 6px;
          font-size: 11px;
          padding: 7px 9px;
        }
        .tab {
          font-size: 11px;
          padding: 4px 8px;
        }
        .startup-title {
          letter-spacing: 0;
        }
      }
      @media (max-width: 600px) {
        .input-actions {
          flex-wrap: wrap;
        }
        .input-actions .spacer {
          display: none;
        }
        .send-round {
          margin-left: auto;
        }
      }
      @media (max-width: 330px) {
        #reasonSel {
          max-width: 96px;
        }
        .context-pill {
          display: none;
        }
      }

      /* Right panel (Codex-like) layout */
      .startup {
        display: none !important;
      }
      .toolbar,
      .tabs {
        display: none !important;
      }
      textarea {
        min-height: 64px;
        border-radius: 16px;
      }
      .chat-icon-btn {
        width: 24px;
        height: 24px;
        min-width: 24px;
        font-size: 16px;
      }
      .send-round {
        width: 52px;
        height: 34px;
        min-width: 52px;
      }
      .footer-row {
        padding: 0;
        margin-top: 2px;
        display: grid;
        grid-template-columns: auto auto 1fr;
        align-items: center;
        gap: 14px;
      }
      #usagePct {
        text-align: right;
        opacity: 0.65;
      }
      /* Wide composer + inline more panel */
      .global-top {
        padding: 6px 8px 4px;
      }
      .chat-shell {
        flex: 1;
        min-height: 0;
        margin: 8px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: color-mix(in srgb, var(--bg-0) 92%, var(--fg) 8%);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .panel {
        padding: 12px;
      }
      .mode-banner {
        margin: 0 8px 6px;
        padding: 7px 9px;
      }
      .input {
        padding: 10px 10px 9px;
        border-top: 1px solid var(--border);
        background: transparent;
      }
      .messages {
        gap: 12px;
      }
      .m {
        max-width: 100%;
      }
      .u {
        max-width: 88%;
      }
      .composer-form {
        gap: 0;
      }
      .composer-shell {
        position: relative;
        border: 1px solid color-mix(in srgb, var(--border) 92%, transparent);
        border-radius: 18px;
        background: color-mix(in srgb, var(--surface) 92%, var(--bg-0));
        padding: 8px;
        display: grid;
        gap: 7px;
      }
      textarea {
        min-height: 66px;
        border: none;
        border-radius: 12px;
        background: transparent;
        padding: 8px 10px;
        resize: vertical;
      }
      textarea:focus {
        outline: 1px solid var(--vscode-focusBorder, var(--accent));
        border-color: transparent;
      }
      .mention-menu {
        left: 8px;
        right: 8px;
        bottom: calc(100% - 2px);
      }
      .input-actions {
        gap: 6px;
      }
      .inline-context {
        gap: 6px;
        padding: 0 4px;
      }
      .inline-context > span {
        line-height: 1;
      }
      .context-pill {
        padding: 5px 8px;
      }
      .more-btn {
        min-width: 58px;
        height: 32px;
      }
      .action-menu {
        position: static;
        inset: auto;
        background: transparent;
        backdrop-filter: none;
        z-index: auto;
        display: block;
        padding: 0;
      }
      .action-menu.hidden {
        display: none !important;
      }
      .action-menu-sheet {
        width: 100%;
        max-height: none;
        border-radius: 14px;
        box-shadow: none;
        padding: 10px;
      }
      .sheet-grid {
        gap: 8px;
      }
      .sheet-card {
        border-radius: 12px;
      }
      @media (max-width: 600px) {
        .global-top {
          padding: 6px 6px 4px;
        }
        .chat-shell {
          margin: 6px;
        }
        .panel {
          padding: 10px;
        }
        .input {
          padding: 8px 6px;
        }
        .u {
          max-width: 95%;
        }
      }
      @media (max-width: 420px) {
        .composer-shell {
          padding: 7px;
        }
        textarea {
          min-height: 64px;
          padding: 7px 8px;
        }
        .input-actions {
          row-gap: 6px;
        }
        .context-pill {
          font-size: 11px;
          padding: 4px 7px;
        }
      }
    </style>
  </head>
  <body>
    <div id="jsGate" class="js-gate" role="status" aria-live="polite">
      <div class="js-gate-card">
        <div class="js-gate-title">Loading Playground AI UI…</div>
        <div class="js-gate-sub">If this doesn’t disappear, run <span class="kbd">Developer: Reload Window</span>.</div>
      </div>
    </div>
    <div id="setup" class="setup">
      <div class="setup-card">
        <h3>Connect Playground AI</h3>
        <p>Paste your API key to start chatting. You can update it anytime from command palette.</p>
        <input id="k" type="password" placeholder="xp_..." />
        <div style="height:8px"></div>
        <button id="ks" class="primary">Save API Key</button>
      </div>
    </div>

    <div id="app" class="app">
      <div class="startup">
        <div class="startup-head">
          <span class="startup-title">PLAYGROUND AI</span>
        </div>
        <div class="tasks-head">
          <span class="tasks-label">Tasks</span>
          <div class="startup-actions">
            <button id="histQuick" class="task-icon-btn" type="button" aria-label="Refresh history">&#9432;</button>
            <button id="repQuick" class="task-icon-btn" type="button" aria-label="Replay session">&#9881;</button>
            <button id="idxQuick" class="task-icon-btn" type="button" aria-label="Rebuild index">&#9998;</button>
          </div>
        </div>
        <div id="taskList" class="task-list">No task history yet.</div>
        <button id="viewAllTasks" class="view-all" type="button">View all (0)</button>
      </div>
      <div class="toolbar">
        <div class="toolbar-row">
          <span class="title">PLAYGROUND AI</span>
          <span class="toolbar-sub">Playground AI assistant</span>
          <div class="spacer"></div>
          <span id="ac" class="pill">images:0</span>
          <span class="pill">Local tools: on</span>
        </div>
        <div class="toolbar-row">
          <select id="mode">
            <option value="auto">Mode: Auto</option>
            <option value="plan">Mode: Plan</option>
            <option value="yolo">Mode: Full access</option>
          </select>
          <select id="safety">
            <option value="standard">Safety: Standard</option>
            <option value="aggressive">Safety: Aggressive</option>
          </select>
          <label class="pill"><input id="parallel" type="checkbox"> Parallel agents</label>
          <button id="hist" class="ghost">History</button>
          <button id="rep" class="ghost">Replay</button>
          <button id="idx" class="ghost">Rebuild Index</button>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-p="chat">Chat</button>
        <button class="tab" data-p="timeline">Timeline</button>
        <button class="tab" data-p="history">History</button>
        <button class="tab" data-p="index">Index</button>
        <button class="tab" data-p="agents">Agents</button>
        <button class="tab" data-p="exec">Execution</button>
      </div>
      <div class="global-top">
        <span class="chat-title">Playground Chat</span>
        <div class="global-actions">
          <button id="historyQuick" type="button" class="menu-icon panel-icon" aria-label="Open chat history" title="Open chat history">&#128339;</button>
          <button id="backToChatQuick" type="button" class="menu-icon panel-icon hidden" aria-label="Back to chat" title="Back to chat">&#8592;</button>
          <button id="newThreadQuick" type="button" class="menu-icon quick-new" aria-label="Start new chat">New chat</button>
        </div>
      </div>
      <div id="modeBanner" class="mode-banner hidden">Plan mode active: I will plan before acting.</div>

      <div class="chat-shell" role="region" aria-label="Playground chat">
        <div id="chat" class="panel active">
          <div id="chips" class="chips"></div>
          <div id="threadList" class="thread-list"></div>
          <div id="msgs" class="messages"></div>
          <div class="jump-wrap">
            <button id="jumpLatest" class="jump-btn" type="button">Jump to latest</button>
          </div>
        </div>
        <div id="timeline" class="panel"></div>
        <div id="history" class="panel"></div>
        <div id="index" class="panel"></div>
        <div id="agents" class="panel"></div>
        <div id="exec" class="panel"></div>

        <div class="input">
          <form id="composerForm" class="composer-form" novalidate>
            <div class="composer-shell">
              <textarea id="t" placeholder="Ask for follow-up changes" enterkeyhint="send"></textarea>
              <div id="mentionMenu" class="mention-menu hidden" role="listbox" aria-label="Mention suggestions"></div>
              <div class="input-actions">
                <button id="uploadBtn" class="upload-btn" type="button">Attach</button>
                <select id="modeQuick" class="composer-select">
                  <option value="auto">Mode: Auto</option>
                  <option value="plan">Mode: Plan</option>
                  <option value="yolo">Mode: Full access</option>
                </select>
                <label class="tool-toggle inline-context" for="ctxToggle">
                  <input id="ctxToggle" type="checkbox" checked />
                  <span id="contextPill" class="context-pill">IDE: on</span>
                </label>
                <span id="planModeChip" class="mode-plan-chip hidden" aria-live="polite">Plan mode</span>
                <select id="reasonSel" class="composer-select">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                  <option value="max">Extra High</option>
                </select>
                <button id="actionMenuBtn" type="button" class="menu-icon more-btn" aria-label="Open settings" title="More" aria-expanded="false">More</button>
                <button id="s" type="button" class="primary send-round" aria-label="Send">Send</button>
              </div>
              <div id="actionMenu" class="action-menu hidden" aria-hidden="true">
                <div class="action-menu-sheet" role="dialog" aria-label="Composer settings">
                  <div class="sheet-head">
                    <div>
                      <div class="sheet-title">More settings</div>
                      <div class="sheet-sub">Advanced controls inside your composer.</div>
                    </div>
                    <button id="actionMenuClose" type="button" class="sheet-close" aria-label="Close settings">x</button>
                  </div>

                  <div class="sheet-grid">
                    <div class="sheet-card">
                      <div class="sheet-card-title">Model</div>
                      <div class="sheet-row">
                        <select id="modelSel" class="composer-select">
                          <option value="${DEFAULT_PLAYGROUND_MODEL}">${DEFAULT_PLAYGROUND_MODEL}</option>
                        </select>
                      </div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Conversation</div>
                      <div class="sheet-row sheet-toggle">
                        <label class="tool-toggle" for="safetyQuick">
                          <span>Safety profile</span>
                          <select id="safetyQuick" class="composer-select">
                            <option value="standard">Standard</option>
                            <option value="aggressive">Aggressive</option>
                          </select>
                        </label>
                      </div>
                      <div class="sheet-row sheet-toggle">
                        <label class="tool-toggle">
                          <span>Parallel agents</span>
                          <input id="parallelQuick" type="checkbox" />
                        </label>
                      </div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Attachments</div>
                      <div class="sheet-row">
                        <span id="uploadCount" class="tool-muted">No images selected.</span>
                        <span class="tool-muted">PNG/JPEG/WEBP, up to 3 images, 4MB each.</span>
                      </div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Your API Key</div>
                      <div class="api-key-row">
                        <input id="apiKeyInline" class="api-key-input" type="password" placeholder="xp_..." />
                        <button id="apiKeyInlineSave" class="api-key-save" type="button">Save</button>
                      </div>
                      <div class="api-key-hint">Stored securely in VS Code secrets.</div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Panels</div>
                      <div class="sheet-grid">
                        <button class="action-item" type="button" data-menu-action="show:chat">Show Chat</button>
                        <button class="action-item" type="button" data-menu-action="show:timeline">Show Timeline</button>
                        <button class="action-item" type="button" data-menu-action="show:history">Show History</button>
                        <button class="action-item" type="button" data-menu-action="show:index">Show Index</button>
                        <button class="action-item" type="button" data-menu-action="show:agents">Show Agents</button>
                        <button class="action-item" type="button" data-menu-action="show:exec">Show Execution</button>
                      </div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Actions</div>
                      <div class="sheet-grid">
                        <button id="newThreadBtn" class="action-item" type="button">New Chat</button>
                        <button id="c" class="action-item" type="button">Clear Chat</button>
                        <button class="action-item" type="button" data-menu-action="history">Refresh History</button>
                        <button class="action-item" type="button" data-menu-action="replay">Replay Session</button>
                        <button class="action-item" type="button" data-menu-action="indexRebuild">Rebuild Index</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <input id="uploadInput" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple />
              <div id="attachHint" class="attach-hint">No images attached.</div>
              <div class="footer-row">
                <span id="runState" class="footer-muted">Local</span>
                <span id="permState" class="footer-accent">Full access</span>
                <span id="usagePct" class="footer-muted">0%</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>

    <script nonce="${n}">
${scriptSource}
    </script>
  </body>
</html>`;
}
//# sourceMappingURL=extension.js.map
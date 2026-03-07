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
const VSCODE_REFRESH_TOKEN_SECRET = "xpersona.playground.vscodeRefreshToken";
const VSCODE_PENDING_PKCE_KEY = "xpersona.playground.vscodePendingPkce";
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
    let trimmed = input.replace(/\\/g, "/").trim();
    trimmed = trimmed.replace(/^["'`]+|["'`]+$/g, "");
    // Models often echo @mentions as paths (e.g. "@README.md"). Strip that marker.
    if (trimmed.startsWith("@") && trimmed.length > 1)
        trimmed = trimmed.slice(1);
    if (!trimmed || trimmed.startsWith("/") || /^[a-z]:\//i.test(trimmed) || trimmed.includes(".."))
        return null;
    return trimmed;
}
function extractAtMentions(text) {
    const input = String(text || "");
    if (!input.includes("@"))
        return [];
    const out = [];
    const seen = new Set();
    const re = /(^|[\s([{])@([A-Za-z0-9._\\/\-][A-Za-z0-9._\\/\-]{0,259})/g;
    for (const match of input.matchAll(re)) {
        const raw = String(match[2] || "").trim();
        if (!raw)
            continue;
        const cleaned = raw.replace(/[),.;:!?]+$/g, "").trim();
        if (!cleaned)
            continue;
        if (seen.has(cleaned))
            continue;
        seen.add(cleaned);
        out.push(cleaned);
        if (out.length >= 24)
            break;
    }
    return out;
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
    const uriReg = vscode.window.registerUriHandler({
        handleUri: async (uri) => {
            await view.handleAuthCallback(uri);
        },
    });
    const cmds = [
        vscode.commands.registerCommand("xpersona.playground.prompt", () => view.show()),
        vscode.commands.registerCommand("xpersona.playground.openWithSelection", async () => {
            const e = vscode.window.activeTextEditor;
            if (!e)
                return;
            const t = e.selection.isEmpty ? e.document.lineAt(e.selection.active.line).text : e.document.getText(e.selection);
            await view.show(t.trim());
        }),
        vscode.commands.registerCommand("xpersona.playground.signIn", () => view.signInWithBrowser()),
        vscode.commands.registerCommand("xpersona.playground.signOut", () => view.signOut()),
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
        vscode.commands.registerCommand("xpersona.playground.undoLastChanges", () => view.undoLastAppliedChanges("editor")),
    ];
    context.subscriptions.push(reg, uriReg, ...cmds);
}
function deactivate() { }
class Provider {
    hasExecutionIntent(task) {
        return /\b(create|make|add|build|implement|refactor|fix|debug|run|test|lint|typecheck|command|patch|edit|ship|git|commit|push|pull|checkout|merge|rebase|branch)\b/i.test(task);
    }
    hasExplicitCommandRunIntent(task) {
        return /\b(run|execute|terminal|shell|command|test|tests|lint|typecheck|build|compile|install|npm|pnpm|yarn|pytest|jest|vitest|cargo|go test|mvn|gradle|git|commit|push|pull|checkout|merge|rebase|stash|cherry-pick)\b/i.test(task);
    }
    hasExplicitEditIntent(task) {
        return /\b(edit|update|modify|rewrite|change|refactor|implement|create|add|remove|delete|fix|patch|apply)\b/i.test(task);
    }
    hasCodeTaskSignals(task) {
        return (/\b(code|file|function|class|bug|error|fix|refactor|implement|build|test|lint|typecheck|stack trace|exception|module|api|endpoint|sql|schema|patch|edit|python|javascript|typescript|git|commit|push|pull|checkout|merge|rebase|branch)\b/i.test(task));
    }
    isFileInfoQuestion(task) {
        const t = task.trim().toLowerCase();
        const directQuestion = /\?$/.test(t) ||
            /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(t) ||
            /\b(explain|define|tell me)\b/.test(t);
        return (directQuestion &&
            /\b(current|this|the)\s+file\b/.test(t) &&
            /\b(about|do|does|contain|mean|purpose|summary)\b/.test(t) &&
            !this.hasExplicitEditIntent(t) &&
            !this.hasExplicitCommandRunIntent(t));
    }
    isConversationalPrompt(task) {
        const t = task.trim().toLowerCase();
        const acknowledgementLike = t.length <= 48 &&
            /^(awesome|great|nice|cool|perfect|sounds good|looks good|love it|that works|works for me|sweet|beautiful|amazing)\b/.test(t);
        const greetingOrSmallTalk = /^(hi|hello|hey|yo|sup|thanks|thank you|thx)\b/.test(t) ||
            /\b(how are you|what can you do|who are you)\b/.test(t);
        const directQuestion = /\?$/.test(t) ||
            /^(what|why|how|when|where|who|which|can|could|would|should|is|are|do|does|did)\b/.test(t) ||
            /\b(explain|define|tell me)\b/.test(t);
        const fileInfoQuestion = this.isFileInfoQuestion(t);
        const metaConversation = this.isMetaConversationPrompt(t);
        const hasPathMention = /\b[a-zA-Z0-9_./-]+\.[a-z0-9]{1,8}\b/i.test(t);
        const pathQuestion = hasPathMention && directQuestion && !this.hasExplicitEditIntent(t);
        return (acknowledgementLike ||
            greetingOrSmallTalk ||
            metaConversation ||
            pathQuestion ||
            fileInfoQuestion ||
            (directQuestion && !this.hasCodeTaskSignals(t) && !this.hasExecutionIntent(t) && !this.hasExplicitCommandRunIntent(t)));
    }
    isMetaConversationPrompt(task) {
        const t = task.trim().toLowerCase();
        if (!t)
            return false;
        return (/\b(conversation|chat|transcript|dialogue|thread)\b/.test(t) ||
            /\b(between me and (the )?(ai|assistant|model))\b/.test(t) ||
            /\b(the ai|the assistant|the model)\b/.test(t));
    }
    isSmallTalkPrompt(task) {
        const t = task.trim().toLowerCase();
        if (!t || t.length > 80)
            return false;
        if (this.hasCodeTaskSignals(t) || this.hasExecutionIntent(t) || this.hasExplicitEditIntent(t) || this.hasExplicitCommandRunIntent(t)) {
            return false;
        }
        const greeting = /^(hi|hello|hey|yo|sup|hiya|good morning|good afternoon|good evening)\b/.test(t) ||
            /\b(how are you|what can you do|who are you|what's up|hows it going|how's it going)\b/.test(t);
        const gratitude = /^(thanks|thank you|thx|appreciate it)\b/.test(t);
        const shortAck = t.length <= 24 && /^(ok|okay|cool|nice|great|sweet|perfect|got it|sounds good)\b/.test(t);
        return greeting || gratitude || shortAck;
    }
    wantsCodeEdits(task) {
        const t = task.trim().toLowerCase();
        if (!t)
            return false;
        if (this.isConversationalPrompt(t) || this.isFileInfoQuestion(t) || this.isMetaConversationPrompt(t))
            return false;
        const editVerb = /\b(edit|update|modify|rewrite|change|refactor|implement|create|add|remove|delete|fix|patch|apply|disable|turn off|stop using|get rid of|make it so|make it)\b/i.test(t);
        const codeSignal = this.hasCodeTaskSignals(t) || /\b(pinescript|pine|script|strategy|indicator)\b/i.test(t);
        return editVerb || (codeSignal && this.hasExecutionIntent(t));
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
        this.vscodeAccessToken = null;
        this.vscodeAccessTokenExpiresAtMs = 0;
        this.vscodeSignedInEmail = null;
        this.pendingPkce = null;
        this.undoBatches = [];
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
    pkceChallenge(verifier) {
        return (0, crypto_1.createHash)("sha256").update(verifier, "utf8").digest("base64url");
    }
    vscodeRedirectUri() {
        return "vscode://playgroundai.xpersona-playground/auth-callback";
    }
    async loadPendingPkce() {
        const fresh = this.pendingPkce && Date.now() - this.pendingPkce.createdAtMs < 10 * 60 * 1000;
        if (fresh && this.pendingPkce)
            return { state: this.pendingPkce.state, verifier: this.pendingPkce.verifier };
        const stored = this.ctx.globalState.get(VSCODE_PENDING_PKCE_KEY, null);
        const state = typeof stored?.state === "string" ? stored.state : "";
        const verifier = typeof stored?.verifier === "string" ? stored.verifier : "";
        const createdAtMs = typeof stored?.createdAtMs === "number" ? stored.createdAtMs : 0;
        if (!state || !verifier || !createdAtMs)
            return null;
        if (Date.now() - createdAtMs > 10 * 60 * 1000)
            return null;
        this.pendingPkce = { state, verifier, createdAtMs };
        return { state, verifier };
    }
    async storePendingPkce(state, verifier) {
        this.pendingPkce = { state, verifier, createdAtMs: Date.now() };
        await this.ctx.globalState.update(VSCODE_PENDING_PKCE_KEY, this.pendingPkce);
    }
    async clearPendingPkce() {
        this.pendingPkce = null;
        await this.ctx.globalState.update(VSCODE_PENDING_PKCE_KEY, null);
    }
    async getRefreshToken() {
        try {
            return (await this.ctx.secrets.get(VSCODE_REFRESH_TOKEN_SECRET)) ?? null;
        }
        catch {
            return null;
        }
    }
    async hasAnyAuth() {
        const refreshToken = await this.getRefreshToken();
        if (refreshToken)
            return true;
        try {
            const k = await this.ctx.secrets.get(API_KEY_SECRET);
            return Boolean(k && k.trim());
        }
        catch {
            return false;
        }
    }
    async ensureVscodeAccessToken() {
        const now = Date.now();
        if (this.vscodeAccessToken && now < this.vscodeAccessTokenExpiresAtMs - 60000)
            return this.vscodeAccessToken;
        const refreshToken = await this.getRefreshToken();
        if (!refreshToken)
            return null;
        const r = await req("POST", `${base()}/api/v1/playground/auth/vscode/token`, null, {
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }).catch(() => null);
        const token = typeof r?.access_token === "string" ? String(r.access_token) : "";
        const expiresIn = Number(r?.expires_in ?? 900);
        if (!token) {
            this.vscodeAccessToken = null;
            this.vscodeAccessTokenExpiresAtMs = 0;
            return null;
        }
        this.vscodeAccessToken = token;
        this.vscodeAccessTokenExpiresAtMs = now + Math.max(60, expiresIn) * 1000;
        return token;
    }
    async resolveRequestAuth() {
        let token = null;
        try {
            token = await this.ensureVscodeAccessToken();
        }
        catch {
            token = null;
        }
        if (token)
            return { bearer: token };
        let key = null;
        try {
            key = (await this.ctx.secrets.get(API_KEY_SECRET)) ?? null;
        }
        catch {
            key = null;
        }
        if (key && key.trim())
            return { apiKey: key.trim() };
        return null;
    }
    async refreshSignedInEmail() {
        const token = await this.ensureVscodeAccessToken();
        if (!token)
            return;
        const me = await req("GET", `${base()}/api/v1/playground/auth/vscode/me`, { bearer: token }).catch(() => null);
        const email = typeof me?.data?.email === "string" ? String(me.data.email) : null;
        if (email)
            this.vscodeSignedInEmail = email;
    }
    async postAuthState() {
        const refreshToken = await this.getRefreshToken();
        const signedIn = Boolean(refreshToken);
        this.post({ type: "authState", signedIn, email: this.vscodeSignedInEmail });
    }
    async signInWithBrowser() {
        const state = (0, crypto_1.randomBytes)(16).toString("hex");
        const verifier = (0, crypto_1.randomBytes)(32).toString("base64url");
        const challenge = this.pkceChallenge(verifier);
        await this.storePendingPkce(state, verifier);
        const u = new url_1.URL(`${base()}/api/v1/playground/auth/vscode/authorize`);
        u.searchParams.set("client_id", "vscode");
        u.searchParams.set("redirect_uri", this.vscodeRedirectUri());
        u.searchParams.set("state", state);
        u.searchParams.set("code_challenge", challenge);
        u.searchParams.set("code_challenge_method", "S256");
        this.post({ type: "status", text: "Opening browser sign-in..." });
        await vscode.env.openExternal(vscode.Uri.parse(u.toString()));
    }
    async handleAuthCallback(uri) {
        const authority = String(uri.authority || "");
        if (authority !== "playgroundai.xpersona-playground")
            return;
        const pathName = String(uri.path || "");
        if (!pathName.endsWith("auth-callback"))
            return;
        const params = new URLSearchParams(uri.query || "");
        const code = (params.get("code") ?? "").trim();
        const state = (params.get("state") ?? "").trim();
        if (!code || !state) {
            this.post({ type: "err", text: "Sign-in callback missing code/state." });
            return;
        }
        const pending = await this.loadPendingPkce();
        if (!pending || pending.state !== state) {
            this.post({ type: "err", text: "Sign-in state mismatch. Please try signing in again." });
            return;
        }
        const r = await req("POST", `${base()}/api/v1/playground/auth/vscode/token`, null, {
            grant_type: "authorization_code",
            code,
            code_verifier: pending.verifier,
        }).catch((e) => ({ error: err(e) }));
        if (r?.error) {
            this.post({ type: "err", text: `Sign-in failed: ${String(r.error).slice(0, 200)}` });
            return;
        }
        const accessToken = typeof r?.access_token === "string" ? String(r.access_token) : "";
        const refreshToken = typeof r?.refresh_token === "string" ? String(r.refresh_token) : "";
        const expiresIn = Number(r?.expires_in ?? 900);
        if (!accessToken || !refreshToken) {
            this.post({ type: "err", text: "Sign-in failed: missing tokens." });
            return;
        }
        await this.ctx.secrets.store(VSCODE_REFRESH_TOKEN_SECRET, refreshToken);
        this.vscodeAccessToken = accessToken;
        this.vscodeAccessTokenExpiresAtMs = Date.now() + Math.max(60, expiresIn) * 1000;
        await this.clearPendingPkce();
        await this.refreshSignedInEmail().catch(() => { });
        this.post({ type: "api", ok: true });
        await this.postAuthState();
        await this.loadHistory();
    }
    async signOut() {
        const refreshToken = await this.getRefreshToken();
        if (refreshToken) {
            await req("POST", `${base()}/api/v1/playground/auth/vscode/revoke`, null, {
                refresh_token: refreshToken,
            }).catch(() => null);
        }
        try {
            await this.ctx.secrets.delete(VSCODE_REFRESH_TOKEN_SECRET);
        }
        catch {
            // ignore
        }
        this.vscodeAccessToken = null;
        this.vscodeAccessTokenExpiresAtMs = 0;
        this.vscodeSignedInEmail = null;
        await this.clearPendingPkce().catch(() => { });
        const ok = await this.hasAnyAuth();
        this.post({ type: "api", ok });
        await this.postAuthState();
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
    toContextPath(uri) {
        const root = this.getWorkspaceRoot();
        if (!root)
            return uri.fsPath;
        const rel = toRelPath(root.uri, uri);
        const safe = normalizeWorkspaceRelativePath(rel);
        return safe || uri.fsPath;
    }
    async collectIdeContext(query, workspaceHash, auth) {
        const root = this.getWorkspaceRoot();
        const activeFile = await this.collectActiveFileContext(20000);
        const openFiles = await this.collectOpenEditorsContext(20, 6000);
        const diagnostics = this.collectDiagnostics(200);
        const git = await this.collectGitSummary(root);
        const discovery = await this.runSafeDiscovery(root);
        const indexedSnippets = await this.queryIndexForPrompt(workspaceHash, query, auth, 12);
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
    extractLikelyLookupTokens(text, max = 3) {
        const input = String(text || "");
        const mentions = new Set(extractAtMentions(input).map((x) => x.replace(/^@+/, "").toLowerCase()));
        const stop = new Set([
            "what", "how", "does", "work", "read", "look", "file", "this", "that", "please", "now", "can", "you", "the", "and", "for",
        ]);
        const out = [];
        const seen = new Set();
        for (const m of input.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g)) {
            const token = String(m[0] || "").trim();
            if (!token)
                continue;
            const lower = token.toLowerCase();
            if (seen.has(lower) || stop.has(lower) || mentions.has(lower))
                continue;
            // Bias toward symbol-like identifiers (snake/camel) that are likely in code.
            if (!token.includes("_") && !/[A-Z]/.test(token))
                continue;
            seen.add(lower);
            out.push(token);
            if (out.length >= max)
                break;
        }
        return out;
    }
    async collectSymbolWorkspaceContext(text, maxFiles, maxCharsPerItem) {
        const root = this.getWorkspaceRoot();
        if (!root)
            return [];
        const tokens = this.extractLikelyLookupTokens(text, 3);
        if (!tokens.length)
            return [];
        const perPath = new Map();
        for (const token of tokens) {
            const rg = await execFileReadOnly("rg", ["-n", "-S", "--no-heading", "--hidden", "-g", "!node_modules", "-g", "!.git", token, "."], root.uri.fsPath, 3000, 120000);
            if (!rg.ok || !rg.stdout.trim())
                continue;
            const lines = rg.stdout.split(/\r?\n/).filter(Boolean).slice(0, Math.max(20, maxFiles * 12));
            for (const line of lines) {
                const m = /^(.+?):(\d+):(.*)$/.exec(line);
                if (!m)
                    continue;
                const rel = normalizeWorkspaceRelativePath(m[1].replace(/\\/g, "/").replace(/^\.\//, ""));
                if (!rel)
                    continue;
                const preview = String(m[3] || "").trim();
                if (!preview)
                    continue;
                const existing = perPath.get(rel) || [];
                if (existing.length >= 6)
                    continue;
                existing.push({ token, line: preview });
                perPath.set(rel, existing);
            }
            if (perPath.size >= maxFiles)
                break;
        }
        const out = [];
        for (const [pathKey, matches] of perPath.entries()) {
            if (out.length >= maxFiles)
                break;
            const lines = matches
                .slice(0, 6)
                .map((m) => `[${m.token}] ${m.line}`)
                .join("\n");
            const excerptRaw = `Symbol matches:\n${lines}`;
            out.push({
                path: pathKey,
                language: languageFromPath(pathKey),
                excerpt: excerptRaw.slice(0, maxCharsPerItem),
            });
        }
        return out;
    }
    async collectActiveFileContext(maxChars) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return null;
        const document = editor.document;
        const fullText = document.getText();
        const selected = editor.selection.isEmpty ? "" : document.getText(editor.selection).slice(0, 6000);
        return {
            path: this.toContextPath(document.uri),
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
            const p = this.toContextPath(e.document.uri);
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
    async collectMentionedWorkspaceContext(text, maxItems, maxCharsPerItem, preExtractedMentions) {
        const root = this.getWorkspaceRoot();
        if (!root)
            return [];
        const tokens = Array.isArray(preExtractedMentions) ? preExtractedMentions : extractAtMentions(text);
        if (!tokens.length)
            return [];
        const out = [];
        const seen = new Set();
        for (const token of tokens) {
            if (out.length >= maxItems)
                break;
            const q = String(token || "").replace(/\\/g, "/").trim();
            if (!q)
                continue;
            let resolved;
            const direct = normalizeWorkspaceRelativePath(q);
            if (direct) {
                const directUri = vscode.Uri.joinPath(root.uri, ...direct.split("/"));
                try {
                    const stat = await vscode.workspace.fs.stat(directUri);
                    if (stat.type === vscode.FileType.Directory) {
                        resolved = { path: direct, kind: "folder" };
                    }
                    else if (stat.type === vscode.FileType.File) {
                        resolved = { path: direct, kind: "file" };
                    }
                }
                catch {
                    // direct path does not exist; fall back to mention index search below
                }
                if (!resolved) {
                    resolved = this.mentionCatalog.find((x) => x.path.toLowerCase() === direct.toLowerCase());
                }
            }
            if (!resolved) {
                const results = await this.searchWorkspaceMentions(q, 16).catch(() => []);
                const wantsFile = /\.[a-z0-9]{1,8}$/i.test(q) || q.includes(".");
                resolved = wantsFile ? results.find((r) => r.kind === "file") ?? results[0] : results[0];
            }
            if (!resolved)
                continue;
            if (seen.has(resolved.path))
                continue;
            seen.add(resolved.path);
            if (resolved.kind === "folder") {
                const uri = vscode.Uri.joinPath(root.uri, ...resolved.path.split("/"));
                try {
                    const entries = await vscode.workspace.fs.readDirectory(uri);
                    const sorted = entries
                        .slice()
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .slice(0, 200)
                        .map(([name, type]) => (type === vscode.FileType.Directory ? `${name}/` : name));
                    const extra = entries.length > 200 ? `\n… and ${entries.length - 200} more` : "";
                    out.push({
                        path: `${resolved.path}/`,
                        language: "text",
                        excerpt: `Folder listing (mentioned as @${q}):\n${sorted.join("\n")}${extra}`,
                    });
                }
                catch (e) {
                    out.push({
                        path: `${resolved.path}/`,
                        language: "text",
                        excerpt: `Failed to read folder listing (mentioned as @${q}): ${err(e)}`,
                    });
                }
                continue;
            }
            const uri = vscode.Uri.joinPath(root.uri, ...resolved.path.split("/"));
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.size > 2000000) {
                    out.push({
                        path: resolved.path,
                        language: languageFromPath(resolved.path),
                        excerpt: `Skipped (mentioned as @${q}): file too large (${stat.size} bytes).`,
                    });
                    continue;
                }
                const doc = await vscode.workspace.openTextDocument(uri);
                const full = doc.getText().replace(/\r\n/g, "\n");
                const excerptRaw = full.slice(0, maxCharsPerItem);
                const excerpt = full.length > excerptRaw.length
                    ? `${excerptRaw}\n\n… [truncated ${full.length - excerptRaw.length} chars]`
                    : excerptRaw;
                out.push({
                    path: resolved.path,
                    language: doc.languageId || languageFromPath(resolved.path),
                    excerpt,
                });
            }
            catch (e) {
                out.push({
                    path: resolved.path,
                    language: languageFromPath(resolved.path),
                    excerpt: `Failed to read file (mentioned as @${q}): ${err(e)}`,
                });
            }
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
    async queryIndexForPrompt(projectKey, query, auth, limit) {
        try {
            const response = await req("POST", `${base()}/api/v1/playground/index/query`, auth, {
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
            const auth = await this.resolveRequestAuth();
            if (!auth)
                return { status: "no-key", chunks: 0, message: "Sign in (browser) or set an API key before rebuilding index." };
            for (let i = 0; i < chunks.length; i += INDEX_BATCH_SIZE) {
                const batch = chunks.slice(i, i + INDEX_BATCH_SIZE);
                await req("POST", `${base()}/api/v1/playground/index/upsert`, auth, {
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
            this.post({ type: "status", text: "Sign in (browser) or set an API key before rebuilding workspace index." });
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
    async ensureActiveThread(auth, title) {
        if (this.activeThreadId && this.threads[this.activeThreadId])
            return this.activeThreadId;
        const sessionTitle = this.deriveThreadTitle(title);
        const s = await req("POST", `${base()}/api/v1/playground/sessions`, auth, {
            title: sessionTitle,
            mode: this.mode,
        }).catch((e) => ({ error: err(e) }));
        const id = s?.data?.id ? String(s.data.id) : null;
        if (!id) {
            const detail = typeof s?.error === "string" && s.error.trim() ? ` ${s.error.trim()}` : "";
            this.post({ type: "err", text: `Failed to create chat session.${detail}` });
            return null;
        }
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
                let hasApiKey = false;
                try {
                    const k = await this.ctx.secrets.get(API_KEY_SECRET);
                    hasApiKey = !!(k && k.trim());
                }
                catch (e) {
                    this.post({ type: "err", text: `Failed to read API key: ${err(e)}` });
                }
                const hasRefresh = Boolean(await this.getRefreshToken());
                if (hasRefresh)
                    await this.refreshSignedInEmail().catch(() => { });
                const ok = hasApiKey || hasRefresh;
                this.post({ type: "api", ok });
                await this.postAuthState();
                this.post({ type: "mode", value: this.mode });
                this.updateModeStatusItem();
                this.post({ type: "safety", value: this.safety });
                this.post({ type: "timeline", data: this.timeline });
                this.post({ type: "pendingActions", count: this.pendingActions.length });
                this.postUndoState();
                this.post({ type: "mentionsConfig", enabled: this.mentionsEnabled() });
                await this.postThreadState();
                if (ok && this.activeThreadId) {
                    await this.openSession(this.activeThreadId);
                }
                else if (!this.activeThreadId) {
                    this.post({ type: "load", data: [], threadId: null });
                }
            }
            else if (m.type === "signIn") {
                await this.signInWithBrowser();
            }
            else if (m.type === "signOut") {
                await this.signOut();
            }
            else if (m.type === "saveKey") {
                if (m.key?.trim())
                    await this.ctx.secrets.store(API_KEY_SECRET, m.key.trim());
                this.post({ type: "api", ok: true });
                await this.postAuthState();
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
                const threadId = typeof m.threadId === "string" ? String(m.threadId).trim() : "";
                if (Array.isArray(m.attachments) && m.attachments.length > attachments.length) {
                    this.post({ type: "status", text: "Some image attachments were skipped because they were invalid or unsupported." });
                }
                await this.ask(String(m.text || ""), Boolean(m.parallel), String(m.model || DEFAULT_PLAYGROUND_MODEL), String(m.reasoning || "medium"), {
                    includeIdeContext: m.includeIdeContext !== undefined ? Boolean(m.includeIdeContext) : true,
                    workspaceContextLevel: (m.workspaceContextLevel === "max" ? "max" : "max"),
                    attachments,
                    ...(threadId ? { threadId } : {}),
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
                await this.executePendingActions(undefined, this.activeThreadId || undefined);
            }
            else if (m.type === "undoLastChanges") {
                await this.undoLastAppliedChanges("panel");
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
        await this.postAuthState();
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
        const auth = await this.resolveRequestAuth();
        if (!auth)
            return this.post({ type: "err", text: "Not authenticated. Use Sign in (browser) or set an API key." });
        this.cancelRequested = false;
        this.pendingActions = [];
        this.lastRunMeta = null;
        this.post({ type: "pendingActions", count: 0 });
        this.addTimeline("intent", text.slice(0, 120));
        const conversational = this.isConversationalPrompt(text);
        const smallTalk = this.isSmallTalkPrompt(text);
        const strictConversationOnly = smallTalk &&
            !this.hasExplicitEditIntent(text) &&
            !this.hasExplicitCommandRunIntent(text) &&
            !this.hasExecutionIntent(text);
        const allowActions = !strictConversationOnly &&
            !conversational &&
            (this.hasExecutionIntent(text) || this.hasExplicitEditIntent(text) || this.hasExplicitCommandRunIntent(text));
        const requestedThreadId = typeof options.threadId === "string" ? options.threadId.trim() : "";
        if (requestedThreadId && requestedThreadId !== this.activeThreadId) {
            const existing = this.threads[requestedThreadId] || this.recentHistory.find((x) => x.id === requestedThreadId);
            if (existing)
                this.upsertThread(existing, true);
            this.activeThreadId = requestedThreadId;
            this.sessionId = requestedThreadId;
        }
        const activeThreadId = await this.ensureActiveThread(auth, text);
        if (!activeThreadId)
            return;
        const runThreadId = activeThreadId;
        this.postRun(runThreadId, { type: "start" });
        if (!conversational) {
            this.postRun(runThreadId, { type: "status", text: `Model: ${model} | Reasoning: ${reasoning}` });
        }
        const wantsEdits = !conversational && this.wantsCodeEdits(text);
        const taskWithReasoning = smallTalk
            ? `User message: "${text.trim()}". Reply briefly and friendly. No file edits, commands, or patches.`
            : wantsEdits
                ? `User request: "${text.trim()}". Prefer concrete code edits or patches. If the file or location is unclear, ask for the exact file or paste of the relevant code. Keep the response focused on applying the change, not theory.`
                : text;
        const requestMode = conversational || strictConversationOnly ? "generate" : this.mode;
        const requestReasoning = smallTalk ? "low" : reasoning;
        const fileInfoQuestion = this.isFileInfoQuestion(text);
        const mentionTokens = this.mentionsEnabled() ? extractAtMentions(text) : [];
        const shouldAttachContextForTask = true;
        const ideContextEnabled = true;
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
        if (ideContextEnabled && !strictConversationOnly) {
            try {
                collectedContext = await this.collectIdeContext(text, workspaceHash, auth);
            }
            catch (e) {
                contextStatus.notes?.push(`context partial: ${err(e)}`);
            }
            if (this.mentionsEnabled()) {
                try {
                    const mentioned = await this.collectMentionedWorkspaceContext(text, 8, 20000, mentionTokens);
                    if (mentioned.length) {
                        collectedContext = collectedContext || {};
                        const existing = new Set((collectedContext.openFiles ?? []).map((x) => x.path));
                        collectedContext.openFiles = [
                            ...mentioned.filter((x) => !existing.has(x.path)),
                            ...(collectedContext.openFiles ?? []),
                        ];
                        const label = mentioned
                            .slice(0, 6)
                            .map((x) => x.path)
                            .join(", ");
                        contextStatus.notes?.push(`@mentions: ${label}${mentioned.length > 6 ? ` (+${mentioned.length - 6} more)` : ""}`);
                    }
                }
                catch (e) {
                    contextStatus.notes?.push(`mentions partial: ${err(e)}`);
                }
            }
            try {
                const symbolMatches = await this.collectSymbolWorkspaceContext(text, 6, 8000);
                if (symbolMatches.length) {
                    collectedContext = collectedContext || {};
                    const existing = new Set((collectedContext.openFiles ?? []).map((x) => x.path));
                    collectedContext.openFiles = [
                        ...symbolMatches.filter((x) => !existing.has(x.path)),
                        ...(collectedContext.openFiles ?? []),
                    ];
                    const label = symbolMatches.slice(0, 4).map((x) => x.path).join(", ");
                    contextStatus.notes?.push(`symbol lookup: ${label}${symbolMatches.length > 4 ? ` (+${symbolMatches.length - 4} more)` : ""}`);
                }
            }
            catch (e) {
                contextStatus.notes?.push(`symbol lookup partial: ${err(e)}`);
            }
            if (collectedContext) {
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
        }
        contextStatus.preflightMs = Date.now() - preflightStarted;
        this.postRun(runThreadId, { type: "contextStatus", data: contextStatus });
        if (contextStatus.notes?.length) {
            this.postRun(runThreadId, { type: "status", text: contextStatus.notes.join(" | ") });
        }
        const runStream = async (historySessionId) => {
            let sawTokenEvent = false;
            let lastProgressState = "";
            const emitProgress = (label) => {
                if (!label || label === lastProgressState)
                    return;
                lastProgressState = label;
                this.postRun(runThreadId, { type: "status", text: label });
            };
            return (stream(`${base()}/api/v1/playground/assist`, auth, {
                mode: requestMode,
                task: taskWithReasoning,
                stream: true,
                model,
                ...(options.attachments?.length ? { attachments: options.attachments } : {}),
                ...(collectedContext ? { context: trimContextToMaxChars(collectedContext, MAX_TOTAL_CONTEXT_CHARS) } : {}),
                ...(historySessionId ? { historySessionId } : {}),
                workflowIntentId: `reasoning:${requestReasoning}`,
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
                        this.postRun(runThreadId, { type: "token", text: chunk });
                    }
                }
                else if (ev === "status") {
                    const statusText = typeof p === "string" ? p : String(p ?? "");
                    if (/model unavailable\. retrying with backup model\./i.test(statusText))
                        return;
                    const sanitizedStatus = statusText
                        .replace(/Model\s+"[^"]+"\s+unavailable\.\s+Falling back to\s+"[^"]+"\./i, "")
                        .trim();
                    if (sanitizedStatus)
                        this.postRun(runThreadId, { type: "status", text: sanitizedStatus });
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
                            this.postRun(runThreadId, { type: "status", text: logText.trim() });
                        }
                    }
                }
                else if (ev === "final") {
                    if (!sawTokenEvent) {
                        this.postRun(runThreadId, { type: "token", text: typeof p === "string" ? p : JSON.stringify(p) });
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
                    if (editItems.length && allowActions && !strictConversationOnly) {
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
                                this.postRun(runThreadId, { type: "editPreview", path: editPath, patch: editPatch });
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "commands_chunk") {
                    if (Array.isArray(p) && allowActions && !strictConversationOnly) {
                        for (const command of p) {
                            if (typeof command === "string" && command.trim()) {
                                this.pendingActions.push({ type: "command", command: command.trim() });
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "actions_chunk") {
                    if (Array.isArray(p) && allowActions && !strictConversationOnly) {
                        for (const action of p) {
                            if (!action || typeof action !== "object")
                                continue;
                            const type = String(action.type || "").toLowerCase();
                            if (type === "edit") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                const patch = typeof action.patch === "string" ? String(action.patch).trim() : "";
                                if (path && patch) {
                                    this.pendingActions.push({ type: "edit", path, patch });
                                    this.postRun(runThreadId, { type: "editPreview", path, patch });
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
                    this.postRun(runThreadId, {
                        type: "reasonCodes",
                        codes: codes,
                    });
                }
                else if (ev === "meta") {
                    this.lastRunMeta = (p || null);
                    this.postRun(runThreadId, { type: "meta", data: p });
                    const actionability = p?.actionability;
                    if (actionability?.summary && actionability.summary !== "valid_actions" && actionability.reason) {
                        this.postRun(runThreadId, { type: "status", text: actionability.reason });
                    }
                }
            }));
        };
        try {
            await runStream(activeThreadId);
        }
        catch (e) {
            if (this.cancelRequested) {
                this.postRun(runThreadId, { type: "status", text: "Response stopped." });
            }
            else {
                const message = err(e);
                if (activeThreadId && /historysessionid|unknown historysessionid/i.test(message)) {
                    this.addTimeline("session", "stale history session recovered");
                    await runStream(null).catch((inner) => this.postRun(runThreadId, { type: "err", text: err(inner) }));
                }
                else {
                    this.postRun(runThreadId, { type: "err", text: message });
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
        this.postRun(runThreadId, { type: "end" });
        if (this.cancelRequested) {
            this.pendingActions = [];
            this.post({ type: "pendingActions", count: 0 });
            return;
        }
        if (!allowActions) {
            if (this.pendingActions.length > 0) {
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
            }
            return;
        }
        if ((conversational || strictConversationOnly) && this.pendingActions.length > 0) {
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
            const explicitCommandIntent = this.hasExplicitCommandRunIntent(text);
            const decisionConfidence = typeof autonomy?.confidence === "number"
                ? autonomy.confidence
                : typeof meta.intent?.confidence === "number"
                    ? meta.intent.confidence
                    : undefined;
            const autoApplyEdits = policy === "full_auto"
                ? hasEditActions
                : policy === "preview_first"
                    ? false
                    : hasEditActions && (this.mode === "yolo" || this.mode === "auto") && autonomy?.autoApplyEdits !== false;
            let autoRunValidation = policy === "full_auto"
                ? hasCommandActions
                : policy === "preview_first"
                    ? false
                    : (this.mode === "yolo" || this.mode === "auto") &&
                        (autonomy?.autoRunValidation === true || explicitCommandIntent || hasCommandActions);
            const lowConfidenceCommandOnly = hasCommandActions &&
                !hasEditActions &&
                this.mode !== "yolo" &&
                !explicitCommandIntent &&
                typeof decisionConfidence === "number" &&
                decisionConfidence < 0.72;
            if (lowConfidenceCommandOnly) {
                autoRunValidation = false;
            }
            if (hasEditActions && !autoApplyEdits) {
                this.postRun(runThreadId, {
                    type: "status",
                    text: `Prepared ${this.pendingActions.length} action(s), not executed. Execution policy is ${policy}.`,
                });
                this.postRun(runThreadId, {
                    type: "actionOutcome",
                    data: {
                        filesChanged: 0,
                        checksRun: 0,
                        quality: "preview_only",
                        summary: "Edits prepared for preview, not auto-applied.",
                    },
                });
                this.postRun(runThreadId, { type: "prefill", text: "apply now" });
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
                    const editActionCount = actionsToExecute.filter((a) => a.type === "edit" || a.type === "mkdir" || a.type === "write_file").length;
                    const commandActionCount = actionsToExecute.filter((a) => a.type === "command").length;
                    const actionSummary = editActionCount > 0 && commandActionCount > 0
                        ? `${editActionCount} file action(s) and ${commandActionCount} command(s)`
                        : commandActionCount > 0
                            ? `${commandActionCount} command(s)`
                            : `${editActionCount} file action(s)`;
                    this.postRun(runThreadId, {
                        type: "status",
                        text: `Prepared ${actionSummary}. Auto-executing now.`,
                    });
                }
                await this.executePendingActions(actionsToExecute, runThreadId);
            }
            else {
                if (lowConfidenceCommandOnly && hasCommandActions && !hasEditActions) {
                    if (!conversational) {
                        this.postRun(runThreadId, { type: "status", text: "No runnable commands extracted; kept in preview." });
                        this.postRun(runThreadId, { type: "prefill", text: "run anyway" });
                    }
                    this.post({ type: "pendingActions", count: this.pendingActions.length });
                    return;
                }
                if (!conversational) {
                    const modeLabel = validation?.scope === "targeted" ? "Targeted validation skipped" : "Auto-execution skipped";
                    this.postRun(runThreadId, { type: "status", text: `Prepared ${this.pendingActions.length} action(s). ${modeLabel}. Execution policy prevented auto-run.` });
                }
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
            }
        }
    }
    async loadHistory() {
        const auth = await this.resolveRequestAuth();
        if (!auth) {
            this.recentHistory = [];
            await this.postThreadState();
            return;
        }
        const r = await req("GET", `${base()}/api/v1/playground/sessions?limit=30`, auth).catch(() => ({}));
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
        const auth = await this.resolveRequestAuth();
        if (!auth || !id)
            return;
        const existing = this.threads[id] || this.recentHistory.find((x) => x.id === id);
        this.upsertThread(existing || { id, title: "Untitled", mode: this.mode, updatedAt: null, isOpen: true }, true);
        this.activeThreadId = id;
        this.sessionId = id;
        const r = await req("GET", `${base()}/api/v1/playground/sessions/${encodeURIComponent(id)}/messages?includeAgentEvents=true`, auth).catch(() => ({}));
        const msgs = (r?.data || [])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content }));
        this.post({ type: "load", data: msgs.reverse(), threadId: id });
        this.addTimeline("history", `loaded ${id.slice(0, 8)}`);
        await this.postThreadState();
    }
    async newThread() {
        const auth = await this.resolveRequestAuth();
        if (!auth)
            return this.post({ type: "err", text: "Not authenticated. Use Sign in (browser) or set an API key." });
        const s = await req("POST", `${base()}/api/v1/playground/sessions`, auth, {
            title: "New chat",
            mode: this.mode,
        }).catch((e) => ({ error: err(e) }));
        const id = s?.data?.id ? String(s.data.id) : null;
        if (!id) {
            const detail = typeof s?.error === "string" && s.error.trim() ? ` ${s.error.trim()}` : "";
            return this.post({ type: "err", text: `Failed to create chat session.${detail}` });
        }
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
        const auth = await this.resolveRequestAuth();
        if (!auth || !this.activeThreadId)
            return this.post({ type: "status", text: "No active session yet. Send a prompt first, then replay." });
        const r = await req("POST", `${base()}/api/v1/playground/replay`, auth, {
            sessionId: this.activeThreadId,
            workspaceFingerprint: "vscode",
            mode: this.mode,
        }).catch(() => ({}));
        const s = r?.data?.driftReport?.summary || "Replay prepared.";
        const st = r?.data?.replayPlan?.steps || [];
        this.post({ type: "assistant", text: `${s}\n\n${st.map((x, i) => `${i + 1}. ${x}`).join("\n")}` });
        this.addTimeline("replay", s);
    }
    async executePendingActions(actions, threadIdOverride) {
        const auth = await this.resolveRequestAuth();
        if (!auth)
            return this.post({ type: "err", text: "Not authenticated. Use Sign in (browser) or set an API key." });
        const runThreadId = threadIdOverride || this.activeThreadId || null;
        const rawActionList = (actions && actions.length ? actions : this.pendingActions).slice();
        const seenActionKeys = new Set();
        const actionList = rawActionList.filter((action) => {
            const actionKey = JSON.stringify(action);
            if (seenActionKeys.has(actionKey))
                return false;
            seenActionKeys.add(actionKey);
            return true;
        });
        if (!actionList.length)
            return this.postRun(runThreadId, { type: "status", text: "No pending actions to execute." });
        const expectedFileChanges = actionList.some((action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file");
        const editActionCount = actionList.filter((action) => action.type === "edit" || action.type === "mkdir" || action.type === "write_file").length;
        const commandActionCount = actionList.filter((action) => action.type === "command").length;
        const executionSummary = editActionCount > 0 && commandActionCount > 0
            ? `${editActionCount} file action(s) and ${commandActionCount} command(s)`
            : commandActionCount > 0
                ? `${commandActionCount} command(s)`
                : `${editActionCount} file action(s)`;
        this.postRun(runThreadId, { type: "status", text: `Executing ${executionSummary}...` });
        const r = await req("POST", `${base()}/api/v1/playground/execute`, auth, {
            sessionId: runThreadId || undefined,
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
            this.postRun(runThreadId, { type: "err", text: r.error });
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
        this.postRun(runThreadId, { type: "execLogs", data: logs });
        let appliedEdits = 0;
        let launchedCommands = 0;
        const applyErrors = [];
        const changedPaths = new Set();
        const perFileStatuses = [];
        const undoFileSnapshots = new Map();
        const undoCreatedDirs = new Set();
        for (const row of results) {
            if (row.status !== "approved" || !row.action)
                continue;
            if (row.action.type === "edit") {
                const previewPatch = row.action.patch || row.action.diff || "";
                if (previewPatch.trim()) {
                    this.postRun(runThreadId, { type: "editPreview", path: row.action.path || "unknown", patch: previewPatch });
                }
                const applied = await this.applyEditAction({
                    path: row.action.path,
                    patch: row.action.patch,
                    diff: row.action.diff,
                }, undoFileSnapshots);
                perFileStatuses.push({
                    path: row.action.path || "unknown",
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied" || applied.status === "partial") {
                    appliedEdits += 1;
                    changedPaths.add(row.action.path || "unknown");
                    this.postRun(runThreadId, { type: "fileAction", path: row.action.path || "unknown", status: applied.status, reason: applied.reason || "" });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path || "unknown"}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "mkdir" && row.action.path) {
                const applied = await this.applyMkdirAction({ path: row.action.path }, undoCreatedDirs);
                perFileStatuses.push({
                    path: row.action.path,
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied") {
                    appliedEdits += 1;
                    changedPaths.add(row.action.path);
                    this.postRun(runThreadId, { type: "fileAction", path: row.action.path, status: "applied", reason: "Directory created" });
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
                }, undoFileSnapshots);
                perFileStatuses.push({
                    path: row.action.path,
                    status: applied.status,
                    ...(applied.reason ? { reason: applied.reason } : {}),
                });
                if (applied.status === "applied") {
                    appliedEdits += 1;
                    changedPaths.add(row.action.path);
                    this.postRun(runThreadId, { type: "fileAction", path: row.action.path, status: "applied", reason: "File created/updated" });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "command" && row.action.command) {
                this.postRun(runThreadId, { type: "terminalCommand", command: row.action.command });
                this.runApprovedCommand(row.action.command);
                launchedCommands += 1;
            }
        }
        const approved = results.filter((x) => x.status === "approved").length;
        this.postRun(runThreadId, {
            type: "status",
            text: `Execute finished: ${approved}/${results.length} approved. Applied ${appliedEdits} edit(s), launched ${launchedCommands} command(s).`,
        });
        if (applyErrors.length) {
            this.postRun(runThreadId, { type: "err", text: `Some approved edits were not auto-applied:\n- ${applyErrors.join("\n- ")}` });
        }
        this.postRun(runThreadId, {
            type: "actionOutcome",
            data: {
                filesChanged: changedPaths.size,
                checksRun: launchedCommands,
                quality: applyErrors.length || (expectedFileChanges && changedPaths.size === 0) ? "needs_attention" : "good",
                summary: applyErrors.length
                    ? "Applied edits with warnings. Review rejected patches."
                    : expectedFileChanges && changedPaths.size === 0
                        ? "No file edits were applied."
                        : "Actions completed successfully.",
                perFile: perFileStatuses,
            },
        });
        if (appliedEdits > 0) {
            const undoEntries = [
                ...Array.from(undoFileSnapshots.values()),
                ...Array.from(undoCreatedDirs).map((dirPath) => ({ kind: "dir", path: dirPath })),
            ];
            if (undoEntries.length > 0) {
                this.pushUndoBatch(undoEntries, `Revert ${appliedEdits} Playground file change(s)`);
            }
        }
        this.postUndoState();
        this.addTimeline("execute", `approved ${approved}/${results.length}`);
        const toRemove = new Set(actionList.map((action) => JSON.stringify(action)));
        this.pendingActions = this.pendingActions.filter((action) => !toRemove.has(JSON.stringify(action)));
        this.post({ type: "pendingActions", count: this.pendingActions.length });
    }
    async captureUndoFileSnapshot(root, rel, collector) {
        if (!collector || collector.has(rel))
            return;
        const target = vscode.Uri.joinPath(root.uri, ...rel.split("/").filter(Boolean));
        try {
            const buf = await vscode.workspace.fs.readFile(target);
            collector.set(rel, {
                kind: "file",
                path: rel,
                existed: true,
                content: Buffer.from(buf).toString("utf8"),
            });
        }
        catch {
            collector.set(rel, { kind: "file", path: rel, existed: false, content: "" });
        }
    }
    async applyEditAction(action, undoCollector) {
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
        await this.captureUndoFileSnapshot(root, rel, undoCollector);
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
    async applyMkdirAction(action, undoCreatedDirs) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for mkdir action." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open." };
        const target = vscode.Uri.joinPath(root.uri, ...rel.split("/").filter(Boolean));
        let existedBefore = true;
        try {
            await vscode.workspace.fs.stat(target);
        }
        catch {
            existedBefore = false;
        }
        await vscode.workspace.fs.createDirectory(target);
        await vscode.workspace.fs.stat(target);
        if (!existedBefore && undoCreatedDirs)
            undoCreatedDirs.add(rel);
        return { status: "applied" };
    }
    async applyWriteFileAction(action, undoCollector) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for write_file action." };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open." };
        await this.captureUndoFileSnapshot(root, rel, undoCollector);
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
    pushUndoBatch(entries, summary) {
        const normalized = entries.filter((entry) => !!entry?.path);
        if (!normalized.length)
            return;
        this.undoBatches.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            entries: normalized,
            summary,
        });
        if (this.undoBatches.length > 20) {
            this.undoBatches = this.undoBatches.slice(-20);
        }
    }
    postUndoState() {
        const latest = this.undoBatches[this.undoBatches.length - 1];
        this.post({
            type: "undoState",
            available: this.undoBatches.length > 0,
            count: this.undoBatches.length,
            latestSummary: latest?.summary || "",
            latestAt: latest?.createdAt || "",
        });
    }
    async undoLastAppliedChanges(source = "command") {
        if (!this.undoBatches.length) {
            this.post({ type: "status", text: "Nothing to undo yet." });
            return;
        }
        const root = this.getWorkspaceRoot();
        if (!root) {
            this.post({ type: "err", text: "No workspace folder open. Unable to undo changes." });
            return;
        }
        const batch = this.undoBatches.pop();
        const errors = [];
        let reverted = 0;
        const entries = [...batch.entries].reverse();
        for (const entry of entries) {
            const target = vscode.Uri.joinPath(root.uri, ...entry.path.split("/").filter(Boolean));
            try {
                if (entry.kind === "file") {
                    if (entry.existed) {
                        await vscode.workspace.fs.writeFile(target, Buffer.from(entry.content, "utf8"));
                    }
                    else {
                        await vscode.workspace.fs.delete(target, { recursive: false, useTrash: false });
                    }
                    reverted += 1;
                    continue;
                }
                await vscode.workspace.fs.delete(target, { recursive: false, useTrash: false });
                reverted += 1;
            }
            catch (e) {
                errors.push(`${entry.path}: ${err(e)}`);
            }
        }
        const origin = source === "panel" ? "panel" : source === "editor" ? "editor" : "command";
        if (errors.length > 0) {
            this.post({
                type: "err",
                text: `Undo completed with warnings from ${origin}. Reverted ${reverted}/${entries.length} item(s):\n- ${errors.join("\n- ")}`,
            });
        }
        else {
            this.post({ type: "status", text: `Undo complete (${origin}): reverted ${reverted} item(s).` });
        }
        this.addTimeline("undo", `${origin} reverted ${reverted}/${entries.length}`);
        this.postUndoState();
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
function req(method, u, auth, body) {
    return new Promise((resolve, reject) => {
        const x = new url_1.URL(u);
        const c = x.protocol === "https:" ? https : http;
        const p = body === undefined ? "" : JSON.stringify(body);
        const headers = {
            "Content-Type": "application/json",
        };
        if (auth?.apiKey) {
            headers["X-API-Key"] = auth.apiKey;
            if (!headers.Authorization)
                headers.Authorization = `Bearer ${auth.apiKey}`;
        }
        if (auth?.bearer) {
            headers.Authorization = `Bearer ${auth.bearer}`;
        }
        const r = c.request({
            hostname: x.hostname,
            port: x.port || (x.protocol === "https:" ? 443 : 80),
            path: x.pathname + x.search,
            method,
            headers: {
                ...headers,
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
function stream(u, auth, body, options, onEvent) {
    return new Promise((resolve, reject) => {
        const CONNECT_TIMEOUT_MS = 20000;
        const IDLE_TIMEOUT_MS = 45000;
        const x = new url_1.URL(u);
        const c = x.protocol === "https:" ? https : http;
        const p = JSON.stringify(body);
        const headers = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
        };
        if (auth?.apiKey) {
            headers["X-API-Key"] = auth.apiKey;
            if (!headers.Authorization)
                headers.Authorization = `Bearer ${auth.apiKey}`;
        }
        if (auth?.bearer) {
            headers.Authorization = `Bearer ${auth.bearer}`;
        }
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
                ...headers,
                "Content-Length": Buffer.byteLength(p),
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
    return (vscode.workspace.getConfiguration("xpersona.playground").get("baseApiUrl") || "https://xpersona.co").replace(/\/$/, "");
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
        overflow: hidden;
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
      .stream-pending .m-body {
        color: color-mix(in srgb, var(--fg) 72%, var(--muted) 28%);
        font-style: italic;
      }
      .reasoning {
        max-width: min(760px, calc(100% - 8px));
      }
      .reasoning-disclosure {
        margin: 0;
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface) 86%, var(--bg-0));
        overflow: hidden;
      }
      .reasoning-disclosure > summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
        font-weight: 600;
        color: color-mix(in srgb, var(--fg) 84%, var(--muted));
        border-bottom: 1px solid color-mix(in srgb, var(--surface-border) 74%, transparent);
        background: color-mix(in srgb, var(--surface) 78%, var(--bg-0));
      }
      .reasoning-disclosure > summary::-webkit-details-marker {
        display: none;
      }
      .reasoning-summary-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .reasoning-live {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 10px;
        color: color-mix(in srgb, var(--accent) 72%, var(--fg) 28%);
      }
      .reasoning-live i {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 88%, white 12%);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 38%, transparent);
        animation: reasoning-pulse 1.2s ease-out infinite;
      }
      .reasoning-list {
        margin: 0;
        padding: 8px 14px 10px 24px;
        display: grid;
        gap: 6px;
        font-size: 12px;
        color: color-mix(in srgb, var(--fg) 74%, var(--muted) 26%);
      }
      .reasoning-list li {
        overflow-wrap: anywhere;
      }
      @keyframes reasoning-pulse {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 0%, transparent);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent);
        }
      }
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
      .diff-card[data-lang] {
        --lang-accent: var(--accent);
      }
      .diff-card[data-lang="ts"] { --lang-accent: #38bdf8; }
      .diff-card[data-lang="js"] { --lang-accent: #fbbf24; }
      .diff-card[data-lang="py"] { --lang-accent: #60a5fa; }
      .diff-card[data-lang="go"] { --lang-accent: #22d3ee; }
      .diff-card[data-lang="rust"] { --lang-accent: #f97316; }
      .diff-card[data-lang="json"] { --lang-accent: #a78bfa; }
      .diff-card[data-lang="yaml"] { --lang-accent: #34d399; }
      .diff-card[data-lang="html"] { --lang-accent: #fb7185; }
      .diff-card[data-lang="css"] { --lang-accent: #818cf8; }
      .diff-card[data-lang="shell"] { --lang-accent: #4ade80; }
      .diff-card[data-lang="sql"] { --lang-accent: #f472b6; }
      .diff-card[data-lang="toml"] { --lang-accent: #facc15; }
      .diff-card[data-lang="plain"] { --lang-accent: var(--accent); }
      .diff-card[data-lang] .diff-head {
        border-left: 3px solid color-mix(in srgb, var(--lang-accent) 80%, var(--surface-border));
        padding-left: 7px;
      }
      .diff-row {
        display: grid;
        grid-template-columns: 44px 44px 16px 1fr;
        width: fit-content;
        min-width: 100%;
        transition: background .18s ease;
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
        background: linear-gradient(90deg, var(--diff-add-bg) 0%, color-mix(in srgb, var(--diff-add-bg) 65%, var(--lang-accent)) 100%);
        color: color-mix(in srgb, var(--diff-add-fg) 75%, var(--fg));
      }
      .diff-row.del .sig,
      .diff-row.del .txt {
        background: linear-gradient(90deg, var(--diff-del-bg) 0%, color-mix(in srgb, var(--diff-del-bg) 70%, var(--lang-accent)) 100%);
        color: color-mix(in srgb, var(--diff-del-fg) 72%, var(--fg));
      }
      .diff-row.add:hover .sig,
      .diff-row.add:hover .txt {
        background: linear-gradient(90deg, color-mix(in srgb, var(--diff-add-bg) 80%, var(--lang-accent)) 0%, color-mix(in srgb, var(--diff-add-bg) 50%, var(--lang-accent)) 100%);
      }
      .diff-row.del:hover .sig,
      .diff-row.del:hover .txt {
        background: linear-gradient(90deg, color-mix(in srgb, var(--diff-del-bg) 80%, var(--lang-accent)) 0%, color-mix(in srgb, var(--diff-del-bg) 50%, var(--lang-accent)) 100%);
      }
      .diff-row.meta .sig,
      .diff-row.meta .txt {
        color: color-mix(in srgb, var(--fg) 55%, var(--muted));
        background: color-mix(in srgb, var(--surface) 62%, var(--bg-0));
      }
      .diff-body .tok-keyword { color: color-mix(in srgb, var(--accent) 70%, #ff79c6 30%); font-weight: 600; }
      .diff-body .tok-string { color: color-mix(in srgb, #f9e2af 70%, var(--fg)); }
      .diff-body .tok-number { color: color-mix(in srgb, #89b4fa 70%, var(--fg)); }
      .diff-body .tok-comment { color: color-mix(in srgb, var(--muted) 80%, #94a3b8 20%); font-style: italic; }
      .diff-body .tok-boolean { color: color-mix(in srgb, #c4b5fd 70%, var(--fg)); font-weight: 600; }
      .diff-body .tok-type { color: color-mix(in srgb, #fda4af 70%, var(--fg)); }
      .diff-body .tok-func { color: color-mix(in srgb, #5eead4 70%, var(--fg)); }
      .diff-body .tok-key { color: color-mix(in srgb, #fca5a5 70%, var(--fg)); }
      .diff-body .tok-prop { color: color-mix(in srgb, #a5b4fc 70%, var(--fg)); }
      .diff-body .tok-tag { color: color-mix(in srgb, #f472b6 70%, var(--fg)); }
      .diff-body .tok-attr { color: color-mix(in srgb, #fde047 70%, var(--fg)); }
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
        border-top: none;
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
        cursor: pointer;
        gap: 6px;
        user-select: none;
      }
      .mode-plan-chip:hover {
        transform: none;
        border-color: rgba(138, 188, 255, 0.85);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.44), rgba(6, 182, 212, 0.32));
      }
      .mode-plan-chip:active {
        transform: none;
        opacity: 0.92;
      }
      .plan-chip-x {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 1px solid rgba(215, 235, 255, 0.38);
        background: rgba(0, 0, 0, 0.18);
        font-size: 11px;
        line-height: 1;
        color: rgba(215, 235, 255, 0.92);
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
      .sheet-head-actions {
        display: flex;
        align-items: center;
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
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        padding: 2px 2px 0;
      }
      .footer-muted {
        color: color-mix(in srgb, var(--fg) 55%, var(--muted) 45%);
      }
      .footer-accent {
        color: color-mix(in srgb, var(--accent) 74%, #f2d74e 26%);
        font-weight: 600;
      }
      .footer-row #usagePct {
        margin-left: auto;
        text-align: right;
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
        border-bottom: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
        background: linear-gradient(to bottom, color-mix(in srgb, var(--bg-1) 94%, black 6%), transparent);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 12px 16px 10px;
      }
      .brand-block {
        display: grid;
        gap: 2px;
      }
      .brand-kicker {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--fg) 96%, var(--muted));
      }
      .brand-sub {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 48%, var(--muted) 52%);
      }
      .chat-title,
      .sheet-title,
      .sheet-card-title,
      .thread-title,
      .a {
        color: var(--fg);
      }
      .chat-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .global-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
        max-width: 100%;
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
      .menu-icon,
      .quick-new {
        height: 32px;
        border-radius: 999px;
      }
      .menu-icon {
        width: 32px;
        min-width: 32px;
        padding: 0;
      }
      .quick-new {
        padding: 0 14px 0 12px;
        font-weight: 700;
        white-space: nowrap;
      }
      .quick-new::before {
        content: "+";
        margin-right: 6px;
        opacity: 0.84;
      }
      .input {
        border-top: 1px solid var(--border);
        background: var(--bg-1);
      }
      .chips {
        padding: 10px 18px 0;
      }
      .messages {
        padding: 26px 22px 72px;
        gap: 26px;
      }
      .m-body {
        font-size: 14px;
        line-height: 1.7;
      }
      .m-time {
        margin-top: 8px;
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 42%, var(--muted) 58%);
      }
      .m {
        display: grid;
      }
      .u {
        align-self: flex-end;
        justify-self: end;
        margin-left: auto;
        padding: 14px 16px;
        border-radius: 20px;
        border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
        background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, white 6%), color-mix(in srgb, var(--surface) 98%, black 2%));
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
      }
      .a {
        align-self: flex-start;
        padding: 0;
        background: transparent;
        color: var(--fg);
      }
      .a .m-body {
        max-width: min(760px, calc(100% - 76px));
      }
      .u .m-body {
        max-width: 100%;
      }
      .cmd {
        align-self: flex-start;
        max-width: 100%;
        opacity: 0.78;
      }
      .cmd .m-body {
        font-size: 12px;
      }
      .e {
        align-self: flex-start;
        max-width: min(760px, calc(100% - 8px));
        padding: 14px 16px;
        border-radius: 18px;
      }
      .jump-wrap {
        padding: 0 22px;
      }
      .messages:empty::before {
        content: "";
        display: none;
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
        padding: 12px 16px 10px;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
        background: linear-gradient(180deg, color-mix(in srgb, var(--bg-1) 92%, black 8%), transparent);
      }
      .chat-shell {
        flex: 1;
        min-height: 0;
        margin: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 0;
        gap: 8px;
      }
      .stage-shell {
        flex: 1;
        min-height: 0;
        border-radius: 0;
        overflow: hidden;
        display: flex;
        background: transparent;
      }
      .threads-overlay-backdrop {
        position: fixed;
        inset: 0;
        z-index: 45;
        display: none;
        background: color-mix(in srgb, var(--bg-0) 70%, transparent);
      }
      .threads-overlay-backdrop.show {
        display: block;
      }
      .threads-overlay-open #stageThreads {
        display: block !important;
        position: fixed;
        right: 16px;
        top: 92px;
        width: min(520px, calc(100vw - 32px));
        max-height: calc(100vh - 140px);
        overflow: auto;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: color-mix(in srgb, var(--surface) 94%, var(--bg-0));
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        z-index: 50;
        padding: 12px 12px 16px;
      }
      .threads-overlay-open #stageThreads.panel {
        padding: 12px 12px 16px;
      }
      @media (max-width: 840px) {
        .threads-overlay-open #stageThreads {
          right: 12px;
          left: 12px;
          width: auto;
          max-height: calc(100vh - 120px);
        }
      }
      .stage-shell .panel {
        flex: 1;
        min-height: 0;
        overflow: auto;
        scrollbar-gutter: stable both-edges;
        padding: 0 16px;
      }
      #stageBlank.panel {
        padding: 0 16px;
        white-space: normal;
      }
      #stageThreads.panel {
        white-space: normal;
      }
      .dock-shell {
        flex: 0 0 auto;
        border: 1px solid var(--border);
        border-radius: 20px;
        background: color-mix(in srgb, var(--surface) 96%, black 4%);
        overflow: visible;
        display: flex;
        flex-direction: column;
        cursor: text;
        padding: 10px 12px;
        position: sticky;
        bottom: 10px;
        z-index: 30;
        margin: 0 16px 16px;
        box-shadow: 0 -12px 26px rgba(0, 0, 0, 0.28);
      }
      .dock-shell:focus-within {
        border-color: var(--vscode-focusBorder, var(--accent));
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder, var(--accent)) 75%, transparent);
      }
      .dock-shell .input {
        padding: 0;
        border-top: none;
        background: transparent;
      }
      .dock-shell .composer-shell {
        border: none;
        background: transparent;
        padding: 0;
        border-radius: 0;
      }
      .dock-shell textarea {
        border-radius: 16px;
        background: transparent;
        padding: 10px 12px;
      }
      .chat-panel {
        flex: 1;
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        padding: 0 0 8px;
      }
      .chat-panel .jump-wrap {
        bottom: 10px;
      }
      .brand-kicker {
        font-size: 11px;
        letter-spacing: 0.08em;
      }
      .brand-sub {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 68%, var(--muted));
      }
      .mode-banner {
        margin: 0 8px 6px;
        padding: 7px 9px;
      }
      .input {
        padding: 10px 10px 9px;
        border-top: none;
        background: transparent;
      }
      .messages {
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 18px 0 20px;
        max-width: 840px;
        margin: 0 auto;
      }
      .m-body {
        font-size: 13px;
        line-height: 1.65;
        overflow-wrap: anywhere;
      }
      .m-time {
        font-size: 10px;
      }
      .messages:empty::before {
        content: "";
        display: none;
      }
      .m {
        max-width: min(840px, calc(100% - 8px));
      }
      .u {
        max-width: 82%;
        border-radius: 18px;
        box-shadow: none;
        background: color-mix(in srgb, var(--surface) 92%, black 8%);
        border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
      }
      .composer-form {
        gap: 0;
      }
      .composer-shell {
        position: relative;
        border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
        border-radius: 16px;
        background: color-mix(in srgb, var(--surface) 92%, black 8%);
        padding: 8px;
        display: grid;
        gap: 7px;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          background 160ms ease;
      }
      .composer-shell.ide-context-on {
        border-color: color-mix(in srgb, var(--accent) 82%, white 18%);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent),
          0 0 28px color-mix(in srgb, var(--accent) 22%, transparent),
          inset 0 1px 0 color-mix(in srgb, white 7%, transparent);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent) 10%, var(--surface) 90%) 0%,
          var(--surface) 100%
        );
      }
      textarea {
        min-height: 64px;
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
        gap: 10px;
      }
      .input-actions.minimal {
        flex-wrap: nowrap;
        align-items: center;
      }
      .icon-btn {
        position: relative;
        width: 32px;
        height: 32px;
        min-width: 32px;
        border-radius: 999px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--input-border);
        background: var(--input-bg);
        color: var(--input-fg);
        font-size: 14px;
        line-height: 1;
      }
      .icon-btn:hover {
        transform: none;
        background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--input-bg) 84%, var(--fg) 16%));
      }
      .attach-btn {
        font-size: 18px;
        font-weight: 500;
      }
      .attach-btn[data-count]:not([data-count=""])::after {
        content: attr(data-count);
        position: absolute;
        margin-left: 18px;
        margin-top: -18px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-fg);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        border: 1px solid color-mix(in srgb, var(--accent) 85%, black 15%);
      }
      .gear-btn {
        font-size: 18px;
        letter-spacing: -0.08em;
      }
      .context-toggle-pill {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0;
        cursor: pointer;
        user-select: none;
      }
      .context-toggle-pill input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
      }
      .context-toggle-pill .context-pill {
        padding: 6px 10px;
        border-style: solid !important;
        border-color: var(--input-border) !important;
        background: var(--input-bg) !important;
        color: var(--input-fg);
        font-size: 12px;
        font-weight: 600;
        border-width: 1px;
        border-radius: 999px;
        transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, color .18s ease, transform .18s ease, opacity .18s ease;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
      }
      .context-toggle-pill .context-pill::before {
        content: "\\2726";
        display: inline-block;
        margin-right: 6px;
        color: color-mix(in srgb, var(--input-fg) 60%, transparent);
        transition: color .18s ease, text-shadow .18s ease, transform .18s ease;
      }
      .context-toggle-pill input:not(:checked) + .context-pill {
        opacity: 0.7;
        filter: saturate(0.75);
      }
      .context-toggle-pill input:checked + .context-pill {
        border-color: color-mix(in srgb, var(--accent) 84%, white 16%) !important;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--accent) 38%, var(--input-bg) 62%) 0%,
          color-mix(in srgb, var(--accent) 22%, var(--input-bg) 78%) 100%
        ) !important;
        color: color-mix(in srgb, var(--accent) 52%, white 48%);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent),
          0 0 22px color-mix(in srgb, var(--accent) 30%, transparent),
          inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
        text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 28%, transparent);
        transform: translateY(-0.5px);
      }
      .context-toggle-pill input:checked + .context-pill::before {
        color: color-mix(in srgb, var(--accent) 65%, white 35%);
        text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 42%, transparent);
        transform: scale(1.03);
      }
      .context-toggle-pill {
        display: none;
      }
      .composer-meta {
        min-height: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 11px;
        color: var(--muted);
        padding: 2px 2px 0;
      }
      .composer-meta {
        display: none;
      }
      .composer-state {
        min-width: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.01em;
      }
      .context-pill {
        padding: 5px 10px;
      }
      .input-actions.minimal .send-round {
        width: 34px;
        height: 34px;
        min-width: 34px;
        padding: 0;
        border-radius: 999px;
        font-size: 16px;
      }
      .action-menu {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: flex;
        align-items: flex-start !important;
        justify-content: center;
        padding: 8px 20px 20px;
      }
      .action-menu.hidden {
        display: none !important;
      }
      .action-menu-backdrop {
        position: absolute;
        inset: 0;
        background: color-mix(in srgb, var(--bg-0) 78%, transparent);
      }
      .action-menu-sheet {
        position: relative;
        width: min(620px, calc(100vw - 40px));
        max-height: min(70vh, 620px);
        overflow: auto;
        border-radius: 14px;
        box-shadow: 0 12px 26px color-mix(in srgb, var(--bg-0) 70%, transparent);
        padding: 10px;
        background: var(--bg-1);
        border: 1px solid var(--border);
      }
      .attach-hint {
        display: none;
      }
      .footer-row {
        display: none;
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
        .stage-shell .panel,
        .chat-panel {
          padding: 10px;
        }
        .input {
          padding: 8px 6px;
        }
        .action-menu {
          right: 0;
          left: 0;
          width: 100%;
        }
        .global-actions {
          width: 100%;
          justify-content: flex-start;
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
        <p>Sign in with your Playground account (recommended), or paste an API key.</p>
        <button id="signInSetup" class="primary" type="button">Sign in with Browser</button>
        <div style="height:10px"></div>
        <div style="opacity:.7;font-size:12px">or</div>
        <div style="height:10px"></div>
        <input id="k" type="password" placeholder="xp_..." />
        <div style="height:8px"></div>
        <button id="ks" class="primary">Save API Key</button>
      </div>
    </div>

    <div id="app" class="app">
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
        <div class="brand-block">
          <span class="brand-kicker">Playground AI</span>
          <span class="brand-sub">General chat</span>
        </div>
        <div class="global-actions">
          <button id="historyQuick" type="button" class="menu-icon panel-icon" aria-label="Open threads" title="Open threads">&#9776;</button>
          <button id="historyHeader" type="button" class="menu-icon" aria-label="Open previous chats" title="Previous chats">Chats</button>
          <button id="undoHeader" type="button" class="menu-icon" aria-label="Undo last changes" title="Undo last changes">Undo</button>
          <button id="backToChatQuick" type="button" class="menu-icon panel-icon hidden" aria-label="Back to blank stage" title="Back to blank stage">&#8592;</button>
          <button id="newThreadQuick" type="button" class="menu-icon quick-new" aria-label="Start new chat">New chat</button>
        </div>
      </div>
      <div id="modeBanner" class="mode-banner hidden">Plan mode active: I will plan before acting.</div>

      <div class="chat-shell" role="region" aria-label="Playground chat">
        <div class="stage-shell" role="region" aria-label="Stage">
          <div id="chat" class="panel active chat-panel" aria-label="Chat">
            <div id="chips" class="chips"></div>
            <div id="msgs" class="messages"></div>
            <div class="jump-wrap">
              <button id="jumpLatest" class="jump-btn" type="button">Jump to latest</button>
            </div>
          </div>
          <div id="stageBlank" class="panel" aria-label="Blank stage"></div>
          <div id="stageThreads" class="panel" aria-label="Threads and tasks">
            <div class="tasks-head">
              <span class="tasks-label">Threads</span>
              <div class="startup-actions">
                <button id="histQuick" class="task-icon-btn" type="button" aria-label="Refresh history" title="Refresh history">&#9432;</button>
                <button id="repQuick" class="task-icon-btn" type="button" aria-label="Replay session" title="Replay session">&#8942;</button>
                <button id="idxQuick" class="task-icon-btn" type="button" aria-label="Rebuild index" title="Rebuild index">&#9998;</button>
              </div>
            </div>
            <div id="threadList" class="thread-list"></div>
            <div style="height:10px"></div>
            <div class="tasks-head">
              <span class="tasks-label">Tasks</span>
            </div>
            <div id="taskList" class="task-list">No task history yet.</div>
            <button id="viewAllTasks" class="view-all" type="button">View all (0)</button>
          </div>
          <div id="timeline" class="panel"></div>
          <div id="history" class="panel"></div>
          <div id="index" class="panel"></div>
          <div id="agents" class="panel"></div>
          <div id="exec" class="panel"></div>
        </div>
        <div id="threadsOverlayBackdrop" class="threads-overlay-backdrop" aria-hidden="true"></div>

        <div id="chatDock" class="dock-shell" role="region" aria-label="Chat dock">
          <div class="input">
            <form id="composerForm" class="composer-form" novalidate>
              <div class="composer-shell">
                <textarea id="t" placeholder="Ask Playground AI anything, @ to add files, / for commands" enterkeyhint="send"></textarea>
                <div id="mentionMenu" class="mention-menu hidden" role="listbox" aria-label="Mention suggestions"></div>
                <div class="input-actions minimal">
                  <button id="uploadBtn" class="icon-btn attach-btn" type="button" aria-label="Attach image" title="Attach">+</button>
                  <label class="context-toggle-pill" for="ctxToggle" title="Toggle IDE context">
                    <input id="ctxToggle" type="checkbox" checked />
                    <span id="contextPill" class="context-pill">IDE Context: ON</span>
                  </label>
                  <div class="spacer"></div>
                  <button id="actionMenuBtn" type="button" class="icon-btn gear-btn" aria-label="Settings" title="Settings" aria-expanded="false">&#8942;</button>
                  <button id="s" type="button" class="primary send-round" aria-label="Send">&#8593;</button>
                </div>
                <div class="composer-meta">
                  <button
                    id="planModeChip"
                    class="mode-plan-chip hidden"
                    type="button"
                    aria-live="polite"
                    aria-label="Plan mode is on. Click to switch back to Auto."
                    title="Click to exit plan mode"
                  >PLAN MODE <span class="plan-chip-x">x</span></button>
                  <span id="composerState" class="composer-state">Mode: Auto - Reasoning: Medium</span>
                </div>
                <div id="actionMenu" class="action-menu hidden" aria-hidden="true">
                  <div class="action-menu-backdrop" aria-hidden="true"></div>
                  <div class="action-menu-sheet" role="dialog" aria-label="Composer settings">
                    <div class="sheet-head">
                      <div>
                        <div class="sheet-title">More settings</div>
                        <div class="sheet-sub">Advanced controls inside your composer.</div>
                      </div>
                      <div class="sheet-head-actions">
                        <button id="authSignOutQuick" class="action-item" type="button" style="display:none">Sign out</button>
                        <button id="actionMenuClose" type="button" class="sheet-close" aria-label="Close settings">x</button>
                      </div>
                    </div>

                    <div class="sheet-grid">
                      <div class="sheet-card">
                        <div class="sheet-card-title">Quick controls</div>
                        <div class="sheet-row">
                          <select id="modeQuick" class="composer-select">
                            <option value="auto">Mode: Auto</option>
                            <option value="plan">Mode: Plan</option>
                            <option value="yolo">Mode: Full access</option>
                          </select>
                          <select id="reasonSel" class="composer-select">
                            <option value="low">Low</option>
                            <option value="medium" selected>Medium</option>
                            <option value="high">High</option>
                            <option value="max">Extra High</option>
                          </select>
                        </div>
                      </div>
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
                      <div class="sheet-card-title">Account</div>
                      <div class="sheet-row">
                        <span id="authLabel" class="tool-muted">Not signed in.</span>
                      </div>
                      <div class="sheet-grid">
                        <button id="authSignIn" class="action-item" type="button">Sign in</button>
                        <button id="authSignOut" class="action-item" type="button">Sign out</button>
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
                        <button class="action-item" type="button" data-menu-action="show:chat">Stage: Chat</button>
                        <button class="action-item" type="button" data-menu-action="show:stageBlank">Stage: Blank</button>
                        <button class="action-item" type="button" data-menu-action="show:stageThreads">Stage: Threads</button>
                        <button class="action-item" type="button" data-menu-action="show:timeline">Stage: Timeline</button>
                        <button class="action-item" type="button" data-menu-action="show:history">Stage: History</button>
                        <button class="action-item" type="button" data-menu-action="show:index">Stage: Index</button>
                        <button class="action-item" type="button" data-menu-action="show:agents">Stage: Agents</button>
                        <button class="action-item" type="button" data-menu-action="show:exec">Stage: Execution</button>
                      </div>
                    </div>

                    <div class="sheet-card">
                      <div class="sheet-card-title">Actions</div>
                      <div class="sheet-grid">
                        <button id="newThreadBtn" class="action-item" type="button">New Chat</button>
                        <button id="undoLastBtn" class="action-item" type="button">Undo Last Changes</button>
                        <button id="c" class="action-item" type="button">Clear Chat</button>
                        <button class="action-item" type="button" data-menu-action="execute">Execute Pending Actions</button>
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
    </div>

    <script nonce="${n}">
${scriptSource}
    </script>
  </body>
</html>`;
}
//# sourceMappingURL=extension.js.map
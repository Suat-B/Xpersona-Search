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
const API_KEY_LEGACY_SECRET = "xpersona.playground.apiKey";
const API_KEY_FALLBACK_STATE_KEY = "xpersona.playground.apiKeyFallback";
const VSCODE_REFRESH_TOKEN_SECRET = "xpersona.playground.vscodeRefreshToken";
const VSCODE_PENDING_PKCE_KEY = "xpersona.playground.vscodePendingPkce";
const MODE_KEY = "xpersona.playground.mode";
const SAFETY_KEY = "xpersona.playground.safety";
const OPEN_THREADS_KEY = "xpersona.playground.openThreads";
const HOMEPAGE_DISPLAYED_KEY = "xpersona.playground.homeDisplayed";
const PINNED_THREADS_KEY = "xpersona.playground.pinnedThreads";
const EXECUTION_POLICY_CONFIG_KEY = "executionPolicy";
const MENTIONS_ENABLED_FLAG = "mentions.enabled";
const AUTONOMY_MODE_CONFIG_KEY = "autonomy.mode";
const AUTONOMY_MAX_CYCLES_CONFIG_KEY = "autonomy.maxCycles";
const AUTONOMY_NO_CLARIFY_CONFIG_KEY = "autonomy.noClarifyToUser";
const AUTONOMY_COMMAND_POLICY_CONFIG_KEY = "autonomy.commandPolicy";
const AUTONOMY_SAFETY_FLOOR_CONFIG_KEY = "autonomy.safetyFloor";
const AUTONOMY_FAILSAFE_CONFIG_KEY = "autonomy.failsafe";
const DEFAULT_PLAYGROUND_MODEL = "stepfun-ai/step-3.5-flash";
const BACKUP_PLAYGROUND_MODEL = "mistralai/mistral-nemotron";
const PUBLIC_PLAYGROUND_MODEL_NAME = "Playground 1";
function modelLabelForUi(model) {
    return PUBLIC_PLAYGROUND_MODEL_NAME;
}
const IDE_CONTEXT_FLAG = "xpersona.playground.ideContextV2";
const MAX_TOTAL_CONTEXT_CHARS = 350000;
const INDEX_MAX_FILE_SIZE = 250 * 1024;
const INDEX_CHUNK_SIZE = 1200;
const INDEX_CHUNK_OVERLAP = 180;
const INDEX_BATCH_SIZE = 500;
const INDEX_AUTO_INTERVAL_MS = 5 * 60 * 1000;
const INDEX_AUTO_MIN_INTERVAL_MS = 15 * 60 * 1000;
const INDEX_AUTO_FILE_LIMIT = 180;
const INDEX_AUTO_CHUNK_LIMIT = 1200;
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
    trimmed = trimmed.split(/[,\s]+/)[0]; // drop extraneous text after path
    trimmed = trimmed.replace(/[.,;:]+$/g, "");
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
function hasEnvelopeKey(text, keyPattern) {
    const re = new RegExp(`(?:^|[\\[{,]\\s*)(?:"(?:${keyPattern})"|'(?:${keyPattern})'|(?:${keyPattern}))\\s*:`, "i");
    return re.test(text);
}
function looksLikeWrappedToolEnvelope(text) {
    const normalized = String(text || "").trim();
    if (!normalized)
        return false;
    if (!/^\s*\{/.test(normalized))
        return false;
    const hasFinal = hasEnvelopeKey(normalized, "final");
    const hasCollection = hasEnvelopeKey(normalized, "edits|actions|commands");
    const hasPathOrPatch = hasEnvelopeKey(normalized, "path|patch|diff|content");
    return hasFinal && hasCollection && hasPathOrPatch;
}
function collectWrappedPayloadCandidates(text) {
    const trimmed = String(text || "").trim();
    const candidates = [];
    const pushCandidate = (candidate) => {
        const next = candidate.trim();
        if (!next || candidates.includes(next))
            return;
        candidates.push(next);
    };
    if (!trimmed)
        return candidates;
    pushCandidate(trimmed);
    const fenced = /^```(?:json|text)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    if (fenced?.[1])
        pushCandidate(fenced[1]);
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        pushCandidate(trimmed.slice(firstBrace, lastBrace + 1));
    }
    return candidates;
}
function looksLikeWrappedToolPayloadText(text) {
    const candidates = collectWrappedPayloadCandidates(text);
    for (const candidate of candidates) {
        if (looksLikeWrappedToolEnvelope(candidate))
            return true;
    }
    return false;
}
function patchHasWrappedToolPayloadArtifacts(patchText) {
    const text = String(patchText || "").trim();
    if (!text)
        return false;
    if (looksLikeWrappedToolPayloadText(text))
        return true;
    return (0, patch_utils_1.patchContainsWrappedToolPayload)(text);
}
function patchHasLeakedPatchArtifacts(patchText) {
    const text = String(patchText || "").trim();
    if (!text)
        return false;
    if (!(0, patch_utils_1.patchContainsLeakedPatchArtifacts)(text))
        return false;
    const recovered = (0, patch_utils_1.recoverUnifiedDiffFromLeakedPatchArtifacts)(text);
    return !(recovered && recovered.trim());
}
function normalizeIncomingPatchText(patchText) {
    const raw = String(patchText || "").trim();
    if (!raw)
        return { patch: "", recovered: false };
    const wrapped = (0, patch_utils_1.recoverUnifiedDiffFromWrappedPayload)(raw);
    const primary = wrapped && wrapped.trim() ? wrapped.trim() : raw;
    const leaked = (0, patch_utils_1.recoverUnifiedDiffFromLeakedPatchArtifacts)(primary);
    const normalized = leaked && leaked.trim() ? leaked.trim() : primary;
    return { patch: normalized, recovered: normalized !== raw };
}
function isLikelyInvalidModelError(message) {
    const lower = String(message || "").toLowerCase();
    return (lower.includes("model") &&
        (lower.includes("not found") ||
            lower.includes("unknown") ||
            lower.includes("invalid") ||
            lower.includes("does not exist") ||
            lower.includes("unrecognized")));
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
        this.hasShownHomepage = false;
        this.timeline = [];
        this.pendingActions = [];
        this.guardrailIssues = [];
        this.lastRunMeta = null;
        this.lastActionOutcome = null;
        this.lastAutonomyProgressFingerprint = null;
        this.consecutiveAutonomyProgressRepeats = 0;
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
        this.contextPreviewDebounceTimer = null;
        this.contextPreviewSeq = 0;
        this.contextPreviewLastQuery = "";
        this.contextPreviewLastAt = 0;
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
        this.hasShownHomepage = ctx.workspaceState.get(HOMEPAGE_DISPLAYED_KEY, false);
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
    vscodeCallbackAuthority() {
        return String(this.ctx.extension.id || "playgroundai.xpersona-playground").trim() || "playgroundai.xpersona-playground";
    }
    vscodeRedirectUri() {
        const scheme = String(vscode.env.uriScheme || "vscode").trim().toLowerCase() || "vscode";
        return `${scheme}://${this.vscodeCallbackAuthority()}/auth-callback`;
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
    async getStoredApiKey() {
        const readSecret = async (secretKey) => {
            try {
                const value = await this.ctx.secrets.get(secretKey);
                return value && value.trim() ? value.trim() : null;
            }
            catch {
                return null;
            }
        };
        let key = await readSecret(API_KEY_SECRET);
        if (!key) {
            const legacy = await readSecret(API_KEY_LEGACY_SECRET);
            if (legacy) {
                key = legacy;
                try {
                    await this.ctx.secrets.store(API_KEY_SECRET, legacy);
                }
                catch {
                    // Ignore migration failures; fallback state handles non-secret environments.
                }
            }
        }
        if (key)
            return key;
        const fallback = String(this.ctx.globalState.get(API_KEY_FALLBACK_STATE_KEY, "") || "").trim();
        if (!fallback)
            return null;
        // Best effort: migrate fallback back into secure storage when available.
        try {
            await this.ctx.secrets.store(API_KEY_SECRET, fallback);
            await this.ctx.globalState.update(API_KEY_FALLBACK_STATE_KEY, null);
        }
        catch {
            // Keep fallback when secure storage is unavailable.
        }
        return fallback;
    }
    maskApiKey(key) {
        const raw = String(key || "").trim();
        if (!raw)
            return "";
        if (raw.length <= 8)
            return raw.slice(0, 2) + "..." + raw.slice(-2);
        return raw.slice(0, 4) + "..." + raw.slice(-4);
    }
    async storeApiKey(rawKey) {
        const key = String(rawKey || "").trim();
        if (!key)
            throw new Error("API key cannot be empty.");
        try {
            await this.ctx.secrets.store(API_KEY_SECRET, key);
            await this.ctx.globalState.update(API_KEY_FALLBACK_STATE_KEY, null);
            return "secret";
        }
        catch {
            await this.ctx.globalState.update(API_KEY_FALLBACK_STATE_KEY, key);
            return "fallback";
        }
    }
    async hasAnyAuth() {
        const refreshToken = await this.getRefreshToken();
        if (refreshToken)
            return true;
        const key = await this.getStoredApiKey();
        return Boolean(key && key.trim());
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
        const key = await this.getStoredApiKey();
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
        const browserSignedIn = Boolean(refreshToken);
        const storedKey = await this.getStoredApiKey();
        const apiKeySaved = Boolean(storedKey && storedKey.trim());
        const signedIn = browserSignedIn || apiKeySaved;
        this.post({
            type: "authState",
            signedIn,
            browserSignedIn,
            apiKeySaved,
            apiKeyMasked: apiKeySaved && storedKey ? this.maskApiKey(storedKey) : "",
            email: this.vscodeSignedInEmail,
        });
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
        if (authority !== this.vscodeCallbackAuthority())
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
        if (this.isIdeContextV2Enabled()) {
            void this.runBackgroundIndexing("auth-check");
        }
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
        this.modeStatusItem.hide();
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
    getAutonomyProfile() {
        const cfg = vscode.workspace.getConfiguration("xpersona.playground");
        const modeRaw = String(cfg.get(AUTONOMY_MODE_CONFIG_KEY) || "unbounded").trim().toLowerCase();
        const maxCyclesRaw = Number(cfg.get(AUTONOMY_MAX_CYCLES_CONFIG_KEY));
        const noClarify = cfg.get(AUTONOMY_NO_CLARIFY_CONFIG_KEY);
        const commandPolicyRaw = String(cfg.get(AUTONOMY_COMMAND_POLICY_CONFIG_KEY) || "run_until_done")
            .trim()
            .toLowerCase();
        const safetyFloorRaw = String(cfg.get(AUTONOMY_SAFETY_FLOOR_CONFIG_KEY) || "allow_everything")
            .trim()
            .toLowerCase();
        const failsafeRaw = String(cfg.get(AUTONOMY_FAILSAFE_CONFIG_KEY) || "disabled").trim().toLowerCase();
        return {
            mode: modeRaw === "bounded" ? "bounded" : "unbounded",
            maxCycles: Number.isFinite(maxCyclesRaw) && maxCyclesRaw >= 0 ? Math.floor(maxCyclesRaw) : 0,
            noClarifyToUser: noClarify !== false,
            commandPolicy: commandPolicyRaw === "safe_default" ? "safe_default" : "run_until_done",
            safetyFloor: safetyFloorRaw === "standard" ? "standard" : "allow_everything",
            failsafe: failsafeRaw === "enabled" ? "enabled" : "disabled",
        };
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
    postContextStatus(threadId, status) {
        this.postRun(threadId, { type: "contextStatus", data: status });
    }
    scheduleContextPreview(rawQuery, threadId) {
        const query = String(rawQuery || "").trim();
        const runThreadId = typeof threadId === "string" && threadId.trim() ? threadId.trim() : this.activeThreadId;
        if (this.contextPreviewDebounceTimer) {
            clearTimeout(this.contextPreviewDebounceTimer);
            this.contextPreviewDebounceTimer = null;
        }
        if (!query) {
            this.postContextStatus(runThreadId, {
                enabled: true,
                phase: "idle",
                source: "preview",
                sections: 0,
                snippets: 0,
                workspaceMatches: 0,
                indexFreshness: this.indexFreshness,
                discoveryCommands: 0,
                preflightMs: 0,
                notes: ["Auto context idle."],
            });
            return;
        }
        this.contextPreviewDebounceTimer = setTimeout(() => {
            const seq = ++this.contextPreviewSeq;
            void this.runContextPreview(seq, query, runThreadId);
        }, 420);
    }
    async runContextPreview(seq, query, threadId) {
        const startedAt = Date.now();
        this.postContextStatus(threadId, {
            enabled: true,
            phase: "collecting",
            source: "preview",
            sections: 0,
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: this.indexFreshness,
            discoveryCommands: 0,
            preflightMs: 0,
            notes: ["Auto context scanning workspace..."],
        });
        try {
            const now = Date.now();
            if (query === this.contextPreviewLastQuery && now - this.contextPreviewLastAt < 1200) {
                return;
            }
            const root = this.getWorkspaceRoot();
            const openFiles = await this.collectOpenEditorsContext(8, 3000);
            const workspaceMatches = await this.collectQueryWorkspaceContext(query, 8, 4500);
            let indexedSnippets = [];
            if (root) {
                const auth = await this.resolveRequestAuth();
                if (auth) {
                    const workspaceHash = this.computeWorkspaceHash(root);
                    indexedSnippets = await this.queryIndexForPrompt(workspaceHash, query, auth, 8);
                }
            }
            if (seq !== this.contextPreviewSeq)
                return;
            const dedup = new Set();
            const mergedOpenFiles = [...workspaceMatches, ...openFiles].filter((item) => {
                const key = String(item.path || "");
                if (!key || dedup.has(key))
                    return false;
                dedup.add(key);
                return true;
            });
            const queryMatches = workspaceMatches.length;
            const fileMatches = mergedOpenFiles.length;
            const sections = [
                mergedOpenFiles.length > 0 ? 1 : 0,
                indexedSnippets.length > 0 ? 1 : 0,
            ].reduce((acc, value) => acc + value, 0);
            const preflightMs = Date.now() - startedAt;
            const notes = [
                `Auto context ready: ${fileMatches} file${fileMatches === 1 ? "" : "s"} (${queryMatches} query match${queryMatches === 1 ? "" : "es"}).`,
            ];
            if (!indexedSnippets.length && root) {
                notes.push("Index snippets unavailable yet; running workspace fallback.");
            }
            this.postContextStatus(threadId, {
                enabled: true,
                phase: "ready",
                source: "preview",
                sections,
                snippets: indexedSnippets.length,
                workspaceMatches: fileMatches,
                indexFreshness: this.indexFreshness,
                discoveryCommands: 0,
                preflightMs,
                notes,
            });
            this.contextPreviewLastQuery = query;
            this.contextPreviewLastAt = Date.now();
        }
        catch (e) {
            if (seq !== this.contextPreviewSeq)
                return;
            this.postContextStatus(threadId, {
                enabled: true,
                phase: "ready",
                source: "preview",
                sections: 0,
                snippets: 0,
                workspaceMatches: 0,
                indexFreshness: this.indexFreshness,
                discoveryCommands: 0,
                preflightMs: Date.now() - startedAt,
                notes: [`Auto context preview failed: ${err(e)}`],
            });
        }
    }
    async collectIdeContext(query, workspaceHash, auth) {
        const root = this.getWorkspaceRoot();
        const activeFile = await this.collectActiveFileContext(20000);
        const openFiles = await this.collectOpenEditorsContext(20, 6000);
        const queryWorkspaceFiles = await this.collectQueryWorkspaceContext(query, 10, 10000);
        const diagnostics = this.collectDiagnostics(200);
        const git = await this.collectGitSummary(root);
        const discovery = await this.runSafeDiscovery(root);
        const indexedSnippets = await this.queryIndexForPrompt(workspaceHash, query, auth, 12);
        const mergedOpenFilesMap = new Map();
        for (const file of [...queryWorkspaceFiles, ...openFiles]) {
            if (!file.path || mergedOpenFilesMap.has(file.path))
                continue;
            mergedOpenFilesMap.set(file.path, file);
        }
        const mergedSnippets = [
            ...indexedSnippets,
            ...queryWorkspaceFiles
                .map((file) => ({
                path: file.path,
                score: 0.45,
                content: String(file.excerpt || "").slice(0, 4000),
            }))
                .filter((snippet) => snippet.content.length > 0),
        ];
        if (discovery.rgFiles) {
            mergedSnippets.push({
                path: ".workspace/files",
                score: 0.3,
                content: discovery.rgFiles,
            });
        }
        return trimContextToMaxChars({
            activeFile: activeFile || undefined,
            openFiles: Array.from(mergedOpenFilesMap.values()),
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
    extractWorkspaceSearchTokens(text, max = 6) {
        const input = String(text || "");
        if (!input.trim())
            return [];
        const mentions = new Set(extractAtMentions(input).map((x) => x.replace(/^@+/, "").toLowerCase()));
        const stop = new Set([
            "what", "how", "does", "work", "read", "look", "file", "this", "that", "please", "now", "can", "you", "the", "and", "for",
            "with", "into", "from", "when", "where", "why", "help", "need", "make", "build", "create", "update", "fix", "issue",
            "problem", "about", "there", "their", "they", "should", "would", "could", "have", "has",
        ]);
        const out = [];
        const seen = new Set();
        const pathMentions = input.match(/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]{1,10}/g) || [];
        for (const match of pathMentions) {
            const cleaned = String(match || "").trim().replace(/^[@./]+/, "").replace(/[),.;:!?]+$/g, "");
            const lower = cleaned.toLowerCase();
            if (!cleaned || seen.has(lower) || mentions.has(lower) || stop.has(lower))
                continue;
            seen.add(lower);
            out.push(cleaned);
            if (out.length >= max)
                return out;
        }
        for (const m of input.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
            const token = String(m[0] || "").trim();
            if (!token)
                continue;
            const lower = token.toLowerCase();
            if (seen.has(lower) || mentions.has(lower) || stop.has(lower))
                continue;
            if (!/[A-Za-z]/.test(token))
                continue;
            seen.add(lower);
            out.push(token);
            if (out.length >= max)
                break;
        }
        return out;
    }
    formatLineExcerpt(lines, startLine) {
        return lines
            .map((line, idx) => `${String(startLine + idx).padStart(4, " ")} | ${line}`)
            .join("\n");
    }
    async collectQueryWorkspaceContext(text, maxFiles, maxCharsPerFile) {
        const root = this.getWorkspaceRoot();
        if (!root)
            return [];
        const tokens = this.extractWorkspaceSearchTokens(text, 6);
        if (!tokens.length)
            return [];
        const perPath = new Map();
        const tokensLower = tokens.map((token) => token.toLowerCase());
        let rgAvailable = true;
        let rgUsed = false;
        for (const token of tokens) {
            const rg = await execFileReadOnly("rg", ["-n", "-i", "-S", "--no-heading", "--hidden", "-g", "!node_modules", "-g", "!.git", "-g", "!.next", "-g", "!dist", "-g", "!build", token, "."], root.uri.fsPath, 3000, 200000);
            if (!rg.ok) {
                if (/ENOENT|not recognized/i.test(rg.stderr || "")) {
                    rgAvailable = false;
                    break;
                }
                continue;
            }
            if (!rg.stdout.trim()) {
                rgUsed = true;
                continue;
            }
            rgUsed = true;
            const lines = rg.stdout.split(/\r?\n/).filter(Boolean).slice(0, Math.max(60, maxFiles * 24));
            for (const line of lines) {
                const m = /^(.+?):(\d+):(.*)$/.exec(line);
                if (!m)
                    continue;
                const rel = normalizeWorkspaceRelativePath(m[1].replace(/\\/g, "/").replace(/^\.\//, ""));
                if (!rel)
                    continue;
                const lineNumber = Number.parseInt(String(m[2] || ""), 10);
                const preview = String(m[3] || "").trim();
                const entry = perPath.get(rel) || { score: 0, matches: [] };
                entry.score += 3;
                if (preview.toLowerCase().includes(token.toLowerCase()))
                    entry.score += 1;
                if (entry.matches.length < 8 && Number.isFinite(lineNumber) && lineNumber > 0) {
                    entry.matches.push({ token, line: lineNumber, preview });
                }
                perPath.set(rel, entry);
            }
        }
        if ((!rgAvailable || !rgUsed) && perPath.size === 0) {
            const include = new vscode.RelativePattern(root, "**/*.{ts,tsx,js,jsx,json,md,mdx,txt,py,go,rs,java,cs,yaml,yml,sql,sh,ps1,toml}");
            const exclude = new vscode.RelativePattern(root, "{**/node_modules/**,**/.git/**,**/.next/**,**/dist/**,**/build/**,**/.cache/**,**/.turbo/**}");
            const files = await vscode.workspace.findFiles(include, exclude, Math.max(60, maxFiles * 16));
            for (const uri of files) {
                if (perPath.size >= Math.max(maxFiles * 2, 40))
                    break;
                const rel = normalizeWorkspaceRelativePath(toRelPath(root.uri, uri));
                if (!rel)
                    continue;
                let stat = null;
                try {
                    stat = await vscode.workspace.fs.stat(uri);
                }
                catch {
                    stat = null;
                }
                if (!stat || stat.type !== vscode.FileType.File)
                    continue;
                if (stat.size > 900000)
                    continue;
                let raw = null;
                try {
                    raw = await vscode.workspace.fs.readFile(uri);
                }
                catch {
                    raw = null;
                }
                if (!raw)
                    continue;
                const content = Buffer.from(raw).toString("utf8");
                if (!content)
                    continue;
                const lines = content.replace(/\r\n/g, "\n").split("\n");
                let score = 0;
                const matches = [];
                for (let idx = 0; idx < lines.length; idx += 1) {
                    const line = lines[idx];
                    const lineLower = line.toLowerCase();
                    for (let t = 0; t < tokensLower.length; t += 1) {
                        if (!lineLower.includes(tokensLower[t]))
                            continue;
                        score += 3;
                        if (matches.length < 8) {
                            matches.push({ token: tokens[t], line: idx + 1, preview: line.trim() });
                        }
                    }
                    if (matches.length >= 8)
                        break;
                }
                if (score <= 0)
                    continue;
                perPath.set(rel, { score, matches });
            }
        }
        const ranked = Array.from(perPath.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, Math.max(maxFiles, maxFiles * 2));
        const out = [];
        for (const [pathKey, data] of ranked) {
            if (out.length >= maxFiles)
                break;
            const uri = vscode.Uri.joinPath(root.uri, ...pathKey.split("/"));
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if (stat.type !== vscode.FileType.File)
                    continue;
                if (stat.size > 900000) {
                    const quickMatches = data.matches
                        .slice(0, 6)
                        .map((match) => `- ${match.token} @${match.line}: ${match.preview.slice(0, 140)}`)
                        .join("\n");
                    out.push({
                        path: pathKey,
                        language: languageFromPath(pathKey),
                        excerpt: `Query matches (file too large to open full excerpt):\n${quickMatches}`.slice(0, maxCharsPerFile),
                    });
                    continue;
                }
                const doc = await vscode.workspace.openTextDocument(uri);
                const lines = doc.getText().replace(/\r\n/g, "\n").split("\n");
                const anchorLine = data.matches[0]?.line || 1;
                const start = Math.max(0, anchorLine - 15);
                const end = Math.min(lines.length, start + 90);
                const header = data.matches
                    .slice(0, 6)
                    .map((match) => `- ${match.token} @${match.line}: ${match.preview.slice(0, 120)}`)
                    .join("\n");
                let excerpt = `Query matches:\n${header}\n\nExcerpt:\n${this.formatLineExcerpt(lines.slice(start, end), start + 1)}`.slice(0, maxCharsPerFile);
                if (end < lines.length && excerpt.length < maxCharsPerFile - 40) {
                    excerpt += `\n... [truncated ${lines.length - end} lines]`;
                }
                out.push({
                    path: pathKey,
                    language: doc.languageId || languageFromPath(pathKey),
                    excerpt,
                });
            }
            catch (e) {
                const quickMatches = data.matches
                    .slice(0, 6)
                    .map((match) => `- ${match.token} @${match.line}: ${match.preview.slice(0, 140)}`)
                    .join("\n");
                out.push({
                    path: pathKey,
                    language: languageFromPath(pathKey),
                    excerpt: `Failed to read file excerpt (${err(e)}).\nQuery matches:\n${quickMatches}`.slice(0, maxCharsPerFile),
                });
            }
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
        const documents = [];
        const seenUri = new Set();
        for (const editor of vscode.window.visibleTextEditors) {
            const key = String(editor.document.uri.toString());
            if (seenUri.has(key))
                continue;
            seenUri.add(key);
            documents.push(editor.document);
            if (documents.length >= maxEditors)
                break;
        }
        if (documents.length < maxEditors) {
            for (const doc of vscode.workspace.textDocuments) {
                const key = String(doc.uri.toString());
                if (seenUri.has(key))
                    continue;
                if (doc.uri.scheme !== "file")
                    continue;
                seenUri.add(key);
                documents.push(doc);
                if (documents.length >= maxEditors)
                    break;
            }
        }
        const unique = new Set();
        const out = [];
        for (const doc of documents) {
            const p = this.toContextPath(doc.uri);
            if (!p || unique.has(p))
                continue;
            unique.add(p);
            out.push({
                path: p,
                language: doc.languageId,
                excerpt: doc.getText().slice(0, maxCharsPerFile),
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
        const manualRun = trigger === "manual";
        if (!manualRun && this.lastIndexAt > 0 && Date.now() - this.lastIndexAt < INDEX_AUTO_MIN_INTERVAL_MS) {
            return { status: "ok", chunks: 0, message: "Recent index is still fresh; skipping auto rebuild." };
        }
        this.indexRunning = true;
        try {
            const include = "**/*.{ts,tsx,js,jsx,json,md,py,go,rs,java,cs,yaml,yml}";
            const exclude = "**/{node_modules,.git,.next,dist,build}/**";
            const fileLimit = manualRun ? 800 : INDEX_AUTO_FILE_LIMIT;
            const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, include), new vscode.RelativePattern(root, exclude), fileLimit);
            const chunks = [];
            filesLoop: for (const file of files) {
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
                        if (!manualRun && chunks.length >= INDEX_AUTO_CHUNK_LIMIT) {
                            break filesLoop;
                        }
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
                const savedKey = await this.getStoredApiKey();
                const hasApiKey = Boolean(savedKey && savedKey.trim());
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
                if (ok && this.isIdeContextV2Enabled()) {
                    void this.runBackgroundIndexing("auth-check");
                }
                const shouldAutoResume = ok && this.activeThreadId && this.hasShownHomepage;
                if (shouldAutoResume) {
                    await this.openSession(this.activeThreadId || "");
                }
                else {
                    if (!this.hasShownHomepage) {
                        this.hasShownHomepage = true;
                        void this.ctx.workspaceState.update(HOMEPAGE_DISPLAYED_KEY, true);
                    }
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
                const provided = String(m.key || "").trim();
                if (!provided) {
                    this.post({ type: "apiKeySaved", ok: false, reason: "API key cannot be empty." });
                    return;
                }
                try {
                    const savedIn = await this.storeApiKey(provided);
                    this.post({ type: "api", ok: true });
                    this.post({ type: "apiKeySaved", ok: true, storage: savedIn });
                    if (savedIn === "fallback") {
                        this.post({
                            type: "status",
                            text: "API key saved using fallback storage because secure secret storage was unavailable.",
                        });
                    }
                    await this.postAuthState();
                    await this.loadHistory();
                    if (this.isIdeContextV2Enabled()) {
                        void this.runBackgroundIndexing("auth-check");
                    }
                }
                catch (e) {
                    const message = err(e);
                    this.post({ type: "apiKeySaved", ok: false, reason: message });
                    this.post({ type: "err", text: `Failed to save API key: ${message}` });
                }
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
                this.killAllTerminals("user_cancel");
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
            else if (m.type === "contextPreview") {
                const query = String(m.text || "");
                const threadId = typeof m.threadId === "string" ? String(m.threadId).trim() : "";
                this.scheduleContextPreview(query, threadId || undefined);
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
        const savedIn = await this.storeApiKey(k.trim());
        this.post({ type: "api", ok: true });
        this.post({ type: "apiKeySaved", ok: true, storage: savedIn });
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
                vscode.window.setStatusBarMessage("Playground 1: Plan mode enabled", 2500);
            }
        }
    }
    async setSafety(s) {
        this.safety = s;
        await this.ctx.workspaceState.update(SAFETY_KEY, s);
        this.post({ type: "safety", value: s });
    }
    postAutonomyRuntime(threadId, data) {
        this.postRun(threadId, { type: "autonomyRuntime", data });
    }
    evaluateAutonomyCompletion(task) {
        const meta = this.lastRunMeta || {};
        const actionabilityReason = String(meta.actionability?.reason || "").trim();
        const missingFromMeta = Array.isArray(meta.missingRequirements)
            ? meta.missingRequirements.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
            : [];
        const localOutcome = this.lastActionOutcome;
        const filesChanged = Number(localOutcome?.filesChanged || 0);
        const checksRun = Number(localOutcome?.checksRun || 0);
        const localAppliedFiles = Array.isArray(localOutcome?.appliedFiles)
            ? localOutcome.appliedFiles.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
            : [];
        const isConversation = this.isConversationalPrompt(task) || this.isSmallTalkPrompt(task);
        const reportedTargetFiles = Array.isArray(meta.validationPlan?.touchedFiles) && meta.validationPlan?.touchedFiles.filter(Boolean).length > 0;
        const localFileActions = Array.isArray(localOutcome?.perFile) && localOutcome.perFile.some((row) => typeof row.path === "string");
        const editIntent = !isConversation &&
            ((this.wantsCodeEdits(task) && !this.isConversationalPrompt(task)) || reportedTargetFiles || localFileActions);
        const missing = Array.from(new Set(missingFromMeta));
        if (editIntent && filesChanged === 0)
            missing.push("local_file_mutation_required");
        const completionStatus = meta.completionStatus === "incomplete" || missing.length > 0 ? "incomplete" : "complete";
        const done = completionStatus === "complete" && (!editIntent || filesChanged > 0);
        const blocker = (missing.length > 0 ? missing.join(", ") : "") ||
            actionabilityReason ||
            String(localOutcome?.summary || "").trim() ||
            "Completion contract not satisfied yet.";
        let completionScore = 0;
        if (completionStatus === "complete")
            completionScore += 50;
        if (filesChanged > 0)
            completionScore += 35;
        if (checksRun > 0)
            completionScore += 15;
        if (done)
            completionScore = 100;
        completionScore = Math.max(0, Math.min(100, completionScore));
        return {
            done,
            completionStatus,
            completionScore,
            missingRequirements: missing,
            blocker,
            appliedFiles: localAppliedFiles,
            filesChanged,
            checksRun,
        };
    }
    buildAutonomyRepromptTask(input) {
        const missing = input.missingRequirements.length
            ? input.missingRequirements.join(", ")
            : "unspecified";
        const parts = [
            input.objective.trim(),
            "",
            `Autonomy continuation cycle ${input.cycle + 1}: previous cycle incomplete.`,
            `Missing requirements: ${missing}.`,
            `Blocker: ${input.blocker}.`,
            `Observed local outcomes: filesChanged=${input.filesChanged}, checksRun=${input.checksRun}.`,
            "Rules: do not ask the user for clarification. Infer targets from available IDE context and return concrete file actions.",
            "Rules: for edit-intent tasks, command-only output is invalid. Return at least one edit/write_file/mkdir action.",
            input.hintedTargetPath ? `Primary target file hint: ${input.hintedTargetPath}` : "",
            "Then include any validation commands needed to confirm the change.",
        ];
        return parts.filter(Boolean).join("\n");
    }
    async ask(text, parallel, model = DEFAULT_PLAYGROUND_MODEL, reasoning = "medium", options = {}) {
        const autonomy = this.getAutonomyProfile();
        const loopEnabled = options.autonomousLoop !== false && autonomy.mode === "unbounded";
        if (!loopEnabled) {
            await this.askSingleCycle(text, parallel, model, reasoning, options);
            return;
        }
        const objective = String(text || "").trim();
        if (!objective)
            return;
        let cycleTask = objective;
        let cycle = 0;
        let loopOptions = { ...options, autonomousLoop: false };
        this.lastAutonomyProgressFingerprint = null;
        this.consecutiveAutonomyProgressRepeats = 0;
        while (true) {
            cycle += 1;
            const runThreadId = (typeof loopOptions.threadId === "string" && loopOptions.threadId.trim())
                ? loopOptions.threadId.trim()
                : this.activeThreadId;
            this.postAutonomyRuntime(runThreadId, {
                objective,
                cycle,
                maxCycles: autonomy.maxCycles,
                phase: "plan",
                completionStatus: "incomplete",
                completionScore: 0,
                missingRequirements: [],
                blocker: "Planning cycle.",
                appliedFiles: [],
                filesChanged: 0,
                checksRun: 0,
            });
            const cycleOptions = {
                ...loopOptions,
                autonomyCycle: {
                    objective,
                    cycle,
                    maxCycles: autonomy.maxCycles,
                },
            };
            await this.askSingleCycle(cycleTask, parallel, model, reasoning, cycleOptions);
            const threadId = this.activeThreadId || runThreadId;
            const hintedTargetPath = normalizeWorkspaceRelativePath(String(this.lastRunMeta?.validationPlan?.touchedFiles?.[0] || "").replace(/\\/g, "/"));
            const completion = this.evaluateAutonomyCompletion(objective);
            this.postAutonomyRuntime(threadId, {
                objective,
                cycle,
                maxCycles: autonomy.maxCycles,
                phase: "verify",
                completionStatus: completion.completionStatus,
                completionScore: completion.completionScore,
                missingRequirements: completion.missingRequirements,
                blocker: completion.blocker,
                appliedFiles: completion.appliedFiles,
                filesChanged: completion.filesChanged,
                checksRun: completion.checksRun,
            });
            const appliedFilesFingerprint = Array.isArray(completion.appliedFiles)
                ? completion.appliedFiles.slice().sort().join(",")
                : "";
            const missingFingerprint = completion.missingRequirements
                .slice()
                .sort()
                .join(",");
            const progressFingerprint = [
                missingFingerprint,
                String(completion.blocker || ""),
                appliedFilesFingerprint,
                String(completion.filesChanged),
                String(completion.checksRun),
                completion.completionStatus,
            ].join("|");
            const repeatedProgress = progressFingerprint !== "" && progressFingerprint === this.lastAutonomyProgressFingerprint;
            this.consecutiveAutonomyProgressRepeats = repeatedProgress ? this.consecutiveAutonomyProgressRepeats + 1 : 0;
            this.lastAutonomyProgressFingerprint = progressFingerprint || null;
            if (progressFingerprint && this.consecutiveAutonomyProgressRepeats >= 2) {
                const repeatBlocker = completion.blocker || "No new progress detected after repeated cycles.";
                this.postAutonomyRuntime(threadId, {
                    objective,
                    cycle,
                    maxCycles: autonomy.maxCycles,
                    phase: "done",
                    completionStatus: completion.completionStatus,
                    completionScore: completion.completionScore,
                    missingRequirements: completion.missingRequirements,
                    blocker: repeatBlocker,
                    appliedFiles: completion.appliedFiles,
                    filesChanged: completion.filesChanged,
                    checksRun: completion.checksRun,
                });
                this.postRun(threadId, {
                    type: "status",
                    text: `Autonomy halted after ${cycle} cycle(s) with no new file edits. ${repeatBlocker}`,
                });
                return;
            }
            const hitCycleLimit = autonomy.maxCycles > 0 && cycle >= autonomy.maxCycles;
            if (this.cancelRequested || completion.done || hitCycleLimit) {
                this.postAutonomyRuntime(threadId, {
                    objective,
                    cycle,
                    maxCycles: autonomy.maxCycles,
                    phase: "done",
                    completionStatus: completion.done ? "complete" : "incomplete",
                    completionScore: completion.done ? 100 : completion.completionScore,
                    missingRequirements: completion.missingRequirements,
                    blocker: hitCycleLimit && !completion.done
                        ? "Max cycle limit reached before completion."
                        : completion.blocker,
                    appliedFiles: completion.appliedFiles,
                    filesChanged: completion.filesChanged,
                    checksRun: completion.checksRun,
                });
                if (hitCycleLimit && !completion.done) {
                    this.postRun(threadId, {
                        type: "status",
                        text: `Autonomy stopped after ${cycle} cycle(s) without satisfying completion contract.`,
                    });
                }
                return;
            }
            this.postAutonomyRuntime(threadId, {
                objective,
                cycle,
                maxCycles: autonomy.maxCycles,
                phase: "reprompt",
                completionStatus: completion.completionStatus,
                completionScore: completion.completionScore,
                missingRequirements: completion.missingRequirements,
                blocker: completion.blocker,
                appliedFiles: completion.appliedFiles,
                filesChanged: completion.filesChanged,
                checksRun: completion.checksRun,
            });
            this.postRun(threadId, {
                type: "status",
                text: `Autonomy cycle ${cycle} incomplete. Re-prompting with failure telemetry...`,
            });
            cycleTask = this.buildAutonomyRepromptTask({
                objective,
                cycle,
                missingRequirements: completion.missingRequirements,
                blocker: completion.blocker,
                hintedTargetPath,
                filesChanged: completion.filesChanged,
                checksRun: completion.checksRun,
            });
            loopOptions = {
                ...loopOptions,
                threadId: threadId || undefined,
                contextRetryAttempted: false,
                modelFallbackAttempted: false,
            };
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    }
    async askSingleCycle(text, parallel, model = DEFAULT_PLAYGROUND_MODEL, reasoning = "medium", options = {}) {
        this.lastActionOutcome = null;
        const cycleContext = options.autonomyCycle;
        const objectiveText = cycleContext?.objective || String(text || "").trim();
        if (cycleContext) {
            this.postAutonomyRuntime(this.activeThreadId, {
                objective: objectiveText,
                cycle: cycleContext.cycle,
                maxCycles: cycleContext.maxCycles,
                phase: "act",
                completionStatus: "incomplete",
                completionScore: 0,
                missingRequirements: [],
                blocker: "Collecting context and generating actions.",
                appliedFiles: [],
                filesChanged: 0,
                checksRun: 0,
            });
        }
        if (!text.trim())
            return;
        if (this.activeStreamCancel) {
            this.post({ type: "status", text: "Already responding. Stop the current run before sending another message." });
            return;
        }
        const auth = await this.resolveRequestAuth();
        if (!auth)
            return this.post({ type: "err", text: "Not authenticated. Use Sign in (browser) or set an API key." });
        const autonomyProfile = this.getAutonomyProfile();
        this.cancelRequested = false;
        this.pendingActions = [];
        this.guardrailIssues = [];
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
        const normalizedRequestedModel = String(model || "").trim().toLowerCase();
        const backupModelCandidate = [BACKUP_PLAYGROUND_MODEL, DEFAULT_PLAYGROUND_MODEL]
            .map((entry) => String(entry || "").trim())
            .find((entry) => entry && entry.toLowerCase() !== normalizedRequestedModel);
        const runStartedAt = Date.now();
        const runTraceId = createTraceId();
        const diagnosticEvents = [];
        const diagnosticEventKeys = new Set();
        const addDiagnosticEvent = (code, message, severity = "warn") => {
            const normalizedCode = String(code || "unknown").trim() || "unknown";
            const normalizedMessage = String(message || "").trim();
            if (!normalizedMessage)
                return;
            const key = `${normalizedCode}:${normalizedMessage}`;
            if (diagnosticEventKeys.has(key))
                return;
            diagnosticEventKeys.add(key);
            diagnosticEvents.push({
                code: normalizedCode,
                message: normalizedMessage,
                severity,
                ts: Date.now(),
            });
            if (diagnosticEvents.length > 40)
                diagnosticEvents.splice(0, diagnosticEvents.length - 40);
        };
        const emitDiagnosticsBundle = (stage, summary, extras) => {
            if (!diagnosticEvents.length)
                return;
            this.postDiagnosticsBundle(runThreadId, {
                traceId: runTraceId,
                stage,
                summary: String(summary || "Run diagnostics"),
                model: extras?.model || modelLabelForUi(model),
                reasoning: extras?.reasoning || reasoning,
                mode: extras?.mode || requestMode,
                startedAt: runStartedAt,
                endedAt: Date.now(),
                events: diagnosticEvents.slice(-40),
            });
        };
        this.postRun(runThreadId, { type: "start" });
        if (!conversational) {
            this.postRun(runThreadId, { type: "status", text: `Model: ${modelLabelForUi(model)} | Reasoning: ${reasoning}` });
        }
        const wantsEdits = !conversational && this.wantsCodeEdits(text);
        const taskWithReasoning = smallTalk
            ? `User message: "${text.trim()}". Reply briefly, warmly, and conversationally.`
            : wantsEdits
                ? `User request: "${text.trim()}". Prefer concrete code edits or patches. Use available IDE context (active file, open files, @mentions, diagnostics) to infer the most likely target and produce a best-effort patch. Ask a clarification question only when no file context exists at all. Keep the response focused on applying the change, not theory.`
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
            phase: "collecting",
            source: "send",
            sections: 0,
            snippets: 0,
            workspaceMatches: 0,
            indexFreshness: this.indexFreshness,
            discoveryCommands: 0,
            preflightMs: 0,
            notes: [],
        };
        this.postContextStatus(runThreadId, { ...contextStatus });
        if (ideContextEnabled && !strictConversationOnly) {
            try {
                collectedContext = await this.collectIdeContext(text, workspaceHash, auth);
            }
            catch (e) {
                const message = err(e);
                contextStatus.notes?.push(`context partial: ${message}`);
                addDiagnosticEvent("context_partial", message, "warn");
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
                    const message = err(e);
                    contextStatus.notes?.push(`mentions partial: ${message}`);
                    addDiagnosticEvent("mentions_partial", message, "warn");
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
                const message = err(e);
                contextStatus.notes?.push(`symbol lookup partial: ${message}`);
                addDiagnosticEvent("symbol_lookup_partial", message, "warn");
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
                    phase: "ready",
                    sections: sectionCount,
                    snippets: collectedContext.indexedSnippets?.length ?? 0,
                    workspaceMatches: collectedContext.openFiles?.length ?? 0,
                    indexFreshness: this.indexFreshness,
                    discoveryCommands: (collectedContext.git?.status?.length ?? 0) > 0 || collectedContext.git?.diffSummary ? 3 : 0,
                };
            }
        }
        contextStatus.phase = "ready";
        contextStatus.preflightMs = Date.now() - preflightStarted;
        this.postContextStatus(runThreadId, contextStatus);
        if (contextStatus.notes?.length) {
            this.postRun(runThreadId, { type: "status", text: contextStatus.notes.join(" | ") });
        }
        const hintedTargetPath = normalizeWorkspaceRelativePath(String(collectedContext?.activeFile?.path || collectedContext?.openFiles?.[0]?.path || "").replace(/\\/g, "/"));
        const selectedCodeHint = String(collectedContext?.activeFile?.selection || "").trim();
        const taskForAssist = wantsEdits
            ? [
                taskWithReasoning,
                hintedTargetPath ? `Primary target file hint: ${hintedTargetPath}` : "",
                selectedCodeHint ? `Selected code hint:\n${selectedCodeHint.slice(0, 1200)}` : "",
                hintedTargetPath
                    ? "If unsure, edit the hinted file directly. Do not ask for an exact file path when IDE context is available."
                    : "",
            ]
                .filter(Boolean)
                .join("\n\n")
            : taskWithReasoning;
        const noActionIntent = !this.hasExecutionIntent(text) && !this.hasExplicitEditIntent(text) && !this.hasExplicitCommandRunIntent(text) && !this.hasCodeTaskSignals(text);
        if ((conversational || strictConversationOnly || noActionIntent) && !wantsEdits) {
            // Hard stop: keep chat-only turns from reaching the action/autonomy pipeline.
            this.cancelRequested = true;
            const cancel = this.activeStreamCancel;
            if (typeof cancel === "function") {
                cancel();
            }
            this.activeStreamCancel = null;
            this.pendingActions = [];
            this.guardrailIssues = [];
            this.lastRunMeta = null;
            this.lastActionOutcome = null;
            this.post({ type: "pendingActions", count: 0 });
            const polite = smallTalk
                ? "Hi! What would you like to work on?"
                : `Got it. Share a task or a file and I'll jump in when you're ready.`;
            this.postRun(runThreadId, { type: "assistant", text: polite });
            this.postRun(runThreadId, { type: "end" });
            return;
        }
        if (conversational || strictConversationOnly) {
            const polite = smallTalk ? "Hi! What would you like to work on?" : taskWithReasoning;
            this.postRun(runThreadId, { type: "assistant", text: polite });
            this.postRun(runThreadId, { type: "end" });
            return;
        }
        const guardrailIssues = [];
        const recordGuardrailIssue = (detail) => {
            const message = String(detail || "").trim();
            if (!message)
                return;
            if (guardrailIssues.includes(message))
                return;
            guardrailIssues.push(message);
            addDiagnosticEvent("guardrail_blocked", message, "warn");
            this.addTimeline("guardrail", message.slice(0, 180));
        };
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
                task: taskForAssist,
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
                executionPolicy: requestMode === "generate" ? "preview_first" : this.getExecutionPolicy(),
                autonomy: requestMode === "generate"
                    ? {
                        mode: "bounded",
                        maxCycles: 0,
                        noClarifyToUser: true,
                        commandPolicy: "safe_default",
                        safetyFloor: "standard",
                        failsafe: "enabled",
                    }
                    : {
                        mode: autonomyProfile.mode,
                        maxCycles: autonomyProfile.maxCycles,
                        noClarifyToUser: autonomyProfile.noClarifyToUser,
                        commandPolicy: autonomyProfile.commandPolicy,
                        safetyFloor: autonomyProfile.safetyFloor,
                        failsafe: autonomyProfile.failsafe,
                    },
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
                else if (ev === "reasoning_token" || ev === "reasoning") {
                    const chunk = typeof p === "string" ? p : String(p ?? "");
                    if (chunk) {
                        this.postRun(runThreadId, { type: "reasoningToken", text: chunk });
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
                    const forceTargetPath = wantsEdits && hintedTargetPath && !conversational ? hintedTargetPath : null;
                    const editItems = Array.isArray(p) ? p : Array.isArray(p?.edits) ? p.edits : [];
                    if (editItems.length && allowActions && !strictConversationOnly) {
                        for (const edit of editItems) {
                            const rawPath = typeof edit?.path === "string" ? String(edit.path).trim() : "";
                            const editPath = forceTargetPath || rawPath;
                            const rawPatch = typeof edit?.patch === "string"
                                ? (edit.patch || "")
                                : typeof edit?.diff === "string"
                                    ? (edit.diff || "")
                                    : "";
                            const normalizedPatch = normalizeIncomingPatchText(rawPatch);
                            if (!editPath) {
                                recordGuardrailIssue("Blocked edit action: missing/invalid target path.");
                                continue;
                            }
                            if (!normalizedPatch.patch) {
                                recordGuardrailIssue(`Blocked edit action for ${editPath}: missing patch/diff content.`);
                                continue;
                            }
                            if (patchHasWrappedToolPayloadArtifacts(normalizedPatch.patch)) {
                                recordGuardrailIssue(`Blocked edit action for ${editPath}: wrapped tool payload detected in patch.`);
                                continue;
                            }
                            if (patchHasLeakedPatchArtifacts(normalizedPatch.patch)) {
                                recordGuardrailIssue(`Blocked edit action for ${editPath}: leaked diff/apply_patch markers detected.`);
                                continue;
                            }
                            if (normalizedPatch.recovered) {
                                addDiagnosticEvent("patch_recovered", `Recovered wrapped patch payload for ${editPath}.`, "info");
                            }
                            if (editPath && normalizedPatch.patch) {
                                const editPatch = normalizedPatch.patch;
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
                            else {
                                recordGuardrailIssue("Blocked command action: empty/invalid command payload.");
                            }
                        }
                        this.post({ type: "pendingActions", count: this.pendingActions.length });
                    }
                }
                else if (ev === "actions_chunk") {
                    if (Array.isArray(p) && allowActions && !strictConversationOnly) {
                        const forceTargetPath = wantsEdits && hintedTargetPath && !conversational ? hintedTargetPath : null;
                        for (const action of p) {
                            if (!action || typeof action !== "object") {
                                recordGuardrailIssue("Blocked action payload: action item was not an object.");
                                continue;
                            }
                            const type = String(action.type || "").toLowerCase();
                            if (type === "edit") {
                                const rawPath = typeof action.path === "string" ? String(action.path).trim() : "";
                                const path = forceTargetPath || rawPath;
                                const patch = typeof action.patch === "string"
                                    ? String(action.patch).trim()
                                    : typeof action.diff === "string"
                                        ? String(action.diff).trim()
                                        : "";
                                const normalizedPatch = normalizeIncomingPatchText(patch);
                                if (!path) {
                                    recordGuardrailIssue("Blocked edit action: missing/invalid target path.");
                                    continue;
                                }
                                if (!normalizedPatch.patch) {
                                    recordGuardrailIssue(`Blocked edit action for ${path}: missing patch/diff content.`);
                                    continue;
                                }
                                if (patchHasWrappedToolPayloadArtifacts(normalizedPatch.patch)) {
                                    recordGuardrailIssue(`Blocked edit action for ${path}: wrapped tool payload detected in patch.`);
                                    continue;
                                }
                                if (patchHasLeakedPatchArtifacts(normalizedPatch.patch)) {
                                    recordGuardrailIssue(`Blocked edit action for ${path}: leaked diff/apply_patch markers detected.`);
                                    continue;
                                }
                                if (normalizedPatch.recovered) {
                                    addDiagnosticEvent("patch_recovered", `Recovered wrapped patch payload for ${path}.`, "info");
                                }
                                this.pendingActions.push({ type: "edit", path, patch: normalizedPatch.patch });
                                this.postRun(runThreadId, { type: "editPreview", path, patch: normalizedPatch.patch });
                                continue;
                            }
                            if (type === "command") {
                                const command = typeof action.command === "string" ? String(action.command).trim() : "";
                                const category = action.category === "implementation" || action.category === "validation"
                                    ? (action.category)
                                    : undefined;
                                if (command)
                                    this.pendingActions.push({ type: "command", command, ...(category ? { category } : {}) });
                                else
                                    recordGuardrailIssue("Blocked command action: missing command text.");
                                continue;
                            }
                            if (type === "mkdir") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                if (path)
                                    this.pendingActions.push({ type: "mkdir", path });
                                else
                                    recordGuardrailIssue("Blocked mkdir action: missing/invalid target path.");
                                continue;
                            }
                            if (type === "write_file") {
                                const path = typeof action.path === "string" ? String(action.path).trim() : "";
                                const content = typeof action.content === "string" ? action.content : "";
                                const overwrite = typeof action.overwrite === "boolean" ? action.overwrite : undefined;
                                if (!path) {
                                    recordGuardrailIssue("Blocked write_file action: missing/invalid target path.");
                                    continue;
                                }
                                if (looksLikeWrappedToolPayloadText(content)) {
                                    recordGuardrailIssue(`Blocked write_file action for ${path}: wrapped tool payload detected in file content.`);
                                    continue;
                                }
                                if ((0, patch_utils_1.textContainsLeakedPatchArtifacts)(content)) {
                                    recordGuardrailIssue(`Blocked write_file action for ${path}: leaked diff/apply_patch markers detected in content.`);
                                    continue;
                                }
                                this.pendingActions.push({ type: "write_file", path, content, ...(overwrite !== undefined ? { overwrite } : {}) });
                                continue;
                            }
                            recordGuardrailIssue(`Blocked action payload: unsupported action type "${type || "unknown"}".`);
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
                addDiagnosticEvent("run_cancelled", "Response cancelled by user.", "info");
                this.postRun(runThreadId, { type: "status", text: "Response stopped." });
            }
            else {
                const message = err(e);
                if (!options.modelFallbackAttempted && backupModelCandidate && isLikelyInvalidModelError(message)) {
                    addDiagnosticEvent("model_fallback", `Model "${model}" unavailable. Retrying with "${backupModelCandidate}".`, "warn");
                    this.postRun(runThreadId, {
                        type: "status",
                        text: `Model unavailable. Retrying with backup model: ${modelLabelForUi(backupModelCandidate)}.`,
                    });
                    emitDiagnosticsBundle("stream", "Auto-retrying with backup model after model-unavailable error.", {
                        model: modelLabelForUi(backupModelCandidate),
                        reasoning,
                        mode: requestMode,
                    });
                    await this.askSingleCycle(text, parallel, backupModelCandidate, reasoning, {
                        includeIdeContext: options.includeIdeContext,
                        workspaceContextLevel: options.workspaceContextLevel,
                        attachments: options.attachments,
                        threadId: runThreadId,
                        contextRetryAttempted: options.contextRetryAttempted,
                        modelFallbackAttempted: true,
                        autonomousLoop: false,
                    });
                    return;
                }
                addDiagnosticEvent("stream_error", message, "error");
                if (activeThreadId && /historysessionid|unknown historysessionid/i.test(message)) {
                    addDiagnosticEvent("session_recovery", "Detected stale session id; retrying stream without history session id.", "warn");
                    this.addTimeline("session", "stale history session recovered");
                    await runStream(null).catch((inner) => {
                        const innerMessage = err(inner);
                        addDiagnosticEvent("session_recovery_failed", innerMessage, "error");
                        this.postRun(runThreadId, { type: "err", text: innerMessage });
                    });
                }
                else {
                    this.postRun(runThreadId, { type: "err", text: message });
                }
            }
        }
        finally {
            this.activeStreamCancel = null;
        }
        this.guardrailIssues = guardrailIssues.slice(0, 20);
        if (this.threads[activeThreadId])
            this.threads[activeThreadId].updatedAt = new Date().toISOString();
        await this.loadHistory();
        await this.postThreadState();
        this.postRun(runThreadId, { type: "end" });
        if (this.cancelRequested) {
            emitDiagnosticsBundle("final", "Run cancelled before action execution.");
            this.pendingActions = [];
            this.post({ type: "pendingActions", count: 0 });
            return;
        }
        if (!allowActions) {
            emitDiagnosticsBundle("final", "Run completed without action execution.");
            if (this.pendingActions.length > 0) {
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
            }
            return;
        }
        if ((conversational || strictConversationOnly) && this.pendingActions.length > 0) {
            emitDiagnosticsBundle("final", "Conversation-only run; pending actions discarded.");
            this.pendingActions = [];
            this.post({ type: "pendingActions", count: 0 });
            return;
        }
        const actionabilitySummary = (this.lastRunMeta || null)?.actionability?.summary;
        const shouldAutoContextRetry = allowActions &&
            wantsEdits &&
            !conversational &&
            !strictConversationOnly &&
            this.pendingActions.length === 0 &&
            !options.contextRetryAttempted &&
            actionabilitySummary === "clarification_needed" &&
            !!hintedTargetPath;
        if (shouldAutoContextRetry && hintedTargetPath) {
            const retryTask = `${text.trim()}\n\nApply the requested change directly in ${hintedTargetPath}. Do not ask for file-path clarification; generate actionable edits for this file.`;
            addDiagnosticEvent("auto_context_retry", `Retried with explicit file target: ${hintedTargetPath}`, "warn");
            this.postRun(runThreadId, {
                type: "status",
                text: `No actionable edits were produced. Retrying once with explicit file target: ${hintedTargetPath}`,
            });
            await this.askSingleCycle(retryTask, parallel, model, reasoning, {
                includeIdeContext: options.includeIdeContext,
                workspaceContextLevel: options.workspaceContextLevel,
                attachments: options.attachments,
                threadId: runThreadId,
                contextRetryAttempted: true,
                autonomousLoop: false,
            });
            emitDiagnosticsBundle("actions", "Retried run with explicit file target due to no actionable edits.");
            return;
        }
        if (allowActions &&
            wantsEdits &&
            this.pendingActions.length === 0 &&
            hintedTargetPath &&
            !options.contextRetryAttempted) {
            addDiagnosticEvent("no_actions_retry", `No actions were produced; retrying with explicit target: ${hintedTargetPath}`, "warn");
            this.postRun(runThreadId, {
                type: "status",
                text: `No actionable edits were produced. Retrying once with explicit target: ${hintedTargetPath}`,
            });
            const retryTask = [
                taskWithReasoning,
                `Primary target file: ${hintedTargetPath}`,
                "Return at least one edit/write_file action that directly applies the requested changes to this file.",
            ]
                .filter(Boolean)
                .join("\n\n");
            await this.askSingleCycle(retryTask, parallel, model, reasoning, {
                includeIdeContext: options.includeIdeContext,
                workspaceContextLevel: options.workspaceContextLevel,
                attachments: options.attachments,
                threadId: runThreadId,
                contextRetryAttempted: true,
                autonomousLoop: false,
            });
            emitDiagnosticsBundle("actions", "Retried run because no actions were produced for edit intent.");
            return;
        }
        if (allowActions && this.pendingActions.length === 0 && guardrailIssues.length > 0) {
            const outcome = {
                filesChanged: 0,
                checksRun: 0,
                quality: "needs_attention",
                summary: `Guardrails blocked ${guardrailIssues.length} malformed action(s).`,
                perFile: [],
                appliedFiles: [],
                debug: {
                    requestedActions: guardrailIssues.length,
                    approvedActions: 0,
                    rejectedActions: guardrailIssues.length,
                    localRejectedEdits: 0,
                    rejectedSamples: guardrailIssues.slice(0, 8),
                    localRejectedSamples: [],
                    applyErrors: [],
                },
            };
            this.lastActionOutcome = outcome;
            this.postRun(runThreadId, {
                type: "actionOutcome",
                data: outcome,
            });
            this.guardrailIssues = [];
            emitDiagnosticsBundle("actions", `Guardrails blocked ${guardrailIssues.length} malformed action(s).`);
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
            // Force auto-apply for non-conversational edit runs to avoid dangling preview-only state.
            const forceAutoApply = !conversational && hasEditActions;
            const effectiveAutoApplyEdits = forceAutoApply ? true : autoApplyEdits;
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
            const commandOnlyForEditRequest = wantsEdits &&
                !explicitCommandIntent &&
                hasCommandActions &&
                !hasEditActions;
            if (commandOnlyForEditRequest) {
                const retryTarget = hintedTargetPath || normalizeWorkspaceRelativePath(String(validation?.touchedFiles?.[0] || ""));
                if (!options.contextRetryAttempted) {
                    const retryTask = [
                        text.trim(),
                        retryTarget ? `Apply the requested change directly in ${retryTarget}.` : "",
                        "Return at least one file action (edit/write_file/mkdir). Do not return command-only output.",
                    ]
                        .filter(Boolean)
                        .join("\n\n");
                    addDiagnosticEvent("command_only_retry", "Received command-only actions for an edit request; retrying once for concrete file edits.", "warn");
                    this.postRun(runThreadId, {
                        type: "status",
                        text: retryTarget
                            ? `No file edits were produced. Retrying once with explicit file target: ${retryTarget}`
                            : "No file edits were produced. Retrying once with stronger edit-only instructions.",
                    });
                    await this.askSingleCycle(retryTask, parallel, model, reasoning, {
                        includeIdeContext: options.includeIdeContext,
                        workspaceContextLevel: options.workspaceContextLevel,
                        attachments: options.attachments,
                        threadId: runThreadId,
                        contextRetryAttempted: true,
                        autonomousLoop: false,
                    });
                    emitDiagnosticsBundle("actions", "Retried run because edit request produced command-only actions.");
                    return;
                }
                addDiagnosticEvent("command_only_blocked", "Command-only actions were skipped for an edit request.", "warn");
                this.postRun(runThreadId, {
                    type: "status",
                    text: "No file edits were produced. Skipped auto-running command-only actions for this edit request.",
                });
                const outcome = {
                    filesChanged: 0,
                    checksRun: 0,
                    quality: "needs_attention",
                    summary: "No file edits were produced; command-only actions were skipped.",
                    appliedFiles: [],
                };
                this.lastActionOutcome = outcome;
                this.postRun(runThreadId, {
                    type: "actionOutcome",
                    data: outcome,
                });
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
                emitDiagnosticsBundle("actions", "Skipped command-only actions for edit request after retry.");
                return;
            }
            if (hasEditActions && !effectiveAutoApplyEdits) {
                this.postRun(runThreadId, {
                    type: "status",
                    text: `Prepared ${this.pendingActions.length} action(s), not executed. Execution policy is ${policy}.`,
                });
                const outcome = {
                    filesChanged: 0,
                    checksRun: 0,
                    quality: "preview_only",
                    summary: "Edits prepared for preview, not auto-applied.",
                    appliedFiles: [],
                };
                this.lastActionOutcome = outcome;
                this.postRun(runThreadId, {
                    type: "actionOutcome",
                    data: outcome,
                });
                this.postRun(runThreadId, { type: "prefill", text: "apply now" });
                emitDiagnosticsBundle("actions", "Actions prepared for preview only; auto-apply disabled by policy.");
                return;
            }
            const actionsToExecute = [];
            if (hasEditActions && effectiveAutoApplyEdits) {
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "edit"));
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "mkdir"));
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "write_file"));
            }
            if (hasCommandActions && autoRunValidation) {
                actionsToExecute.push(...this.pendingActions.filter((a) => a.type === "command"));
            }
            if (actionsToExecute.length > 0) {
                if (cycleContext) {
                    this.postAutonomyRuntime(runThreadId, {
                        objective: objectiveText,
                        cycle: cycleContext.cycle,
                        maxCycles: cycleContext.maxCycles,
                        phase: "apply",
                        completionStatus: "incomplete",
                        completionScore: 0,
                        missingRequirements: [],
                        blocker: "Applying local file edits and commands.",
                        appliedFiles: [],
                        filesChanged: 0,
                        checksRun: 0,
                    });
                }
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
                await this.executePendingActions(actionsToExecute, runThreadId, runTraceId);
                emitDiagnosticsBundle("final", "Run completed with auto-execution stage.");
            }
            else {
                if (lowConfidenceCommandOnly && hasCommandActions && !hasEditActions) {
                    addDiagnosticEvent("command_preview_only", "Low-confidence command-only run kept in preview.", "warn");
                    if (!conversational) {
                        this.postRun(runThreadId, { type: "status", text: "No runnable commands extracted; kept in preview." });
                        this.postRun(runThreadId, { type: "prefill", text: "run anyway" });
                    }
                    this.post({ type: "pendingActions", count: this.pendingActions.length });
                    emitDiagnosticsBundle("actions", "Command execution paused due to low confidence.");
                    return;
                }
                if (!conversational) {
                    const modeLabel = validation?.scope === "targeted" ? "Targeted validation skipped" : "Auto-execution skipped";
                    this.postRun(runThreadId, { type: "status", text: `Prepared ${this.pendingActions.length} action(s). ${modeLabel}. Execution policy prevented auto-run.` });
                }
                this.pendingActions = [];
                this.post({ type: "pendingActions", count: 0 });
                emitDiagnosticsBundle("actions", "Execution skipped by policy; actions remained in preview.");
            }
        }
        emitDiagnosticsBundle("final", "Run completed.");
    }
    async loadHistory() {
        const auth = await this.resolveRequestAuth();
        if (!auth) {
            this.recentHistory = [];
            await this.postThreadState();
            return;
        }
        const items = [];
        const seen = new Set();
        const seenCursors = new Set();
        let cursor = null;
        let page = 0;
        while (page < 20) {
            const qs = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : "?limit=100";
            const r = await req("GET", `${base()}/api/v1/playground/sessions${qs}`, auth).catch(() => ({}));
            const rows = (r?.data?.data || [])
                .map((x) => this.threadFromApiRow(x))
                .filter((x) => x.id);
            for (const row of rows) {
                if (seen.has(row.id))
                    continue;
                seen.add(row.id);
                items.push(row);
            }
            const nextCursorRaw = typeof r?.data?.nextCursor === "string" ? r.data.nextCursor.trim() : "";
            if (!nextCursorRaw || seenCursors.has(nextCursorRaw) || rows.length === 0)
                break;
            seenCursors.add(nextCursorRaw);
            cursor = nextCursorRaw;
            page += 1;
        }
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
    async executePendingActions(actions, threadIdOverride, traceIdOverride) {
        const auth = await this.resolveRequestAuth();
        if (!auth)
            return this.post({ type: "err", text: "Not authenticated. Use Sign in (browser) or set an API key." });
        const runThreadId = threadIdOverride || this.activeThreadId || null;
        const runStartedAt = Date.now();
        const diagnosticsTraceId = traceIdOverride || createTraceId();
        const executionEvents = [];
        const executionEventKeys = new Set();
        const addExecutionEvent = (code, message, severity = "warn") => {
            const normalizedCode = String(code || "unknown").trim() || "unknown";
            const normalizedMessage = String(message || "").trim();
            if (!normalizedMessage)
                return;
            const key = `${normalizedCode}:${normalizedMessage}`;
            if (executionEventKeys.has(key))
                return;
            executionEventKeys.add(key);
            executionEvents.push({ code: normalizedCode, message: normalizedMessage, severity, ts: Date.now() });
            if (executionEvents.length > 40)
                executionEvents.splice(0, executionEvents.length - 40);
        };
        const emitExecutionDiagnostics = (summary) => {
            if (!executionEvents.length)
                return;
            this.postDiagnosticsBundle(runThreadId, {
                traceId: diagnosticsTraceId,
                stage: "execute",
                summary: String(summary || "Execution diagnostics"),
                model: modelLabelForUi(vscode.workspace.getConfiguration("xpersona.playground").get("model") || DEFAULT_PLAYGROUND_MODEL),
                reasoning: "medium",
                mode: this.mode,
                startedAt: runStartedAt,
                endedAt: Date.now(),
                events: executionEvents.slice(-40),
            });
        };
        const guardrailIssues = this.guardrailIssues.slice(0, 20);
        this.guardrailIssues = [];
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
            addExecutionEvent("execute_api_error", String(r.error), "error");
            emitExecutionDiagnostics("Execution API request failed.");
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
        let commandFailures = 0;
        const applyErrors = [];
        const changedPaths = new Set();
        const perFileStatuses = [];
        const undoFileSnapshots = new Map();
        const undoCreatedDirs = new Set();
        const approvedCommands = [];
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
                    if (applied.changed) {
                        appliedEdits += 1;
                        changedPaths.add(row.action.path || "unknown");
                    }
                    this.postRun(runThreadId, {
                        type: "fileAction",
                        path: row.action.path || "unknown",
                        status: applied.status,
                        reason: applied.reason || (applied.changed ? "" : "Patch produced no file changes."),
                    });
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
                    if (applied.changed) {
                        appliedEdits += 1;
                        changedPaths.add(row.action.path);
                    }
                    this.postRun(runThreadId, {
                        type: "fileAction",
                        path: row.action.path,
                        status: "applied",
                        reason: applied.reason || (applied.changed ? "Directory created" : "Directory already existed."),
                    });
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
                    if (applied.changed) {
                        appliedEdits += 1;
                        changedPaths.add(row.action.path);
                    }
                    this.postRun(runThreadId, {
                        type: "fileAction",
                        path: row.action.path,
                        status: "applied",
                        reason: applied.reason || (applied.changed ? "File created/updated" : "File already matched requested content."),
                    });
                }
                else if (applied.reason) {
                    applyErrors.push(`${row.action.path}: ${applied.reason}`);
                }
            }
            else if (row.action.type === "command" && row.action.command) {
                approvedCommands.push(row.action.command);
            }
        }
        const shouldRunApprovedCommands = !expectedFileChanges || changedPaths.size > 0;
        if (!shouldRunApprovedCommands && approvedCommands.length > 0) {
            const skippedMessage = `Skipped ${approvedCommands.length} command(s) because no file edits were actually applied.`;
            addExecutionEvent("validation_skipped_no_file_change", skippedMessage, "warn");
            this.postRun(runThreadId, {
                type: "status",
                text: "Skipped validation commands because no file edits were actually applied.",
            });
        }
        else {
            for (const command of approvedCommands) {
                this.postRun(runThreadId, { type: "terminalCommand", command });
                const result = await this.runApprovedCommand(command, runThreadId, addExecutionEvent);
                launchedCommands += 1;
                if (!result.ok)
                    commandFailures += 1;
            }
        }
        const approved = results.filter((x) => x.status === "approved").length;
        const rejected = results.filter((x) => x.status !== "approved");
        const localRejected = perFileStatuses.filter((row) => row.status !== "applied" && row.status !== "partial");
        const rejectedSummaries = rejected
            .map((row) => {
            const type = String(row.action?.type || "action");
            const target = row.action?.type === "command"
                ? String(row.action?.command || "unknown")
                : String(row.action?.path || "unknown");
            const reason = String(row.reason || "no reason provided");
            return `${type} ${target}: ${reason}`;
        })
            .slice(0, 8);
        const localRejectedSummaries = localRejected
            .map((row) => `${row.path}: ${row.reason || row.status}`)
            .slice(0, 8);
        rejectedSummaries.forEach((message) => addExecutionEvent("server_rejected", message, "warn"));
        localRejectedSummaries.forEach((message) => addExecutionEvent("local_rejected", message, "warn"));
        applyErrors.forEach((message) => addExecutionEvent("apply_error", message, "error"));
        guardrailIssues.forEach((message) => addExecutionEvent("guardrail_blocked", message, "warn"));
        if (expectedFileChanges && changedPaths.size === 0) {
            const debugReasons = [];
            if (rejected.length > 0)
                debugReasons.push(`server rejected ${rejected.length} action(s)`);
            if (localRejected.length > 0)
                debugReasons.push(`local patch apply rejected ${localRejected.length} file action(s)`);
            if (applyErrors.length > 0)
                debugReasons.push(`apply errors: ${applyErrors.slice(0, 2).join(" | ")}`);
            if (guardrailIssues.length > 0)
                debugReasons.push(`guardrails blocked ${guardrailIssues.length} malformed action(s)`);
            if (debugReasons.length === 0)
                debugReasons.push("no approved file actions reached local patch application");
            const firstDetail = applyErrors[0] ||
                guardrailIssues[0] ||
                localRejectedSummaries[0] ||
                rejectedSummaries[0] ||
                "";
            this.postRun(runThreadId, {
                type: "status",
                text: `Execution debug: No file edits were applied. ${debugReasons[0]}. ${firstDetail ? `Detail: ${firstDetail}` : ""}`.trim(),
            });
            if (debugReasons.length > 1) {
                this.postRun(runThreadId, {
                    type: "status",
                    text: `Execution debug details: ${debugReasons.slice(1).join(" | ")}`,
                });
            }
        }
        const localExecLogs = [
            {
                ts: Date.now(),
                level: changedPaths.size > 0 ? "info" : "error",
                message: `LOCAL_SUMMARY requested=${actionList.length} approved=${approved} rejected=${rejected.length} ` +
                    `applied_edits=${appliedEdits} files_changed=${changedPaths.size} commands_launched=${launchedCommands} guardrail_blocked=${guardrailIssues.length}`,
            },
            ...guardrailIssues.slice(0, 8).map((message) => ({ ts: Date.now(), level: "error", message: `GUARDRAIL_BLOCKED ${message}` })),
            ...rejectedSummaries.map((message) => ({ ts: Date.now(), level: "error", message: `SERVER_REJECTED ${message}` })),
            ...localRejectedSummaries.map((message) => ({ ts: Date.now(), level: "error", message: `LOCAL_REJECTED ${message}` })),
        ];
        this.postRun(runThreadId, { type: "execLogs", data: localExecLogs });
        this.postRun(runThreadId, {
            type: "status",
            text: `Execute finished: ${approved}/${results.length} approved. Applied ${appliedEdits} edit(s), launched ${launchedCommands} command(s).`,
        });
        if (applyErrors.length) {
            this.postRun(runThreadId, { type: "err", text: `Some approved edits were not auto-applied:\n- ${applyErrors.join("\n- ")}` });
        }
        const outcome = {
            filesChanged: changedPaths.size,
            checksRun: launchedCommands,
            quality: applyErrors.length || (expectedFileChanges && changedPaths.size === 0) || commandFailures > 0 ? "needs_attention" : "good",
            summary: applyErrors.length
                ? "Applied edits with warnings. Review rejected patches."
                : expectedFileChanges && changedPaths.size === 0
                    ? "No file edits were applied."
                    : commandFailures > 0
                        ? "Some commands failed. Review execution logs."
                        : "Actions completed successfully.",
            perFile: perFileStatuses,
            appliedFiles: Array.from(changedPaths),
            debug: {
                requestedActions: actionList.length,
                approvedActions: approved,
                rejectedActions: rejected.length + guardrailIssues.length,
                localRejectedEdits: localRejected.length,
                commandFailures,
                rejectedSamples: [...guardrailIssues.map((x) => `guardrail ${x}`), ...rejectedSummaries].slice(0, 8),
                localRejectedSamples: localRejectedSummaries,
                applyErrors: applyErrors.slice(0, 8),
            },
        };
        this.lastActionOutcome = outcome;
        this.postRun(runThreadId, {
            type: "actionOutcome",
            data: outcome,
        });
        emitExecutionDiagnostics(applyErrors.length || rejected.length || localRejected.length || guardrailIssues.length
            ? "Execution completed with warnings/errors."
            : "Execution completed successfully.");
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
            return { status: "rejected_path_policy", reason: "Invalid relative path in edit action.", changed: false };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open.", changed: false };
        const incomingPatch = action.patch || action.diff || "";
        const normalizedPatch = normalizeIncomingPatchText(incomingPatch);
        const patchText = normalizedPatch.patch;
        if (!patchText)
            return { status: "rejected_invalid_patch", reason: "Missing patch/diff content for edit action.", changed: false };
        if (patchHasWrappedToolPayloadArtifacts(patchText)) {
            return {
                status: "rejected_invalid_patch",
                reason: "Patch blocked: detected structured tool payload instead of unified diff content.",
                changed: false,
            };
        }
        if (patchHasLeakedPatchArtifacts(patchText)) {
            return {
                status: "rejected_invalid_patch",
                reason: "Patch blocked: detected leaked diff/apply_patch markers in target file changes.",
                changed: false,
            };
        }
        const patchTarget = normalizeWorkspaceRelativePath((0, patch_utils_1.extractPatchTargetPath)(patchText) || rel);
        if (!patchTarget) {
            return { status: "rejected_path_policy", reason: "Invalid target path in patch header.", changed: false };
        }
        // Allow patches whose header points elsewhere; we trust the approved action path instead of rejecting.
        const effectiveRel = patchTarget === rel ? rel : rel;
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
            return { status: applied.status, reason: applied.reason || "Unsupported patch format.", changed: false };
        }
        if (applied.content === original) {
            return {
                status: applied.status,
                reason: applied.reason || "Patch matched file context but did not change content.",
                changed: false,
            };
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(applied.content, "utf8"));
        return {
            status: applied.status,
            ...(applied.reason ? { reason: applied.reason } : {}),
            changed: true,
        };
    }
    async applyMkdirAction(action, undoCreatedDirs) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for mkdir action.", changed: false };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open.", changed: false };
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
        return {
            status: "applied",
            changed: !existedBefore,
            ...(existedBefore ? { reason: "Directory already existed." } : {}),
        };
    }
    async applyWriteFileAction(action, undoCollector) {
        const rel = normalizeWorkspaceRelativePath(action.path || "");
        if (!rel)
            return { status: "rejected_path_policy", reason: "Invalid relative path for write_file action.", changed: false };
        const root = this.getWorkspaceRoot();
        if (!root)
            return { status: "rejected_path_policy", reason: "No workspace folder open.", changed: false };
        await this.captureUndoFileSnapshot(root, rel, undoCollector);
        const relParts = rel.split("/").filter(Boolean);
        const target = vscode.Uri.joinPath(root.uri, ...relParts);
        const parent = path.posix.dirname(rel);
        if (parent && parent !== ".") {
            const parentUri = vscode.Uri.joinPath(root.uri, ...parent.split("/").filter(Boolean));
            await vscode.workspace.fs.createDirectory(parentUri);
        }
        const overwrite = action.overwrite !== false;
        let existedBefore = true;
        let existingContent = "";
        try {
            const existing = await vscode.workspace.fs.readFile(target);
            existingContent = Buffer.from(existing).toString("utf8");
        }
        catch {
            existedBefore = false;
        }
        if (!overwrite) {
            if (existedBefore) {
                return {
                    status: "rejected_path_policy",
                    reason: "write_file blocked: file already exists and overwrite=false.",
                    changed: false,
                };
            }
        }
        const content = String(action.content || "");
        if (looksLikeWrappedToolPayloadText(content)) {
            return {
                status: "rejected_path_policy",
                reason: "write_file blocked: detected structured tool payload instead of raw file content.",
                changed: false,
            };
        }
        if ((0, patch_utils_1.textContainsLeakedPatchArtifacts)(content)) {
            return {
                status: "rejected_path_policy",
                reason: "write_file blocked: detected leaked diff/apply_patch markers in file content.",
                changed: false,
            };
        }
        if (existedBefore && existingContent === content) {
            return {
                status: "applied",
                reason: "File already matched requested content.",
                changed: false,
            };
        }
        await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
        await vscode.workspace.fs.stat(target);
        return { status: "applied", changed: true };
    }
    async runApprovedCommand(command, threadId, addExecutionEvent) {
        const root = this.getWorkspaceRoot();
        const cwd = root?.uri.fsPath || process.cwd();
        const isWindows = process.platform === "win32";
        const shell = isWindows ? "powershell.exe" : "bash";
        const args = isWindows
            ? ["-NoProfile", "-NonInteractive", "-Command", command]
            : ["-lc", command];
        const timeoutMs = 15 * 60 * 1000;
        const maxBuffer = 8 * 1024 * 1024;
        const result = await new Promise((resolve) => {
            (0, child_process_1.execFile)(shell, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout, stderr) => {
                const exitCodeRaw = error?.code;
                const exitCode = typeof exitCodeRaw === "number"
                    ? exitCodeRaw
                    : typeof exitCodeRaw === "string"
                        ? Number(exitCodeRaw)
                        : error
                            ? 1
                            : 0;
                const ok = !error || exitCode === 0;
                const out = String(stdout || "");
                const errText = String(stderr || error?.message || "");
                resolve({ ok, exitCode: Number.isFinite(exitCode) ? exitCode : null, stdout: out, stderr: errText });
            });
        });
        const summary = `${result.ok ? "APPROVED" : "REJECTED"} command ${command} [exit ${result.exitCode ?? "?"}]${!result.ok && result.stderr.trim()
            ? ` (${result.stderr.trim().split("\n")[0].slice(0, 200)})`
            : ""}`;
        this.postRun(threadId, {
            type: "execLogs",
            data: [{ ts: Date.now(), level: result.ok ? "info" : "error", message: summary }],
        });
        if (!result.ok && addExecutionEvent) {
            addExecutionEvent("command_failed", summary, "error");
        }
        const stderrLine = result.stderr.trim();
        if (stderrLine && !result.ok) {
            this.postRun(threadId, {
                type: "execLogs",
                data: [{ ts: Date.now(), level: "error", message: stderrLine.split("\n").slice(0, 4).join("\n").slice(0, 600) }],
            });
        }
        const stdoutLine = result.stdout.trim();
        if (stdoutLine) {
            this.postRun(threadId, {
                type: "execLogs",
                data: [{ ts: Date.now(), level: "info", message: stdoutLine.split("\n").slice(0, 8).join("\n").slice(0, 800) }],
            });
        }
        return result;
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
    killAllTerminals(reason) {
        const terminals = vscode.window.terminals || [];
        if (!terminals.length)
            return;
        let closed = 0;
        for (const terminal of terminals) {
            try {
                terminal.dispose();
                closed += 1;
            }
            catch {
                // Swallow dispose errors to avoid masking the cancel flow.
            }
        }
        this.commandTerminal = null;
        if (closed > 0) {
            const detail = reason ? reason.replace(/_/g, " ") : "user stop";
            this.addTimeline("terminal", `closed ${closed} terminal(s) ${detail}`);
            this.post({ type: "status", text: `Closed ${closed} terminal${closed === 1 ? "" : "s"} after stop.` });
        }
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
    postDiagnosticsBundle(threadId, data) {
        this.postRun(threadId, { type: "diagnosticsBundle", data });
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
        const CONNECT_TIMEOUT_MS = 60000;
        const IDLE_TIMEOUT_MS = 45000;
        const x = new url_1.URL(u);
        const c = x.protocol === "https:" ? https : http;
        const p = JSON.stringify(body);
        const headers = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(options?.headers || {}),
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
            let eventName = "message";
            const dataLines = [];
            const lines = chunk.split(/\r?\n/);
            for (const rawLine of lines) {
                const line = rawLine.trimEnd();
                if (!line || line.startsWith(":"))
                    continue;
                if (line.startsWith("event:")) {
                    const nextEvent = line.slice(6).trim();
                    if (nextEvent)
                        eventName = nextEvent;
                    continue;
                }
                if (line.startsWith("data:")) {
                    dataLines.push(line.slice(5).trimStart());
                }
            }
            const raw = (dataLines.length ? dataLines.join("\n") : chunk).trim();
            if (!raw)
                return false;
            if (raw === "[DONE]") {
                finish(resolve);
                return true;
            }
            try {
                const parsed = JSON.parse(raw);
                const parsedEvent = typeof parsed?.event === "string"
                    ? parsed.event
                    : typeof parsed?.type === "string"
                        ? parsed.type
                        : eventName;
                const payload = Object.prototype.hasOwnProperty.call(parsed, "data")
                    ? parsed.data
                    : Object.prototype.hasOwnProperty.call(parsed, "payload")
                        ? parsed.payload
                        : Object.prototype.hasOwnProperty.call(parsed, "message")
                            ? parsed.message
                            : Object.prototype.hasOwnProperty.call(parsed, "text") && (parsedEvent === "token" || eventName === "token")
                                ? parsed.text
                                : parsed;
                onEvent(parsedEvent || eventName, payload);
            }
            catch {
                // Some providers stream plain text chunks with event labels.
                onEvent(eventName || "message", raw);
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
            // We reached response headers; from here rely on SSE idle timeout, not connect timeout.
            r.setTimeout(0);
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
                // Fallback for newline-delimited JSON streams that don't include SSE separators.
                if (sep.index < 0 && b.indexOf("\n") >= 0 && !/^\s*(event:|data:|:)/m.test(b)) {
                    let newline = b.indexOf("\n");
                    while (newline >= 0) {
                        const line = b.slice(0, newline).trim();
                        b = b.slice(newline + 1);
                        if (line && handleSseChunk(line))
                            return;
                        newline = b.indexOf("\n");
                    }
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
function createTraceId() {
    return `run-${Date.now().toString(36)}-${(0, crypto_1.randomBytes)(4).toString("hex")}`;
}
function base() {
    const configured = String(vscode.workspace.getConfiguration("xpersona.playground").get("baseApiUrl") || "").trim();
    const normalized = configured.replace(/\/$/, "");
    const looksHostedDefault = !normalized || /(^https?:\/\/)?xpersona\.co\/?$/i.test(normalized);
    if (looksHostedDefault) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
            try {
                if (fs.existsSync(path.join(root, ".env.local"))) {
                    return "http://localhost:3000";
                }
            }
            catch {
                // Fall through to configured/default base URL.
            }
        }
    }
    return (normalized || "http://localhost:3000").replace(/\/$/, "");
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
      .guardrail .m-time {
        display: none;
      }
      .guardrail-card {
        border: 1px solid color-mix(in srgb, var(--err) 48%, var(--surface-border));
        border-radius: 12px;
        padding: 10px 12px;
        background: color-mix(in srgb, var(--err) 12%, var(--surface));
        display: grid;
        gap: 8px;
        width: min(100%, 740px);
      }
      .guardrail-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--err) 82%, var(--fg) 18%);
      }
      .guardrail-sub {
        font-size: 12px;
        color: color-mix(in srgb, var(--fg) 88%, var(--muted));
      }
      .guardrail-list {
        margin: 0;
        padding: 0 0 0 16px;
        display: grid;
        gap: 5px;
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 84%, var(--muted));
      }
      .guardrail-more {
        color: color-mix(in srgb, var(--fg) 72%, var(--muted));
        font-style: italic;
      }
      .guardrail-meta {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 68%, var(--muted));
      }
      .guardrail-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .guardrail-copy {
        border: 1px solid color-mix(in srgb, var(--surface-border) 78%, transparent);
        background: color-mix(in srgb, var(--surface) 82%, var(--bg-0));
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
      }
      .guardrail-copy:hover {
        border-color: color-mix(in srgb, var(--accent) 55%, var(--surface-border));
        background: color-mix(in srgb, var(--accent) 18%, var(--surface));
      }
      .diagnostics .m-time {
        display: none;
      }
      .diag-card {
        border: 1px solid color-mix(in srgb, var(--surface-border) 85%, transparent);
        border-radius: 12px;
        padding: 10px 12px;
        background: color-mix(in srgb, var(--surface) 90%, var(--bg-0));
        display: grid;
        gap: 8px;
        width: min(100%, 760px);
      }
      .diag-title {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--fg) 92%, var(--muted));
      }
      .diag-sub {
        font-size: 12px;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
      }
      .diag-trace {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 70%, var(--muted));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .diag-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 6px;
      }
      .diag-item {
        border: 1px solid color-mix(in srgb, var(--surface-border) 76%, transparent);
        border-radius: 10px;
        padding: 6px 8px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 8px;
        align-items: start;
        background: color-mix(in srgb, var(--surface) 80%, var(--bg-0));
      }
      .diag-item.warn {
        border-color: color-mix(in srgb, #f59e0b 42%, var(--surface-border));
      }
      .diag-item.error {
        border-color: color-mix(in srgb, var(--err) 56%, var(--surface-border));
      }
      .diag-item.info {
        border-color: color-mix(in srgb, var(--accent) 46%, var(--surface-border));
      }
      .diag-code {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 82%, var(--muted));
        white-space: nowrap;
      }
      .diag-msg {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        overflow-wrap: anywhere;
      }
      .diag-ts {
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 60%, var(--muted));
        white-space: nowrap;
      }
      .diag-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .diag-meta {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 10px;
        color: color-mix(in srgb, var(--fg) 68%, var(--muted));
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
        min-width: 200px;
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
      .term-line.card {
        white-space: normal;
      }
      .term-line.cmdline { color: color-mix(in srgb, var(--fg) 86%, var(--muted)); }
      .term-line.ok { color: color-mix(in srgb, var(--ok) 70%, var(--fg)); }
      .term-line.err { color: color-mix(in srgb, var(--err) 72%, var(--fg)); }
      .term-line.info { color: color-mix(in srgb, var(--fg) 70%, var(--muted)); }
      .term-line.summary { color: color-mix(in srgb, var(--fg) 88%, var(--muted)); border-top: 1px solid var(--surface-border); margin-top: 4px; padding-top: 6px; }
      .term-cmd-card,
      .term-result-card {
        border: 1px solid color-mix(in srgb, var(--surface-border) 76%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--surface) 74%, var(--bg-0));
        padding: 6px 8px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
      }
      .term-result-card.ok {
        border-color: color-mix(in srgb, var(--ok) 38%, var(--surface-border));
      }
      .term-result-card.err {
        border-color: color-mix(in srgb, var(--err) 45%, var(--surface-border));
      }
      .term-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        height: 20px;
        padding: 0 7px;
        border-radius: 999px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        border: 1px solid var(--surface-border);
      }
      .term-badge.cmd {
        background: color-mix(in srgb, var(--accent) 18%, var(--bg-0));
        color: color-mix(in srgb, var(--fg) 92%, var(--accent));
        border-color: color-mix(in srgb, var(--accent) 45%, var(--surface-border));
      }
      .term-badge.ok {
        background: color-mix(in srgb, var(--ok) 20%, var(--bg-0));
        color: color-mix(in srgb, var(--ok) 84%, var(--fg));
        border-color: color-mix(in srgb, var(--ok) 50%, var(--surface-border));
      }
      .term-badge.err {
        background: color-mix(in srgb, var(--err) 20%, var(--bg-0));
        color: color-mix(in srgb, var(--err) 84%, var(--fg));
        border-color: color-mix(in srgb, var(--err) 55%, var(--surface-border));
      }
      .term-cmd-text,
      .term-result-text {
        margin: 0;
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: 11.5px;
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        white-space: pre-wrap;
        word-break: break-word;
      }
      .term-exit-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 18px;
        padding: 0 7px;
        border-radius: 999px;
        font-size: 9px;
        letter-spacing: .04em;
        border: 1px solid color-mix(in srgb, var(--surface-border) 82%, transparent);
        color: color-mix(in srgb, var(--fg) 72%, var(--muted));
        background: color-mix(in srgb, var(--bg-1) 65%, var(--bg-0));
      }
      .term-summary {
        border-top: 1px solid var(--surface-border);
        margin-top: 4px;
        padding-top: 6px;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
      }
      .change {
        border: 1px solid var(--surface-border);
        border-radius: 14px;
        overflow: hidden;
        background: var(--surface);
        width: 100%;
        max-width: 100%;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.33);
      }
      .change .m-body {
        width: 100%;
        max-width: 100%;
      }
      .change .m-time {
        display: none;
      }
      .diff-disclosure {
        margin: 0;
        border: 1px solid var(--surface-border);
        border-radius: 14px;
        overflow: hidden;
        background: var(--surface);
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
        margin-right: 16px;
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
        gap: 16px;
        padding: 20px 22px;
        border-bottom: 1px solid var(--surface-border);
        cursor: pointer;
        user-select: none;
        background: color-mix(in srgb, var(--surface) 76%, var(--bg-0));
      }
      .diff-summary-title {
        font-size: clamp(13px, 1.6vw, 16px);
        font-weight: 600;
        color: color-mix(in srgb, var(--fg) 86%, var(--muted));
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
        border-radius: 0 0 14px 14px;
      }
      .diff-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 20px 22px;
        background: color-mix(in srgb, var(--surface) 68%, var(--bg-0));
        border-bottom: 1px solid var(--surface-border);
        min-width: 0;
      }
      .diff-title {
        color: color-mix(in srgb, var(--fg) 78%, var(--muted));
        font-size: clamp(12px, 1.45vw, 15px);
        min-width: 0;
        flex: 1 1 auto;
      }
      .diff-path {
        color: color-mix(in srgb, var(--fg) 90%, var(--muted));
        font-weight: 600;
        display: block;
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
        white-space: normal;
        line-height: 1.45;
      }
      .diff-stats {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: clamp(12px, 1.25vw, 14px);
        white-space: nowrap;
      }
      .diff-stats .add {
        color: var(--diff-add-fg);
      }
      .diff-stats .del {
        color: var(--diff-del-fg);
      }
      .diff-body {
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        font-size: clamp(13px, 1.4vw, 16px);
        line-height: 1.6;
        width: 100%;
        max-width: 100%;
        min-height: 320px;
        max-height: clamp(640px, 82vh, 1400px);
        padding: 8px 0 12px;
        overflow: auto;
        overscroll-behavior: contain;
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
        padding-left: 14px;
      }
      .diff-row {
        display: grid;
        grid-template-columns: minmax(50px, 68px) minmax(50px, 68px) 22px minmax(0, 1fr);
        width: 100%;
        min-width: 0;
        transition: background .18s ease;
        padding: 4px 0;
      }
      .diff-row .ln {
        color: var(--line-fg);
        text-align: right;
        padding: 2px 10px 2px 0;
        border-right: 1px solid color-mix(in srgb, var(--surface-border) 70%, transparent);
        background: var(--gutter-bg);
        font-variant-numeric: tabular-nums;
      }
      .diff-row .sig {
        text-align: center;
        background: var(--vscode-editor-background, var(--bg-0));
      }
      .diff-row .txt {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        padding: 4px 14px;
        min-width: 0;
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
        font-size: 22px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--surface-border);
      }
      @media (max-width: 760px) {
        .diff-summary,
        .diff-head {
          padding: 14px 16px;
          gap: 12px;
        }
        .diff-row {
          grid-template-columns: minmax(38px, 52px) minmax(38px, 52px) 16px minmax(0, 1fr);
        }
        .diff-row .ln {
          padding-right: 8px;
        }
        .diff-row .txt {
          padding: 4px 10px;
        }
        .diff-body {
          min-height: 240px;
          max-height: clamp(480px, 78vh, 1100px);
        }
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
      .mention-status {
        padding: 10px 12px;
        font-size: 12px;
        color: var(--muted);
      }
      .mention-empty {
        color: color-mix(in srgb, var(--fg) 72%, var(--muted) 28%);
      }
      .mention-item:last-child { border-bottom: none; }
      .mention-item.active { background: #111a27; }
      .mention-path {
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        direction: rtl;
        text-align: left;
        unicode-bidi: plaintext;
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
      .composer-right {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
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
        content: none;
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
        max-width: min(760px, 100%);
        width: fit-content;
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
        overflow: visible;
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
        padding: 8px 10px;
        position: sticky;
        bottom: 4px;
        z-index: 30;
        margin: 0 12px 6px;
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
        border: 1px solid color-mix(in srgb, var(--border) 90%, transparent);
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
        min-height: 44px;
        max-height: min(210px, calc(100vh - 260px));
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
        max-height: min(210px, calc(100vh - 220px));
        overflow-y: auto;
      }
      .input-actions {
        gap: 10px;
      }
      .input-actions.minimal {
        flex-wrap: nowrap;
        align-items: center;
        width: 100%;
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
      .queue-pill {
        display: none;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--accent) 58%, var(--border));
        background: color-mix(in srgb, var(--accent) 22%, var(--bg-1));
        color: color-mix(in srgb, var(--fg) 92%, var(--accent));
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .01em;
      }
      .queue-pill.show {
        display: inline-flex;
      }
      .queue-panel {
        margin-top: 6px;
        border: 1px solid var(--surface-border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface) 86%, var(--bg-0));
        overflow: hidden;
      }
      .queue-panel.hidden {
        display: none;
      }
      .queue-summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        padding: 7px 10px;
        font-size: 11px;
        font-weight: 600;
        color: color-mix(in srgb, var(--fg) 82%, var(--muted));
        border-bottom: 1px solid color-mix(in srgb, var(--surface-border) 74%, transparent);
      }
      .queue-summary::-webkit-details-marker {
        display: none;
      }
      .queue-list {
        max-height: 170px;
        overflow: auto;
        padding: 6px 8px 8px;
        display: grid;
        gap: 6px;
      }
      .queue-item {
        border: 1px solid color-mix(in srgb, var(--surface-border) 72%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--bg-1) 72%, var(--bg-0));
        padding: 6px 8px;
        display: grid;
        gap: 6px;
      }
      .queue-text {
        font-size: 11px;
        color: color-mix(in srgb, var(--fg) 88%, var(--muted));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .queue-actions {
        display: flex;
        gap: 6px;
      }
      .queue-btn {
        border: 1px solid var(--input-border);
        background: var(--bg-1);
        color: var(--muted);
        border-radius: 8px;
        padding: 2px 6px;
        font-size: 10px;
      }
      .queue-btn:disabled {
        opacity: .45;
        cursor: not-allowed;
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
      .action-menu.page-mode {
        position: static;
        inset: auto;
        z-index: auto;
        display: block;
        padding: 0;
        align-items: stretch !important;
        justify-content: flex-start;
      }
      .action-menu.page-mode .action-menu-backdrop {
        display: none !important;
      }
      .action-menu.page-mode .action-menu-sheet {
        width: 100%;
        max-width: 100%;
        max-height: none;
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
      /* Minimal refresh */
      .global-top {
        padding: 10px 14px 8px;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
        background: color-mix(in srgb, var(--bg-1) 94%, transparent);
      }
      .brand-sub {
        display: none;
      }
      .global-actions {
        gap: 6px;
      }
      .menu-icon,
      .quick-new {
        height: 30px;
        min-width: 30px;
        border-radius: 10px;
        font-weight: 600;
        border-color: color-mix(in srgb, var(--input-border) 90%, transparent);
        background: color-mix(in srgb, var(--input-bg) 96%, var(--bg-0));
      }
      #historyHeader,
      #undoHeader {
        min-width: 58px;
        width: auto;
        padding: 0 10px;
      }
      .chat-shell {
        gap: 6px;
      }
      .messages {
        gap: 14px;
        padding: 14px 0 16px;
      }
      .m-body {
        line-height: 1.55;
      }
      .u {
        border-radius: 14px;
      }
      .threads-overlay-open #stageThreads {
        right: 12px;
        width: min(480px, calc(100vw - 24px));
        max-height: calc(100vh - 96px);
        top: 76px;
        border-radius: 12px;
        border-color: color-mix(in srgb, var(--border) 78%, transparent);
        background: color-mix(in srgb, var(--surface) 98%, var(--bg-0));
        box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
      }
      .threads-overlay-open #stageThreads .thread-list {
        max-height: 42vh;
        overflow: auto;
      }
      .threads-overlay-backdrop {
        background: color-mix(in srgb, var(--bg-0) 72%, transparent);
        backdrop-filter: blur(2px);
      }
      .threads-popup-close {
        margin-left: 6px;
      }
      .dock-shell {
        border-radius: 14px;
        padding: 8px 10px;
        margin: 0 14px 14px;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
      }
      .composer-shell {
        border-radius: 12px;
        background: color-mix(in srgb, var(--surface) 97%, var(--bg-0));
      }
      .action-menu-sheet {
        border-radius: 12px;
      }
      @media (max-width: 760px) {
        .threads-overlay-open #stageThreads {
          top: 62px;
          right: 8px;
          left: 8px;
          width: auto;
          max-height: calc(100vh - 80px);
          border-radius: 10px;
          padding: 10px;
        }
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
      @media (max-width: 480px) {
        .threads-overlay-open #stageThreads {
          top: 56px;
          right: 4px;
          left: 4px;
          max-height: calc(100vh - 64px);
          border-radius: 9px;
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
      .global-top {
        padding: 7px 10px 5px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-0);
        position: sticky;
        top: 0;
        z-index: 40;
        min-width: 0;
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .brand-block {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .brand-kicker {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: .02em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--fg) 92%, white 8%);
        white-space: nowrap;
      }
      .brand-kicker::after {
        content: "";
      }
      .brand-sub { display: none; }
      .global-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        min-width: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .menu-icon {
        min-width: 30px;
        width: 30px;
        height: 30px;
        padding: 0;
        background: transparent;
        border: 1px solid var(--border);
        color: var(--muted);
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
      }
      .menu-icon:hover {
        border-color: color-mix(in srgb, var(--border) 40%, #fff 60%);
        color: #fff;
      }
      #newThreadQuick,
      #historyHeader,
      #actionMenuBtn {
        width: 28px;
        min-width: 28px;
        padding: 0;
      }
      .menu-icon.quick-new {
        background: var(--accent);
        border-color: transparent;
        color: #fff;
      }
      .menu-icon.quick-new:hover {
        background: color-mix(in srgb, var(--accent) 85%, #fff 15%);
      }
      .chat-shell {
        gap: 0;
        min-width: 0;
        max-width: 100%;
        width: 100%;
      }
      .stage-shell .panel {
        padding: 8px 12px 0;
        min-width: 0;
        max-width: 100%;
        overflow-x: hidden;
      }
      .chat-panel {
        display: none;
        flex-direction: column;
        min-height: 0;
        max-width: 100%;
        overflow-x: hidden;
      }
      .chat-panel.active {
        display: flex;
      }
      #stageThreads.panel.active {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #stageThreads .thread-list {
        display: none !important;
      }
      #stageThreads .tasks-head {
        display: flex !important;
        align-items: center;
        justify-content: space-between;
        margin: 2px 0 0;
      }
      #stageThreads .tasks-label {
        color: color-mix(in srgb, var(--fg) 90%, var(--muted) 10%);
        font-size: 14px;
        font-weight: 700;
        margin: 0;
        letter-spacing: .01em;
      }
      #taskList {
        display: flex !important;
        flex-direction: column;
        gap: 3px;
        min-height: 0;
      }
      .task-entry {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border: none;
        border-bottom: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
        border-radius: 0;
        background: transparent;
        padding: 8px 4px;
        text-align: left;
      }
      .task-entry:hover {
        background: color-mix(in srgb, var(--surface) 62%, transparent);
        transform: none;
      }
      .task-main {
        min-width: 0;
      }
      .task-title {
        margin: 0;
        font-size: 15px;
        color: color-mix(in srgb, var(--fg) 95%, white 5%);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .task-right {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
      }
      .task-age {
        font-size: 12px;
        color: var(--muted);
      }
      .task-dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--border) 78%, var(--fg) 22%);
        background: transparent;
      }
      .task-meta {
        padding: 8px 4px;
        font-size: 12px;
        color: var(--muted);
      }
      #viewAllTasks {
        display: inline-flex !important;
        margin-top: 4px;
        border: none;
        background: transparent;
        color: var(--muted);
        font-size: 13px;
        padding: 2px 0 0;
        text-align: left;
      }
      #viewAllTasks:hover {
        color: color-mix(in srgb, var(--fg) 88%, white 12%);
        transform: none;
      }
      .history-shell {
        display: grid;
        gap: 10px;
        padding-top: 2px;
      }
      .history-toolbar {
        display: grid;
        gap: 8px;
      }
      .history-search {
        width: 100%;
        border-radius: 10px;
        border: 1px solid var(--input-border);
        background: color-mix(in srgb, var(--input-bg) 96%, var(--bg-0));
        color: var(--input-fg);
        padding: 8px 10px;
      }
      .history-filters {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .history-filter {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .history-count {
        margin-left: auto;
        font-size: 12px;
        color: var(--muted);
      }
      .history-list {
        display: grid;
        gap: 4px;
        max-height: calc(100vh - 320px);
        overflow: auto;
        padding-right: 2px;
      }
      .history-row {
        width: 100%;
        border: 1px solid transparent;
        border-radius: 10px;
        background: transparent;
        padding: 8px 9px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        text-align: left;
      }
      .history-row:hover {
        border-color: var(--input-border);
        background: color-mix(in srgb, var(--surface) 74%, var(--bg-0));
        transform: none;
      }
      .history-row.active {
        border-color: var(--vscode-focusBorder, var(--accent));
        background: color-mix(in srgb, var(--accent) 18%, var(--surface));
      }
      .history-row-main {
        min-width: 0;
      }
      .history-row-title {
        font-size: 14px;
        color: color-mix(in srgb, var(--fg) 94%, white 6%);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .history-row-right {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        font-size: 12px;
        color: var(--muted);
      }
      .history-row-mode {
        text-transform: capitalize;
      }
      .history-row-age {
        min-width: 30px;
        text-align: right;
      }
      .history-empty,
      .history-status {
        color: var(--muted);
        font-size: 12px;
        padding: 8px 4px;
      }
      .messages {
        flex: 1;
        padding: 8px 0 14px;
        gap: 12px;
        min-width: 0;
        max-width: 100%;
        overflow-x: hidden;
        margin: 0;
        align-items: flex-start;
      }
      .messages:empty::before {
        content: "Ask Playground 1 - @ files - / commands";
        display: block;
        padding: 28px 8px 0;
        text-align: center;
        color: var(--muted);
        font-size: 12px;
      }
      .m {
        display: grid;
        gap: 4px;
        min-width: 0;
        width: auto;
        max-width: min(92%, 760px);
      }
      .m-body {
        min-width: 0;
        max-width: 100%;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .m.change .m-body {
        width: 100%;
        max-width: 100%;
      }
      .m.a::before {
        content: "AI";
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--muted) 78%, var(--fg) 22%);
      }
      .m.u::before {
        content: "You";
        font-size: 10px;
        letter-spacing: .12em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--muted) 78%, var(--fg) 22%);
        text-align: right;
      }
      .m.a {
        justify-self: start;
        align-self: flex-start;
        margin-right: auto;
        margin-left: 0;
      }
      .m.a .m-body {
        text-align: left;
      }
      .m.u {
        justify-self: end;
        align-self: flex-end;
        margin-left: auto;
        max-width: min(86%, 560px);
      }
      .threads-overlay-open #stageThreads {
        top: 64px;
        width: min(420px, calc(100vw - 24px));
      }
      .dock-shell {
        margin: 0 auto 10px;
        border-radius: 16px;
        padding: 6px;
        background: color-mix(in srgb, var(--surface) 88%, var(--bg-0));
        border-color: color-mix(in srgb, var(--border) 70%, var(--accent) 30%);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
        min-width: 0;
        width: min(100%, 500px);
        max-width: calc(100% - 14px);
        align-self: center;
        box-sizing: border-box;
      }
      .dock-shell::before {
        content: "";
        display: none;
        height: 1px;
        margin: -4px 0 8px;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--border) 70%, transparent), transparent);
      }
      .composer-shell {
        border-radius: 14px;
        background: transparent;
        width: 100%;
        min-width: 0;
        border: none;
        box-shadow: none;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        overflow: hidden;
      }
      .composer-shell > * {
        min-width: 0;
      }
      .dock-shell .input,
      .composer-form {
        width: 100%;
        min-width: 0;
      }
      textarea {
        flex: 1 1 0;
        width: auto;
        max-width: 100%;
        min-height: 62px;
        max-height: 62px;
        resize: none;
        padding: 10px 10px;
      }
      .input-actions.minimal {
        flex: 0 0 auto;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
      }
      .input-actions.minimal .spacer {
        display: none;
      }
      .context-telemetry {
        flex: 0 0 auto;
        min-width: 0;
        max-width: 96px;
        padding: 0;
        min-height: 0;
        flex-wrap: nowrap;
        overflow: hidden;
      }
      .context-telemetry-text {
        display: none;
      }
      .context-auto-badge {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 1px 6px;
        font-size: 9px;
      }
      .dock-shell:focus-within,
      .composer-shell:focus-within,
      textarea:focus,
      textarea:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        border-color: inherit !important;
      }
      .dock-shell .input,
      .dock-shell .composer-form,
      .dock-shell .composer-shell,
      .dock-shell textarea {
        border-top: none !important;
        border-bottom: none !important;
        box-shadow: none !important;
        background-image: none !important;
      }
      @media (max-width: 640px) {
        .dock-shell {
          margin: 0 auto 8px;
          width: min(100%, 500px);
          max-width: calc(100% - 8px);
          align-self: stretch;
        }
        .context-telemetry {
          flex: 0 0 auto;
          max-width: none;
        }
        .context-telemetry-text {
          display: none;
        }
      }
      .context-auto-badge {
        display: inline-flex;
        align-items: center;
        border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 10px;
        letter-spacing: .08em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .context-auto-badge.collecting {
        border-color: color-mix(in srgb, var(--accent) 65%, var(--border) 35%);
        color: color-mix(in srgb, var(--accent) 82%, #fff 18%);
      }
      .context-auto-badge.ready {
        border-color: color-mix(in srgb, var(--accent) 65%, var(--border) 35%);
        color: color-mix(in srgb, var(--accent) 82%, #fff 18%);
      }
      .context-auto-badge.idle {
        opacity: .85;
      }
      .context-telemetry-text {
        color: color-mix(in srgb, var(--fg) 86%, var(--muted) 14%);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1 1 auto;
        min-width: 0;
      }
      .context-telemetry-meta {
        color: var(--muted);
        white-space: nowrap;
        font-family: var(--vscode-editor-font-family, Consolas, "Courier New", monospace);
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        display: none;
      }
      @media (max-width: 460px) {
        .context-telemetry-meta {
          flex-basis: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
        }
      }
      html,
      body,
      #app,
      .app {
        width: 100%;
        max-width: 100%;
      }
      #app,
      .app,
      .chat-shell,
      .stage-shell,
      .chat-panel,
      .messages {
        overflow-x: hidden;
      }
      .composer-meta,
      .queue-panel,
      .queue-pill,
      .chips {
        display: none !important;
      }
      /* Playground AI composer redesign */
      .chat-panel.active #chatDock.dock-shell {
        width: calc(100% - 10px) !important;
        max-width: calc(100% - 10px) !important;
        margin: 0 5px 6px !important;
        align-self: stretch !important;
        box-sizing: border-box !important;
        border-radius: 18px !important;
        border: 1px solid color-mix(in srgb, var(--border) 74%, var(--accent) 26%) !important;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--surface) 94%, var(--accent) 6%) 0%,
          color-mix(in srgb, var(--surface) 98%, var(--bg-0) 2%) 100%
        ) !important;
        padding: 8px 10px !important;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.26) !important;
      }
      .chat-panel.active #chatDock .input {
        padding: 0 !important;
      }
      .chat-panel.active #chatDock .input,
      .chat-panel.active #chatDock .composer-form,
      .chat-panel.active #chatDock .composer-shell {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }
      .chat-panel.active #chatDock .composer-shell {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 8px !important;
        overflow: visible !important;
        position: relative !important;
      }
      .chat-panel.active #chatDock textarea {
        min-height: 72px !important;
        max-height: 120px !important;
        border-radius: 14px !important;
        border: 1px solid color-mix(in srgb, var(--border) 78%, transparent) !important;
        background: color-mix(in srgb, var(--bg-0) 86%, var(--surface) 14%) !important;
        padding: 11px 12px !important;
        box-sizing: border-box !important;
      }
      .chat-panel.active #chatDock .input-actions.minimal {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        width: 100% !important;
        min-width: 0 !important;
        flex-wrap: nowrap !important;
      }
      .chat-panel.active #chatDock .input-actions.minimal .spacer {
        display: block !important;
        flex: 1 1 auto !important;
        min-width: 4px !important;
      }
      .chat-panel.active #chatDock .attach-btn,
      .chat-panel.active #chatDock .send-round {
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
        border-radius: 999px !important;
      }
      .chat-panel.active #chatDock .context-pill {
        max-width: 118px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      .chat-panel.active #chatDock #contextTelemetry {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        min-width: 0 !important;
      }
      .chat-panel.active #chatDock #contextTelemetryText {
        display: block !important;
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 11px !important;
        opacity: .9 !important;
      }
      .chat-panel.active #chatDock #mentionMenu.mention-menu {
        position: absolute !important;
        left: 8px !important;
        right: 8px !important;
        bottom: calc(100% + 6px) !important;
        max-height: min(250px, 42vh) !important;
        overflow: auto !important;
        z-index: 9999 !important;
        border: 1px solid color-mix(in srgb, var(--border) 78%, var(--accent) 22%) !important;
        border-radius: 12px !important;
        background: color-mix(in srgb, var(--bg-0) 92%, var(--surface) 8%) !important;
        box-shadow: 0 16px 28px rgba(0, 0, 0, 0.42) !important;
      }
      @media (max-width: 640px) {
        .chat-panel.active #chatDock.dock-shell {
          width: calc(100% - 6px) !important;
          max-width: calc(100% - 6px) !important;
          margin: 0 3px 6px !important;
          padding: 7px 8px !important;
        }
        .chat-panel.active #chatDock #mentionMenu.mention-menu {
          left: 6px !important;
          right: 6px !important;
          max-height: min(220px, 38vh) !important;
        }
        .chat-panel.active #chatDock textarea {
          min-height: 66px !important;
          max-height: 104px !important;
        }
        .chat-panel.active #chatDock .context-pill {
          max-width: 86px !important;
        }
        .chat-panel.active #chatDock #contextTelemetryText {
          display: none !important;
        }
      }
      @media (max-height: 480px) {
        .chat-panel.active #chatDock.dock-shell {
          margin-bottom: 2px !important;
          padding: 6px 8px !important;
        }
        .dock-shell textarea {
          min-height: 38px !important;
        }
      }
      /* Full-width responsive chat layout (final override) */
      .app,
      .chat-shell,
      .stage-shell,
      .chat-panel.active {
        width: 100% !important;
        max-width: 100% !important;
      }
      .chat-panel.active {
        padding: 0 2px 8px !important;
      }
      .chat-panel.active #msgs.messages {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 12px 4px 16px !important;
        gap: 14px !important;
      }
      .chat-panel.active .m {
        width: 100% !important;
        max-width: 100% !important;
      }
      .chat-panel.active .m.a {
        margin-right: auto !important;
      }
      .chat-panel.active .m.a .m-body {
        max-width: calc(100% - 22px) !important;
      }
      .chat-panel.active .m.u {
        max-width: 92% !important;
      }
      .chat-panel.active .jump-wrap {
        right: 8px !important;
      }
      @media (max-width: 640px) {
        .chat-panel.active {
          padding: 0 1px 6px !important;
        }
        .chat-panel.active #msgs.messages {
          padding: 10px 2px 12px !important;
          gap: 12px !important;
        }
        .chat-panel.active .m.u {
          max-width: 96% !important;
        }
      }
      /* Replica redesign overrides */
      :root {
        --rep-bg: color-mix(in srgb, var(--vscode-sideBar-background, #000) 88%, #000 12%);
        --rep-surface: color-mix(in srgb, var(--rep-bg) 88%, var(--vscode-editor-foreground, #fff) 12%);
        --rep-surface-2: color-mix(in srgb, var(--rep-bg) 82%, var(--vscode-editor-foreground, #fff) 18%);
        --rep-border: color-mix(in srgb, var(--vscode-editor-foreground, #fff) 17%, transparent);
        --rep-fg: var(--vscode-editor-foreground, #ededed);
        --rep-muted: color-mix(in srgb, var(--rep-fg) 62%, transparent);
      }
      body {
        background: var(--rep-bg) !important;
        color: var(--rep-fg) !important;
      }
      .toolbar {
        display: none !important;
      }
      .tabs {
        display: none !important;
      }
      .global-top {
        display: flex !important;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--rep-border);
        background: var(--rep-bg);
      }
      .brand-block {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .brand-kicker {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--rep-fg);
      }
      .toolbar-sub {
        font-size: 11px;
        color: var(--rep-muted);
      }
      .global-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .menu-icon {
        width: 28px;
        height: 28px;
        border-radius: 8px !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        padding: 0 !important;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px !important;
        line-height: 1;
      }
      .mode-banner {
        border-bottom: 1px solid var(--rep-border);
        background: transparent;
        color: var(--rep-muted);
        padding: 6px 12px;
        font-size: 11px;
      }
      .chat-shell {
        display: flex !important;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        background: var(--rep-bg);
      }
      .stage-shell {
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      .stage-shell .panel {
        display: none;
        height: 100%;
        overflow: auto;
      }
      .stage-shell .panel.active {
        display: block;
      }
      #chat.chat-panel.active {
        display: flex;
        flex-direction: column;
        min-height: 0;
        gap: 8px;
        padding: 8px 12px 0 !important;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        border: 1px solid var(--rep-border);
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 10px;
        color: var(--rep-muted);
        background: transparent;
      }
      .chat-empty {
        margin: auto 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding: 10px 0 18px;
      }
      .chat-empty-hero-icon {
        width: 48px;
        height: 48px;
        border: 1px solid var(--rep-border);
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        color: var(--rep-muted);
      }
      .chat-empty-title {
        margin: 0;
        font-size: 15px;
        font-weight: 500;
      }
      .chat-empty-title strong {
        font-weight: 700;
      }
      .chat-empty-sub {
        margin: 0;
        max-width: 380px;
        font-size: 12px;
        color: var(--rep-muted);
        line-height: 1.5;
      }
      .chat-empty-history-head {
        margin: 10px 0 0;
        width: min(420px, 100%);
        text-align: left;
        font-size: 11px;
        color: var(--rep-muted);
      }
      .chat-empty-history-list {
        width: min(420px, 100%);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .chat-empty-history-row {
        width: 100%;
        border: 1px solid var(--rep-border);
        border-radius: 10px;
        background: transparent;
        color: var(--rep-fg);
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .chat-empty-history-row-title {
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .chat-empty-history-row-age {
        font-size: 11px;
        color: var(--rep-muted);
        white-space: nowrap;
      }
      .chat-empty-history-empty {
        text-align: left;
        font-size: 11px;
        color: var(--rep-muted);
      }
      .chat-empty-actions {
        margin-top: 6px;
        display: flex;
        gap: 6px;
      }
      .chat-empty-action {
        border-radius: 8px !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        padding: 6px 10px !important;
        font-size: 11px !important;
      }
      #msgs.messages {
        flex: 1;
        min-height: 0;
        margin: 0 !important;
        padding: 0 0 12px !important;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .m {
        border: 1px solid var(--rep-border);
        border-radius: 12px;
        background: var(--rep-surface);
      }
      .m .m-body {
        padding: 11px 12px;
        white-space: pre-wrap;
        font-size: 12px;
        line-height: 1.5;
      }
      .m .m-time {
        padding: 0 12px 8px;
        color: var(--rep-muted);
        font-size: 10px;
      }
      .m.assistant-response {
        border: 0;
        background: transparent;
      }
      .m.assistant-response .m-body {
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
      }
      .m.assistant-response .m-time {
        padding: 0 2px 2px;
      }
      .m.u {
        margin-left: auto;
        max-width: 90%;
        background: var(--rep-surface-2);
      }
      .m.u.queued {
        opacity: 0.88;
      }
      .m.u.queued .m-body {
        border-style: dashed;
      }
      .m.e {
        border-color: var(--err);
      }
      .jump-wrap {
        right: 14px !important;
        bottom: 132px !important;
      }
      .dock-shell {
        border-top: 0 !important;
        background: transparent !important;
        padding: 0 12px 10px !important;
        margin: 0 !important;
      }
      .composer-shell {
        border: 1px solid var(--rep-border) !important;
        border-radius: 16px !important;
        background: var(--rep-bg) !important;
        padding: 0 !important;
        overflow: hidden;
      }
      .composer-shell textarea {
        border: 0 !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        min-height: 58px !important;
        max-height: 180px !important;
        padding: 14px 14px 8px !important;
        font-size: 13px !important;
      }
      .composer-shell textarea::placeholder {
        color: var(--rep-muted) !important;
      }
      .input-actions.minimal {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-top: 1px solid var(--rep-border);
      }
      .composer-inline-select {
        max-width: 138px;
        border: 1px solid var(--rep-border) !important;
        border-radius: 8px !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        font-size: 11px !important;
        padding: 4px 8px !important;
      }
      .attach-btn {
        width: 28px;
        height: 28px;
        border-radius: 8px !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        padding: 0 !important;
      }
      .context-toggle-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .context-toggle-pill input {
        display: none;
      }
      .context-pill,
      .context-auto-badge {
        color: var(--rep-muted) !important;
        font-size: 11px !important;
      }
      .send-round {
        width: 30px;
        height: 30px;
        border-radius: 50% !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
        padding: 0 !important;
        font-size: 14px !important;
      }
      .queue-pill {
        font-size: 10px !important;
        color: var(--rep-muted) !important;
      }
      .context-telemetry,
      .composer-meta,
      .footer-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 10px 8px;
        color: var(--rep-muted);
        font-size: 10px;
        flex-wrap: wrap;
      }
      .composer-meta {
        padding-top: 0;
      }
      .footer-row {
        padding-top: 2px;
      }
      .mention-menu {
        border: 1px solid var(--rep-border) !important;
        border-radius: 10px !important;
        background: var(--rep-bg) !important;
      }
      .tasks-head,
      .history-toolbar {
        padding: 10px 12px;
        border-bottom: 1px solid var(--rep-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .tasks-label {
        font-size: 11px;
        color: var(--rep-muted);
      }
      .task-list,
      .thread-list,
      .history-list {
        padding: 8px 12px;
      }
      .task-entry,
      .thread-row,
      .history-row {
        width: 100%;
        border: 1px solid var(--rep-border);
        border-radius: 10px;
        background: transparent;
        padding: 8px 10px;
        margin-bottom: 6px;
      }
      .task-title,
      .thread-title,
      .history-row-title {
        font-size: 12px;
        color: var(--rep-fg);
      }
      .task-meta,
      .thread-meta,
      .history-row-age,
      .history-row-mode,
      .history-empty,
      .history-status {
        font-size: 11px;
        color: var(--rep-muted);
      }
      .view-all {
        margin: 0 12px 10px;
        border: 1px solid var(--rep-border);
        border-radius: 10px;
        background: transparent;
        color: var(--rep-fg);
        padding: 8px 10px;
      }
      .history-shell {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .history-search {
        border-radius: 10px !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
      }
      .history-filters {
        display: flex;
        gap: 8px;
      }
      .history-filter,
      .history-count {
        font-size: 10px;
        color: var(--rep-muted);
      }
      .threads-overlay-backdrop {
        background: rgba(0, 0, 0, 0.56) !important;
      }
      .action-menu {
        position: fixed;
        inset: 0;
        z-index: 80;
      }
      .action-menu.hidden {
        display: none !important;
      }
      .action-menu-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.56);
      }
      .action-menu-sheet {
        position: absolute;
        right: 10px;
        top: 10px;
        bottom: 10px;
        width: min(430px, calc(100% - 20px));
        border: 1px solid var(--rep-border);
        border-radius: 14px;
        background: var(--rep-bg);
        overflow: auto;
        padding: 10px;
      }
      .action-menu.page-mode {
        position: static;
      }
      .action-menu.page-mode .action-menu-backdrop {
        display: none;
      }
      .action-menu.page-mode .action-menu-sheet {
        position: static;
        width: 100%;
        height: 100%;
        max-height: none;
        border: 0;
        border-radius: 0;
      }
      .sheet-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 10px;
      }
      .sheet-title {
        font-size: 12px;
        font-weight: 700;
      }
      .sheet-sub {
        font-size: 11px;
        color: var(--rep-muted);
      }
      .sheet-grid {
        display: grid;
        gap: 8px;
      }
      .sheet-card {
        border: 1px solid var(--rep-border);
        border-radius: 10px;
        background: transparent;
        padding: 8px;
      }
      .sheet-card-title {
        font-size: 11px;
        color: var(--rep-muted);
        margin-bottom: 6px;
      }
      .sheet-row {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .sheet-toggle .tool-toggle {
        width: 100%;
        display: flex;
        justify-content: space-between;
      }
      .composer-select,
      .api-key-input,
      .action-item,
      .api-key-save,
      .sheet-close {
        border-radius: 8px !important;
        border: 1px solid var(--rep-border) !important;
        background: transparent !important;
        color: var(--rep-fg) !important;
      }
      .api-key-row {
        display: flex;
        gap: 6px;
      }
      .attach-hint,
      .api-key-hint,
      .tool-muted {
        color: var(--rep-muted);
        font-size: 11px;
      }
      @media (max-width: 700px) {
        .global-top {
          padding: 10px;
        }
        .chat-empty-history-list {
          width: 100%;
        }
        .dock-shell {
          padding: 0 10px 10px !important;
        }
        .menu-icon {
          width: 26px;
          height: 26px;
        }
      }
      /* Clean minimal polish */
      .global-top {
        padding: 9px 12px !important;
        /* See-through header */
        background: color-mix(in srgb, var(--rep-bg) 70%, transparent) !important;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        justify-content: flex-start !important;
      }
      .brand-block {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
      }
      .brand-name {
        font-size: 12px !important;
        font-weight: 700 !important;
        letter-spacing: 0.01em !important;
        color: var(--rep-fg) !important;
      }
      .brand-kicker {
        font-size: 11px !important;
        letter-spacing: 0.18em !important;
        color: var(--rep-fg) !important;
        opacity: 0.9;
      }
      .toolbar-sub {
        display: none !important;
      }
      .global-actions {
        gap: 4px !important;
        margin-left: auto !important;
      }
      .menu-icon {
        border: 0 !important;
        background: transparent !important;
        color: var(--rep-muted) !important;
      }
      .menu-icon:hover {
        color: var(--rep-fg) !important;
      }
      #undoHeader,
      #backToChatQuick {
        border: 1px solid var(--rep-border) !important;
        border-radius: 8px !important;
        width: auto !important;
        padding: 0 8px !important;
      }
      #backToChatQuick.header-left {
        margin-right: 2px !important;
        flex: 0 0 auto !important;
      }
      #chat.chat-panel.active {
        padding: 6px 12px 0 !important;
      }
      .chat-empty {
        gap: 8px !important;
        padding: 12px 0 !important;
      }
      .chat-empty-hero-icon {
        width: 42px !important;
        height: 42px !important;
      }
      .chat-empty-title {
        font-size: 14px !important;
      }
      .chat-empty-sub {
        font-size: 11px !important;
        max-width: 340px !important;
      }
      .chat-empty-actions {
        display: none !important;
      }
      .chat-empty {
        margin: 0 !important;
        align-items: stretch !important;
        text-align: left !important;
        justify-content: flex-start !important;
      }
      .chat-home-recent,
      .chat-home-hero {
        width: min(520px, 100%) !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .chat-home-recent {
        margin-top: 6px !important;
      }
      .chat-home-hero {
        margin-top: 26px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        gap: 8px !important;
        opacity: 0.95;
      }
      .chat-empty-history-head {
        margin: 0 0 6px !important;
        width: 100% !important;
      }
      .chat-empty-history-list {
        width: 100% !important;
        gap: 2px !important;
      }
      .chat-empty-history-row {
        border: 0 !important;
        background: transparent !important;
        border-radius: 10px !important;
        padding: 6px 6px 6px 18px !important;
        position: relative !important;
      }
      .chat-empty-history-row::before {
        content: "" !important;
        position: absolute !important;
        left: 6px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: 4px !important;
        height: 4px !important;
        border-radius: 999px !important;
        background: var(--rep-muted) !important;
        opacity: 0.9 !important;
      }
      .chat-empty-history-row:hover {
        background: color-mix(in srgb, var(--rep-border) 14%, transparent) !important;
      }
      .chat-empty-history-row-title {
        font-size: 12px !important;
      }
      .chat-empty-history-row-age {
        font-size: 10px !important;
        opacity: 0.85;
      }
      .chat-empty-history-empty {
        padding-left: 18px !important;
      }
      .dock-shell {
        padding: 0 12px 12px !important;
      }
      .composer-shell {
        border-radius: 14px !important;
        border-color: color-mix(in srgb, var(--rep-border) 82%, transparent) !important;
      }
      .composer-shell textarea {
        min-height: 50px !important;
        padding: 12px 14px 8px !important;
        font-size: 12px !important;
      }
      .input-actions.minimal {
        padding: 7px 10px !important;
        gap: 6px !important;
      }
      .composer-inline-select {
        border: 0 !important;
        background: transparent !important;
        color: var(--rep-muted) !important;
        max-width: 120px !important;
        padding: 2px 4px !important;
      }
      .composer-inline-select:hover,
      .composer-inline-select:focus {
        color: var(--rep-fg) !important;
      }
      .context-pill {
        color: #63b3ff !important;
      }
      #queuePill {
        display: none !important;
      }
      #queuePill.show {
        display: inline-flex !important;
        color: var(--rep-muted) !important;
        font-size: 10px !important;
      }
      #contextTelemetry,
      .composer-meta,
      .footer-row {
        display: none !important;
      }
      .queue-panel {
        margin: 0 8px 8px !important;
      }
      /* Composer hard-fix: prevent collapsed/vertical textarea */
      #chatDock .input,
      #chatDock .composer-form,
      #chatDock .composer-shell {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        display: flex !important;
        flex-direction: column !important;
      }
      #chatDock textarea#t {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        display: block !important;
        resize: none !important;
        writing-mode: horizontal-tb !important;
        text-orientation: mixed !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        line-height: 1.45 !important;
        border: 0 !important;
        outline: none !important;
        box-shadow: none !important;
        background: transparent !important;
      }
      #chatDock .input-actions.minimal {
        border-top: 0 !important;
      }
      #chatDock .composer-shell::before,
      #chatDock .composer-shell::after,
      #chatDock::before,
      #chatDock::after {
        content: none !important;
        display: none !important;
      }
      /* Remove outer dock "box" so we don't get a double-container look */
      #chatDock.dock-shell {
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }

      /* Override legacy "Playground AI composer redesign" rules that used higher specificity + !important */
      .chat-panel.active #chatDock.dock-shell {
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        /* Footer breathing room (like the screenshot dock). */
        padding: 0 12px 18px !important;
        margin: 0 !important;
        position: relative !important;
        overflow: visible !important;
        z-index: 120 !important;
      }
      .chat-panel.active #chatDock .composer-shell {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0 !important;
        /* Ensure the composer always has a visible border. */
        border: 1px solid rgba(255, 255, 255, 0.32) !important;
        border-radius: 18px !important;
        background: transparent !important;
        overflow: hidden !important;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.08) !important,
          0 12px 32px rgba(0, 0, 0, 0.35) !important;
        position: relative !important;
        overflow: visible !important;
      }
      .chat-panel.active #chatDock textarea#t {
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        padding: 12px 14px 10px !important;
        min-height: 56px !important;
        max-height: 160px !important;
      }
      .chat-panel.active #chatDock .input-actions.minimal {
        border-top: 1px solid rgba(255, 255, 255, 0.18) !important;
        background: transparent !important;
        padding: 8px 10px !important;
      }
      .chat-panel.active #chatDock .composer-shell:focus-within {
        border-color: rgba(255, 255, 255, 0.44) !important;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.18),
          0 12px 32px rgba(0, 0, 0, 0.4) !important;
      }
      /* Keep mention menu visible above chat bubbles. */
      .chat-panel.active #chatDock .input,
      .chat-panel.active #chatDock .composer-form,
      .chat-panel.active #chatDock .composer-shell {
        overflow: visible !important;
      }
      .chat-panel.active #chatDock #mentionMenu.mention-menu {
        position: absolute !important;
        left: 10px !important;
        right: 10px !important;
        bottom: calc(100% + 10px) !important;
        max-height: min(260px, 46vh) !important;
        overflow: auto !important;
        z-index: 99999 !important;
        border: 1px solid rgba(255, 255, 255, 0.35) !important;
        border-radius: 12px !important;
        background: rgba(18, 18, 18, 0.94) !important;
        box-shadow: 0 18px 32px rgba(0, 0, 0, 0.55) !important;
      }

      /* iOS-like chat bubbles (final override) */
      .chat-panel.active #msgs.messages {
        padding: 14px 12px 18px !important;
        gap: 8px !important;
      }
      .chat-panel.active #msgs.messages .m {
        width: auto !important;
        max-width: min(78%, 620px) !important;
        border: 0 !important;
        background: transparent !important;
        border-radius: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
      }
      .chat-panel.active #msgs.messages .m::before {
        content: none !important;
        display: none !important;
      }
      .chat-panel.active #msgs.messages .m .m-body {
        padding: 10px 12px !important;
        border-radius: 18px !important;
        border: 1px solid color-mix(in srgb, var(--rep-fg) 14%, transparent) !important;
        background: color-mix(in srgb, var(--rep-fg) 7%, var(--rep-bg) 93%) !important;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.22) !important;
      }
      .chat-panel.active #msgs.messages .m .m-time {
        padding: 0 6px !important;
        font-size: 10px !important;
        color: var(--rep-muted) !important;
        opacity: 0.9;
      }
      .chat-panel.active #msgs.messages .m.a {
        align-self: flex-start !important;
        margin: 0 auto 0 0 !important;
      }
      .chat-panel.active #msgs.messages .m.a .m-body {
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
      }
      .chat-panel.active #msgs.messages .m.a .m-time {
        text-align: left !important;
      }
      .chat-panel.active #msgs.messages .m.u {
        align-self: flex-end !important;
        margin: 0 0 0 auto !important;
      }
      .chat-panel.active #msgs.messages .m.u .m-body {
        background: color-mix(in srgb, var(--rep-fg) 11%, var(--rep-bg) 89%) !important;
        border-color: color-mix(in srgb, var(--rep-fg) 17%, transparent) !important;
        border-radius: 18px 18px 6px 18px !important;
      }
      .chat-panel.active #msgs.messages .m.u.queued .m-body {
        border-style: dashed !important;
        border-color: color-mix(in srgb, var(--rep-fg) 24%, transparent) !important;
        opacity: 0.92;
      }
      .chat-panel.active #msgs.messages .m.u .m-time {
        text-align: right !important;
      }
      .chat-panel.active #msgs.messages .m.e .m-body {
        border-color: var(--err) !important;
      }
      .chat-panel.active #msgs.messages .m.cmd .m-body {
        background: transparent !important;
        border: 1px dashed color-mix(in srgb, var(--rep-fg) 18%, transparent) !important;
        box-shadow: none !important;
        font-size: 11px !important;
        opacity: 0.95;
      }
      .chat-panel.active #msgs.messages .m.change,
      .chat-panel.active #msgs.messages .m.diagnostics {
        width: 100% !important;
        max-width: 100% !important;
      }
      .chat-panel.active #msgs.messages .m.change .m-body,
      .chat-panel.active #msgs.messages .m.diagnostics .m-body {
        border-radius: 12px !important;
      }
      @media (max-width: 700px) {
        .chat-panel.active #msgs.messages .m {
          max-width: 86% !important;
        }
      }

      /* Final composer safety override:
         keep a visible border and keep @ mention suggestions above the dock. */
      #chatDock.dock-shell {
        position: relative !important;
        z-index: 320 !important;
      }
      #chatDock .input,
      #chatDock .composer-form,
      #chatDock .composer-shell {
        overflow: visible !important;
      }
      #chatDock .composer-shell {
        position: relative !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        border-radius: 16px !important;
        background: transparent !important;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.07) !important,
          0 10px 30px rgba(0, 0, 0, 0.28) !important;
      }
      #chatDock .composer-shell:focus-within {
        border-color: rgba(255, 255, 255, 0.42) !important;
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.14) !important,
          0 12px 32px rgba(0, 0, 0, 0.34) !important;
      }
      #chatDock .input-actions.minimal {
        border-top: 1px solid rgba(255, 255, 255, 0.14) !important;
      }
      #chatDock .context-toggle-pill {
        gap: 0 !important;
      }
      #chatDock .context-toggle-pill .context-pill {
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        padding: 0 !important;
        color: var(--rep-muted) !important;
        font-size: 11px !important;
      }
      #chatDock .context-toggle-pill .context-pill::before {
        content: none !important;
        display: none !important;
      }
      #chatDock #mentionMenu.mention-menu {
        position: absolute !important;
        left: 10px !important;
        right: 10px !important;
        bottom: calc(100% + 10px) !important;
        max-height: min(260px, 46vh) !important;
        overflow: auto !important;
        z-index: 2147483000 !important;
        border: 1px solid rgba(255, 255, 255, 0.34) !important;
        border-radius: 12px !important;
        background: rgba(14, 14, 14, 0.96) !important;
        box-shadow: 0 18px 34px rgba(0, 0, 0, 0.52) !important;
      }
      #chatDock #queuePanel.queue-panel {
        position: absolute !important;
        left: 8px !important;
        right: 8px !important;
        bottom: calc(100% + 10px) !important;
        margin: 0 !important;
        border: 1px solid rgba(255, 255, 255, 0.26) !important;
        border-radius: 14px !important;
        background: rgba(14, 14, 14, 0.94) !important;
        backdrop-filter: blur(8px) saturate(120%) !important;
        box-shadow: 0 20px 42px rgba(0, 0, 0, 0.5) !important;
        overflow: hidden !important;
        z-index: 2147482000 !important;
      }
      #chatDock #queuePanel.queue-panel.hidden {
        display: none !important;
      }
      #chatDock #queuePanel.queue-panel .queue-summary {
        list-style: none !important;
        padding: 8px 10px !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.14) !important;
        color: color-mix(in srgb, var(--rep-fg) 80%, var(--rep-muted)) !important;
        font-size: 9px !important;
        font-weight: 700 !important;
        letter-spacing: 0.08em !important;
        text-transform: uppercase !important;
      }
      #chatDock #queuePanel.queue-panel:not([open]) .queue-summary {
        border-bottom: 0 !important;
      }
      #chatDock #queuePanel.queue-panel .queue-list {
        display: grid !important;
        gap: 0 !important;
        padding: 8px !important;
        max-height: min(36vh, 196px) !important;
        overflow: auto !important;
      }
      #chatDock #queuePanel.queue-panel .queue-item {
        position: relative !important;
        display: grid !important;
        gap: 6px !important;
        margin-top: -6px !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-radius: 11px !important;
        padding: 8px 9px !important;
        background: rgba(24, 24, 24, 0.92) !important;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.32) !important;
      }
      #chatDock #queuePanel.queue-panel .queue-item:first-child {
        margin-top: 0 !important;
      }
      #chatDock #queuePanel.queue-panel .queue-item[data-queue-idx="0"] {
        border-color: rgba(255, 255, 255, 0.34) !important;
        background: rgba(32, 32, 32, 0.95) !important;
      }
      #chatDock #queuePanel.queue-panel .queue-text {
        color: color-mix(in srgb, var(--rep-fg) 88%, var(--rep-muted)) !important;
        font-size: 11px !important;
      }
      #chatDock #queuePanel.queue-panel .queue-actions {
        justify-content: flex-end !important;
        gap: 6px !important;
      }
      #chatDock #queuePanel.queue-panel .queue-btn {
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        background: rgba(255, 255, 255, 0.02) !important;
        color: var(--rep-muted) !important;
        border-radius: 8px !important;
        padding: 2px 6px !important;
        font-size: 10px !important;
      }
      #chatDock #queuePanel.queue-panel .queue-btn:hover {
        color: var(--rep-fg) !important;
        border-color: rgba(255, 255, 255, 0.3) !important;
      }
      #chatDock #queuePanel.queue-panel .queue-btn:disabled {
        opacity: 0.45 !important;
      }

      /* Fix native select dropdown contrast (reasoning/model). */
      .composer-inline-select,
      .composer-select,
      .api-key-input {
        color-scheme: dark !important;
      }
      .composer-inline-select option,
      .composer-select option {
        background: var(--rep-bg) !important;
        color: var(--rep-fg) !important;
      }

      /* Final narrow-panel fit fixes */
      .global-top,
      .brand-block,
      .global-actions,
      #chat.chat-panel.active,
      #msgs.messages,
      #chatDock.dock-shell,
      #chatDock .input,
      #chatDock .composer-form,
      #chatDock .composer-shell,
      #chatDock .input-actions.minimal,
      #chatDock .input-actions.minimal > * {
        min-width: 0 !important;
      }

      #msgs.messages .m .m-body,
      #msgs.messages .m .m-time,
      .chat-empty-history-row-title,
      .chat-empty-history-row-age {
        overflow-wrap: anywhere;
      }

      @media (max-width: 430px) {
        .global-top {
          gap: 6px !important;
          padding: 7px 8px !important;
        }
        .brand-block {
          gap: 6px !important;
          max-width: calc(100% - 94px) !important;
        }
        .brand-name {
          font-size: 12px !important;
          max-width: 130px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        .brand-kicker {
          font-size: 11px !important;
          letter-spacing: 0.12em !important;
        }
        .global-actions {
          gap: 2px !important;
        }
        .menu-icon {
          width: 24px !important;
          height: 24px !important;
          min-width: 24px !important;
          font-size: 13px !important;
          border-radius: 7px !important;
        }
        #undoHeader,
        #backToChatQuick {
          padding: 0 6px !important;
          font-size: 11px !important;
        }

        #chat.chat-panel.active {
          padding: 4px 8px 0 !important;
        }
        #msgs.messages {
          gap: 6px !important;
          padding: 8px 0 10px !important;
        }
        #msgs.messages .m {
          max-width: 94% !important;
        }
        #msgs.messages .m .m-body {
          padding: 8px 10px !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
          border-radius: 14px !important;
        }
        #msgs.messages .m .m-time {
          font-size: 10px !important;
          padding: 0 4px !important;
        }

        #chatDock.dock-shell,
        .chat-panel.active #chatDock.dock-shell {
          padding: 0 8px 8px !important;
        }
        #chatDock .composer-shell,
        .chat-panel.active #chatDock .composer-shell {
          border-radius: 12px !important;
        }
        #chatDock textarea#t,
        .chat-panel.active #chatDock textarea#t {
          min-height: 44px !important;
          max-height: 120px !important;
          font-size: 12px !important;
          line-height: 1.35 !important;
          padding: 10px 10px 7px !important;
        }
        #chatDock .input-actions.minimal,
        .chat-panel.active #chatDock .input-actions.minimal {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 4px !important;
          row-gap: 5px !important;
          padding: 6px 8px !important;
          align-items: center !important;
          width: 100% !important;
        }
        #chatDock .input-actions.minimal .spacer,
        .chat-panel.active #chatDock .input-actions.minimal .spacer {
          display: none !important;
        }
        #chatDock .composer-inline-select {
          flex: 1 1 88px !important;
          max-width: 100px !important;
          min-width: 0 !important;
          font-size: 11px !important;
          padding: 2px 4px !important;
          text-overflow: ellipsis !important;
        }
        #chatDock #queuePanel.queue-panel {
          left: 4px !important;
          right: 4px !important;
          bottom: calc(100% + 6px) !important;
        }
        #chatDock #queuePanel.queue-panel .queue-summary {
          padding: 7px 8px !important;
        }
        #chatDock #queuePanel.queue-panel .queue-list {
          padding: 6px !important;
          max-height: min(34vh, 160px) !important;
        }
        #chatDock #queuePanel.queue-panel .queue-item {
          border-radius: 10px !important;
          padding: 7px 8px !important;
        }
        #chatDock .context-toggle-pill {
          display: none !important;
        }
        #chatDock .attach-btn,
        #chatDock .send-round,
        .chat-panel.active #chatDock .attach-btn,
        .chat-panel.active #chatDock .send-round {
          width: 26px !important;
          height: 26px !important;
          min-width: 26px !important;
          font-size: 12px !important;
        }

        .chat-empty {
          gap: 6px !important;
        }
        .chat-empty-sub {
          font-size: 11px !important;
          max-width: 100% !important;
        }
        .chat-empty-history-row {
          padding: 5px 4px 5px 14px !important;
          gap: 6px !important;
        }
        .chat-empty-history-row-title {
          font-size: 12px !important;
        }
        .chat-empty-history-row-age {
          font-size: 10px !important;
        }
      }

      @media (max-width: 340px) {
        .brand-kicker {
          display: none !important;
        }
        .brand-name {
          max-width: 110px !important;
        }
        #chatDock .composer-inline-select {
          flex-basis: 78px !important;
          max-width: 88px !important;
        }
        #msgs.messages .m {
          max-width: 96% !important;
        }
      }
    </style>
  </head>
  <body>
    <div id="jsGate" class="js-gate" role="status" aria-live="polite">
      <div class="js-gate-card">
        <div class="js-gate-title">Loading Playground 1 UI...</div>
        <div class="js-gate-sub">If this does not disappear, run <span class="kbd">Developer: Reload Window</span>.</div>
      </div>
    </div>
    <div id="setup" class="setup">
      <div class="setup-card">
        <h3>Connect Playground 1</h3>
        <p>Use browser sign-in or paste an API key.</p>
        <button id="signInSetup" class="primary" type="button">Sign in with browser</button>
        <div style="height:8px"></div>
        <div style="opacity:.7;font-size:12px">or</div>
        <div style="height:8px"></div>
        <input id="k" type="password" placeholder="xp_..." />
        <div style="height:6px"></div>
        <button id="ks" class="primary">Save API Key</button>
      </div>
    </div>

    <div id="app" class="app">
      <div class="global-top">
        <button id="backToChatQuick" type="button" class="menu-icon panel-icon hidden header-left" aria-label="Back to chat" title="Back to chat">&#8592;</button>
        <div class="brand-block">
          <span class="brand-name" title="Playground 1">Playground 1</span>
          <span class="brand-kicker">CHAT</span>
        </div>
        <div class="global-actions">
          <button id="newThreadQuick" type="button" class="menu-icon quick-new" aria-label="Start new chat" title="New chat">&#43;</button>
          <button id="historyQuick" type="button" class="menu-icon" aria-label="Open tasks" title="Tasks">&#8635;</button>
          <button id="historyHeader" type="button" class="menu-icon hidden" aria-label="Open tasks" title="Tasks">&#8635;</button>
          <button id="actionMenuBtn" type="button" class="menu-icon" aria-label="Settings" title="Settings" aria-expanded="false">&#9881;</button>
          <button id="undoHeader" type="button" class="menu-icon hidden" aria-label="Undo last changes" title="Undo last changes">Undo</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab active" data-p="chat">Chat</button>
        <button class="tab" data-p="stageThreads">Tasks</button>
        <button class="tab" data-p="history">History</button>
        <button class="tab" data-p="index">Index</button>
        <button class="tab" data-p="agents">Agents</button>
        <button class="tab" data-p="exec">Execution</button>
      </div>
      <div id="modeBanner" class="mode-banner hidden">Plan mode enabled. I will propose steps before making changes.</div>

      <div class="chat-shell" role="region" aria-label="Playground 1 chat">
        <div class="stage-shell" role="region" aria-label="Stage">
          <div id="chat" class="panel chat-panel active" aria-label="Chat">
            <div id="chips" class="chips"></div>
            <div id="chatEmpty" class="chat-empty">
              <div class="chat-home-recent" aria-label="Recent chats">
                <p class="chat-empty-history-head">Recent chats</p>
                <div id="chatEmptyHistoryList" class="chat-empty-history-list">
                  <div class="chat-empty-history-empty">No conversations yet.</div>
                </div>
              </div>
              <div class="chat-home-hero" aria-hidden="true">
                <p class="chat-empty-title">Work with <strong>Playground 1</strong></p>
                <p class="chat-empty-sub">Automates routine development tasks end-to-end for faster and more efficient delivery.</p>
              </div>
              <div class="chat-empty-actions">
                <button id="newThreadBtn" type="button" class="chat-empty-action">New chat</button>
                <button id="chatEmptyHistory" type="button" class="chat-empty-action">History</button>
                <button id="chatEmptySettings" type="button" class="chat-empty-action">Settings</button>
              </div>
            </div>
            <div id="msgs" class="messages"></div>
            <div class="jump-wrap">
              <button id="jumpLatest" class="jump-btn" type="button" aria-label="Jump to latest" title="Jump to latest">Latest</button>
            </div>
          </div>
          <div id="stageBlank" class="panel" aria-label="Blank stage"></div>
          <div id="stageThreads" class="panel" aria-label="Tasks">
            <div class="tasks-head">
              <span class="tasks-label">Tasks</span>
              <button id="closeThreadsPopup" type="button" class="menu-icon hidden" aria-label="Close tasks panel" title="Close tasks panel">Close</button>
            </div>
            <div id="taskList" class="task-list">No task history yet.</div>
            <button id="viewAllTasks" class="view-all" type="button">View all (0)</button>
            <div id="threadList" class="thread-list"></div>
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
                <textarea id="t" placeholder="Ask Playground 1 anything, @ to add files, / for commands" enterkeyhint="send"></textarea>
                <div id="mentionMenu" class="mention-menu hidden" role="listbox" aria-label="Mention suggestions"></div>
                <div class="input-actions minimal">
                  <button id="uploadBtn" class="icon-btn attach-btn" type="button" aria-label="Attach image" title="Attach">+</button>
                  <select id="modelSel" class="composer-inline-select">
                    <option value="${DEFAULT_PLAYGROUND_MODEL}">${modelLabelForUi(DEFAULT_PLAYGROUND_MODEL)}</option>
                  </select>
                  <select id="reasonSel" class="composer-inline-select">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                    <option value="max">Max</option>
                  </select>
                  <label class="context-toggle-pill" for="ctxToggle" title="Toggle IDE context">
                    <input id="ctxToggle" type="checkbox" checked />
                    <span id="contextPill" class="context-pill">IDE Context: LIVE</span>
                  </label>
                  <div class="composer-right">
                    <span id="queuePill" class="queue-pill" title="Queued messages">Queued: 0</span>
                    <button id="s" type="button" class="primary send-round" aria-label="Send">&#8593;</button>
                  </div>
                </div>
                <div id="contextTelemetry" class="context-telemetry" aria-live="polite">
                  <span id="contextAutoBadge" class="context-auto-badge idle">IDE Context</span>
                  <span id="contextTelemetryText" class="context-telemetry-text">Background sync standing by.</span>
                  <span id="contextTelemetryMeta" class="context-telemetry-meta">idle</span>
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
                <details id="queuePanel" class="queue-panel hidden">
                  <summary id="queueSummary" class="queue-summary">Queued messages (0)</summary>
                  <div id="queueList" class="queue-list"></div>
                </details>
                <div id="actionMenu" class="action-menu hidden" aria-hidden="true">
                  <div class="action-menu-backdrop" aria-hidden="true"></div>
                  <div class="action-menu-sheet" role="dialog" aria-label="Composer settings">
                    <div class="sheet-head">
                      <div>
                        <div class="sheet-title">Settings</div>
                        <div class="sheet-sub">Session, model, and account controls</div>
                      </div>
                      <div class="sheet-head-actions">
                        <button id="authSignOutQuick" class="action-item" type="button" style="display:none">Sign out</button>
                        <button id="actionMenuClose" type="button" class="sheet-close" aria-label="Close settings">Close</button>
                      </div>
                    </div>

                    <div class="sheet-grid">
                      <div class="sheet-card">
                        <div class="sheet-card-title">Session</div>
                        <div class="sheet-row">
                          <select id="modeQuick" class="composer-select">
                            <option value="auto">Mode: Auto</option>
                            <option value="plan">Mode: Plan</option>
                            <option value="yolo">Mode: Full access</option>
                          </select>
                        </div>
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
                        <div class="sheet-card-title">Model</div>
                        <div class="sheet-row">
                          <span class="tool-muted">Model and reasoning are controlled in the composer bar.</span>
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
                        <div class="sheet-card-title">API Key</div>
                        <div class="api-key-row">
                          <input id="apiKeyInline" class="api-key-input" type="password" placeholder="xp_..." />
                          <button id="apiKeyInlineSave" class="api-key-save" type="button">Save</button>
                        </div>
                        <div id="apiKeyHint" class="api-key-hint">Stored securely in VS Code secrets.</div>
                      </div>
                      <div class="sheet-card">
                        <div class="sheet-card-title">Attachments</div>
                        <div class="sheet-row">
                          <span id="uploadCount" class="tool-muted">No images selected.</span>
                          <span class="tool-muted">PNG/JPEG/WEBP, up to 3 images, 4 MB each.</span>
                        </div>
                      </div>
                      <div class="sheet-card">
                        <div class="sheet-card-title">Utilities</div>
                        <div class="sheet-grid">
                          <button id="c" class="action-item" type="button">Clear chat</button>
                          <button id="undoLastBtn" class="action-item" type="button">Undo last changes</button>
                          <button id="histQuick" class="action-item" type="button">Open tasks</button>
                          <button id="repQuick" class="action-item" type="button">Replay session</button>
                          <button id="idxQuick" class="action-item" type="button">Rebuild index</button>
                          <button class="action-item" type="button" data-menu-action="replay">Replay session</button>
                          <button class="action-item" type="button" data-menu-action="indexRebuild">Rebuild index</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <input id="uploadInput" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple />
              <div id="attachHint" class="attach-hint">No images attached.</div>
              <div class="footer-row">
                <span id="runState" class="footer-muted">Local</span>
                <span id="permState" class="footer-accent">Workspace tools on</span>
                <span id="usagePct" class="footer-muted">0%</span>
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
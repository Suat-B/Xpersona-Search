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
exports.CloudIndexManager = void 0;
const vscode = __importStar(require("vscode"));
const crypto_1 = require("crypto");
const intelligence_utils_1 = require("./intelligence-utils");
const api_client_1 = require("./api-client");
const config_1 = require("./config");
const MAX_INDEXED_FILES = 2000;
const MAX_FILE_BYTES = 160000;
const UPSERT_BATCH_SIZE = 120;
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 300;
function sha1(input) {
    return (0, crypto_1.createHash)("sha1").update(input, "utf8").digest("hex");
}
function isExcludedPath(relativePath) {
    const normalized = relativePath.toLowerCase();
    return (normalized.startsWith(".git/") ||
        normalized.includes("/.git/") ||
        normalized.startsWith("node_modules/") ||
        normalized.includes("/node_modules/") ||
        normalized.startsWith("dist/") ||
        normalized.includes("/dist/") ||
        normalized.startsWith("build/") ||
        normalized.includes("/build/") ||
        normalized.startsWith(".next/") ||
        normalized.includes("/.next/") ||
        normalized.includes("/coverage/") ||
        normalized.includes("/_vsix_") ||
        normalized.endsWith(".png") ||
        normalized.endsWith(".jpg") ||
        normalized.endsWith(".jpeg") ||
        normalized.endsWith(".gif") ||
        normalized.endsWith(".webp") ||
        normalized.endsWith(".ico") ||
        normalized.endsWith(".zip") ||
        normalized.endsWith(".vsix") ||
        normalized.endsWith(".pdf") ||
        normalized.endsWith(".mp4") ||
        normalized.endsWith(".mp3") ||
        normalized.endsWith(".woff") ||
        normalized.endsWith(".woff2"));
}
function chunkText(content) {
    const normalized = content.replace(/\r\n/g, "\n");
    if (normalized.length <= CHUNK_SIZE)
        return [normalized];
    const chunks = [];
    let offset = 0;
    while (offset < normalized.length) {
        chunks.push(normalized.slice(offset, offset + CHUNK_SIZE));
        offset += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
}
function readUtf8(bytes) {
    if (bytes.length > MAX_FILE_BYTES)
        return null;
    const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
    if (sample.some((byte) => byte === 0))
        return null;
    return Buffer.from(bytes).toString("utf8");
}
function scoreLocalPath(pathValue, queryTerms, hints) {
    const normalized = pathValue.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
        if (normalized.includes(term))
            score += 3;
    }
    if (hints?.preferredTargetPath && normalized === hints.preferredTargetPath.toLowerCase())
        score += 10;
    if (hints?.mentionedPaths.some((item) => item.toLowerCase() === normalized))
        score += 8;
    if (hints?.recentTouchedPaths?.some((item) => item.toLowerCase() === normalized))
        score += 4;
    return score;
}
class CloudIndexManager {
    constructor(context, getAuth) {
        this.context = context;
        this.getAuth = getAuth;
        this.onDidChangeStateEmitter = new vscode.EventEmitter();
        this.rebuildTimer = null;
        this.fileCache = [];
        this.onDidChangeState = this.onDidChangeStateEmitter.event;
        this.state =
            context.workspaceState.get(config_1.INDEX_STATE_KEY) || {
                projectKey: (0, config_1.getProjectKey)() || undefined,
                chunks: 0,
                freshness: "idle",
                lastQueryMatches: 0,
            };
    }
    getState() {
        return this.state;
    }
    start() {
        void this.refreshFileCache();
        this.scheduleRebuild(1500);
    }
    scheduleRebuild(delayMs = 3000) {
        if (this.rebuildTimer)
            clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => {
            this.rebuildTimer = null;
            void this.rebuild("background");
        }, delayMs);
    }
    async rebuild(reason = "manual") {
        const projectKey = (0, config_1.getProjectKey)();
        const auth = await this.getAuth();
        if (!projectKey) {
            this.updateState({
                projectKey: undefined,
                chunks: 0,
                freshness: "stale",
                lastQueryMatches: this.state.lastQueryMatches,
                lastError: "Open a workspace folder to enable cloud indexing.",
            });
            return;
        }
        if (!auth) {
            this.updateState({
                ...this.state,
                projectKey,
                freshness: "stale",
                lastError: "Authenticate to sync the workspace index.",
            });
            return;
        }
        this.updateState({
            ...this.state,
            projectKey,
            freshness: "indexing",
            lastError: undefined,
        });
        try {
            const files = await this.collectWorkspaceFiles();
            let uploadedChunks = 0;
            const pendingChunks = [];
            for (const file of files) {
                const bytes = await vscode.workspace.fs.readFile(file);
                const content = readUtf8(bytes);
                if (!content)
                    continue;
                const relativePath = (0, config_1.toWorkspaceRelativePath)(file);
                if (!relativePath || isExcludedPath(relativePath))
                    continue;
                const chunks = chunkText(content);
                for (const chunk of chunks) {
                    pendingChunks.push({
                        pathHash: sha1(relativePath),
                        chunkHash: sha1(`${relativePath}:${chunk}`),
                        pathDisplay: relativePath,
                        content: chunk,
                        metadata: (0, intelligence_utils_1.buildIndexChunkMetadata)({
                            pathDisplay: relativePath,
                            content: chunk,
                            source: "cloud",
                            reason: reason === "manual" ? "Manual rebuild" : "Background refresh",
                        }),
                    });
                }
            }
            for (let index = 0; index < pendingChunks.length; index += UPSERT_BATCH_SIZE) {
                const batch = pendingChunks.slice(index, index + UPSERT_BATCH_SIZE);
                await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/index/upsert`, auth, {
                    projectKey,
                    chunks: batch,
                    cursor: String(index + batch.length),
                    stats: {
                        chunkCount: pendingChunks.length,
                        fileCount: files.length,
                    },
                });
                uploadedChunks += batch.length;
            }
            this.updateState({
                projectKey,
                chunks: uploadedChunks,
                freshness: "ready",
                lastQueryMatches: this.state.lastQueryMatches,
                lastRebuildAt: new Date().toISOString(),
            });
        }
        catch (error) {
            this.updateState({
                ...this.state,
                projectKey,
                freshness: "error",
                lastError: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async query(query, hints) {
        const projectKey = (0, config_1.getProjectKey)();
        const auth = await this.getAuth();
        if (projectKey && auth) {
            try {
                const rows = await (0, api_client_1.requestJson)("POST", `${(0, config_1.getBaseApiUrl)()}/api/v1/playground/index/query`, auth, {
                    projectKey,
                    query,
                    limit: 6,
                    retrievalHints: hints,
                });
                if (Array.isArray(rows) && rows.length > 0) {
                    const snippets = rows
                        .map((row) => ({
                        path: (0, config_1.normalizeWorkspaceRelativePath)(row.pathDisplay),
                        score: row.score,
                        content: String(row.content || "").slice(0, 6000),
                        source: row.metadata?.source || "cloud",
                        reason: row.metadata?.reason || "Cloud index hit",
                    }))
                        .filter((row) => row.path && row.content);
                    this.updateState({
                        ...this.state,
                        projectKey,
                        freshness: "ready",
                        lastQueryMatches: snippets.length,
                    });
                    if (snippets.length > 0) {
                        return snippets;
                    }
                }
            }
            catch {
                // Fall through to local fallback.
            }
        }
        const fallback = await this.localFallbackQuery(query, hints);
        this.updateState({
            ...this.state,
            projectKey: projectKey || undefined,
            freshness: this.state.freshness === "idle" ? "stale" : this.state.freshness,
            lastQueryMatches: fallback.length,
        });
        return fallback;
    }
    async getMentionSuggestions(rawQuery) {
        const query = (0, config_1.normalizeWorkspaceRelativePath)(rawQuery) || "";
        if (this.fileCache.length === 0) {
            await this.refreshFileCache();
        }
        const normalizedQuery = query.toLowerCase();
        const exactStarts = this.fileCache.filter((item) => item.toLowerCase().startsWith(normalizedQuery));
        const fuzzy = this.fileCache.filter((item) => !exactStarts.includes(item) && item.toLowerCase().includes(normalizedQuery));
        return [...exactStarts, ...fuzzy].slice(0, 12);
    }
    async collectWorkspaceFiles() {
        const files = await vscode.workspace.findFiles("**/*", undefined, MAX_INDEXED_FILES);
        this.fileCache = files
            .map((uri) => (0, config_1.toWorkspaceRelativePath)(uri))
            .filter((value) => Boolean(value))
            .filter((value) => !isExcludedPath(value))
            .sort((a, b) => a.localeCompare(b));
        return files;
    }
    async refreshFileCache() {
        await this.collectWorkspaceFiles().catch(() => null);
    }
    async localFallbackQuery(query, hints) {
        if (this.fileCache.length === 0) {
            await this.refreshFileCache();
        }
        const terms = Array.from(new Set(String(query || "")
            .toLowerCase()
            .split(/[^a-z0-9_./-]+/)
            .map((item) => item.trim())
            .filter((item) => item.length >= 2))).slice(0, 8);
        const candidates = this.fileCache
            .map((filePath) => ({
            path: filePath,
            score: scoreLocalPath(filePath, terms, hints),
        }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
        const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!folderUri)
            return [];
        const snippets = [];
        for (const candidate of candidates) {
            const uri = vscode.Uri.joinPath(folderUri, candidate.path);
            try {
                const content = readUtf8(await vscode.workspace.fs.readFile(uri));
                if (!content)
                    continue;
                snippets.push({
                    path: candidate.path,
                    score: candidate.score,
                    content: content.slice(0, 4000),
                    source: "local_fallback",
                    reason: "Local workspace fallback",
                });
            }
            catch {
                // ignore unreadable file
            }
        }
        return snippets;
    }
    updateState(next) {
        this.state = next;
        void this.context.workspaceState.update(config_1.INDEX_STATE_KEY, next);
        this.onDidChangeStateEmitter.fire(next);
    }
}
exports.CloudIndexManager = CloudIndexManager;
//# sourceMappingURL=indexer.js.map
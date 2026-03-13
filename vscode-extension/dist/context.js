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
exports.ContextCollector = void 0;
const vscode = __importStar(require("vscode"));
const context_utils_1 = require("./context-utils");
const intelligence_utils_1 = require("./intelligence-utils");
const config_1 = require("./config");
function truncate(text, limit) {
    const value = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!value)
        return undefined;
    return value.slice(0, limit);
}
function extractMentionPaths(task) {
    const matches = task.match(/@([A-Za-z0-9_./-]+)/g) || [];
    return matches
        .map((value) => (0, intelligence_utils_1.normalizeContextPath)(value))
        .filter(Boolean)
        .slice(0, 12);
}
function extractCandidateSymbols(task) {
    const symbols = task.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) || [];
    return Array.from(new Set(symbols)).slice(0, 8);
}
function uniquePaths(values, limit) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = (0, intelligence_utils_1.normalizeContextPath)(value);
        const key = normalized.toLowerCase();
        if (!normalized || seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
        if (out.length >= limit)
            break;
    }
    return out;
}
async function readWorkspaceSnippet(target) {
    const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(target.path);
    if (!absolutePath)
        return null;
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
        const raw = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
        const lines = raw.split("\n");
        let content = raw;
        if (target.line) {
            const start = Math.max(1, target.line - 25);
            const end = Math.min(lines.length, target.line + 25);
            content = lines.slice(start - 1, end).join("\n");
            return {
                path: target.path,
                content: truncate(content, 6000) || "",
                source: "local_fallback",
                reason: `${target.reason} near line ${target.line}`,
            };
        }
        content = lines.slice(0, 180).join("\n");
        return {
            path: target.path,
            content: truncate(content, 6000) || "",
            source: "local_fallback",
            reason: target.reason,
        };
    }
    catch {
        return null;
    }
}
class ContextCollector {
    constructor(indexManager) {
        this.indexManager = indexManager;
    }
    collectOpenFiles() {
        const items = vscode.window.visibleTextEditors
            .map((editor) => {
            const relativePath = (0, config_1.toWorkspaceRelativePath)(editor.document.uri);
            if (!relativePath)
                return null;
            return {
                path: relativePath,
                language: editor.document.languageId,
                excerpt: truncate(editor.document.getText(), 5000),
            };
        })
            .filter((item) => item !== null);
        return items.slice(0, 6);
    }
    async resolveTaskFiles(task, activePath, openFiles) {
        const references = (0, context_utils_1.extractTaskPathReferences)(task);
        if (!references.length)
            return [];
        const openPaths = openFiles.map((file) => file.path);
        const resolved = [];
        const seen = new Set();
        for (const reference of references) {
            const localCandidates = uniquePaths([activePath || "", ...openPaths].filter((candidate) => {
                const normalizedCandidate = (0, intelligence_utils_1.normalizeContextPath)(candidate).toLowerCase();
                const normalizedQuery = (0, intelligence_utils_1.normalizeContextPath)(reference.query).toLowerCase();
                const candidateBase = normalizedCandidate.split("/").pop() || normalizedCandidate;
                const queryBase = normalizedQuery.split("/").pop() || normalizedQuery;
                return (normalizedCandidate === normalizedQuery ||
                    normalizedCandidate.endsWith(`/${normalizedQuery}`) ||
                    candidateBase === queryBase);
            }), 12);
            const suggestionCandidates = await this.indexManager.getMentionSuggestions(reference.query);
            const ranked = (0, context_utils_1.rankWorkspacePathMatches)(reference.query, [...localCandidates, ...suggestionCandidates], {
                activePath: activePath || undefined,
                openFiles: openPaths,
            });
            const bestMatch = ranked[0];
            if (!bestMatch)
                continue;
            const key = bestMatch.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            resolved.push({
                path: bestMatch,
                ...(reference.line ? { line: reference.line } : {}),
                reason: `Matched "${reference.query}" from the user's request`,
            });
            if (resolved.length >= 6)
                break;
        }
        return resolved;
    }
    async collect(task, recentTouchedPaths) {
        const activeEditor = vscode.window.activeTextEditor;
        const activePath = activeEditor ? (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) : null;
        const openFiles = this.collectOpenFiles();
        const mentionPaths = extractMentionPaths(task);
        const resolvedTaskFiles = await this.resolveTaskFiles(task, activePath, openFiles);
        const resolvedPaths = resolvedTaskFiles.map((item) => item.path);
        const diagnostics = vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .slice(0, 40);
        const retrievalHints = (0, intelligence_utils_1.buildRetrievalHints)({
            mentionPaths: [...mentionPaths, ...resolvedPaths],
            candidateSymbols: extractCandidateSymbols(task),
            diagnostics,
            preferredTargetPath: mentionPaths[0] || resolvedPaths[0] || activePath || undefined,
            recentTouchedPaths,
        });
        const indexedSnippets = await this.indexManager.query(task, retrievalHints);
        const explicitTargetSnippets = (await Promise.all(resolvedTaskFiles
            .filter((item) => !indexedSnippets.some((snippet) => snippet.path === item.path))
            .map((item) => readWorkspaceSnippet(item)))).filter((item) => Boolean(item && item.content));
        const combinedSnippets = [...explicitTargetSnippets, ...indexedSnippets].slice(0, 10);
        const context = {
            ...(activeEditor && activePath
                ? {
                    activeFile: {
                        path: activePath,
                        language: activeEditor.document.languageId,
                        ...(activeEditor.selection.isEmpty
                            ? { content: truncate(activeEditor.document.getText(), 16000) }
                            : { selection: truncate(activeEditor.document.getText(activeEditor.selection), 12000) }),
                    },
                }
                : {}),
            ...(openFiles.length ? { openFiles } : {}),
            ...(diagnostics.length ? { diagnostics } : {}),
            ...(combinedSnippets.length ? { indexedSnippets: combinedSnippets } : {}),
        };
        return {
            context,
            retrievalHints,
            preview: {
                ...(activePath ? { activeFile: activePath } : {}),
                openFiles: openFiles.map((item) => item.path),
                resolvedFiles: resolvedPaths.slice(0, 8),
                selectedFiles: combinedSnippets
                    .map((item) => item.path)
                    .filter((value) => Boolean(value))
                    .slice(0, 8),
                diagnostics: diagnostics
                    .map((item) => `${item.file || "workspace"}:${item.line || 1} ${item.message}`)
                    .slice(0, 8),
                snippets: combinedSnippets
                    .map((item) => ({
                    path: item.path || "workspace",
                    source: item.source || "local_fallback",
                    reason: item.reason || "Workspace snippet",
                }))
                    .slice(0, 6),
            },
        };
    }
    async getMentionSuggestions(query) {
        return this.indexManager.getMentionSuggestions(query);
    }
}
exports.ContextCollector = ContextCollector;
//# sourceMappingURL=context.js.map
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
class ContextCollector {
    constructor(indexManager) {
        this.indexManager = indexManager;
    }
    async collect(task, recentTouchedPaths) {
        const activeEditor = vscode.window.activeTextEditor;
        const activePath = activeEditor ? (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) : null;
        const mentionPaths = extractMentionPaths(task);
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
            mentionPaths,
            candidateSymbols: extractCandidateSymbols(task),
            diagnostics,
            preferredTargetPath: mentionPaths[0] || activePath || undefined,
            recentTouchedPaths,
        });
        const indexedSnippets = await this.indexManager.query(task, retrievalHints);
        const openFiles = vscode.window.visibleTextEditors
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
            .filter((item) => item !== null)
            .slice(0, 6);
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
            ...(indexedSnippets.length ? { indexedSnippets } : {}),
        };
        return {
            context,
            retrievalHints,
            preview: {
                ...(activePath ? { activeFile: activePath } : {}),
                openFiles: openFiles.map((item) => item.path),
                selectedFiles: indexedSnippets
                    .map((item) => item.path)
                    .filter((value) => Boolean(value))
                    .slice(0, 8),
                diagnostics: diagnostics
                    .map((item) => `${item.file || "workspace"}:${item.line || 1} ${item.message}`)
                    .slice(0, 8),
                snippets: indexedSnippets
                    .map((item) => ({
                    path: item.path || "workspace",
                    source: item.source,
                    reason: item.reason,
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
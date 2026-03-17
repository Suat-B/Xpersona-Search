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
const assistant_ux_1 = require("./assistant-ux");
const context_utils_1 = require("./context-utils");
const intelligence_utils_1 = require("./intelligence-utils");
const config_1 = require("./config");
function refersToCurrentWorkspaceContext(task) {
    const normalized = String(task || "").trim().toLowerCase();
    if (!normalized)
        return false;
    return (/\b(current|existing|open)\s+(file|files|plan|doc|document|tab|tabs|integration plan)\b/.test(normalized) ||
        /\b(this|these)\s+(file|files|plan|doc|document|tab|tabs)\b/.test(normalized) ||
        /\b(continue|keep working|expand on|elaborate on|build on)\b/.test(normalized));
}
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
        .filter((value) => value && !(0, intelligence_utils_1.isRuntimePathLeak)(value))
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
        if (!normalized || (0, intelligence_utils_1.isRuntimePathLeak)(normalized) || seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
        if (out.length >= limit)
            break;
    }
    return out;
}
async function readWorkspaceText(filePath) {
    const absolutePath = (0, config_1.toAbsoluteWorkspacePath)(filePath);
    if (!absolutePath)
        return null;
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
        return Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
    }
    catch {
        return null;
    }
}
async function readWorkspaceSnippet(target) {
    const raw = await readWorkspaceText(target.path);
    if (!raw)
        return null;
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
async function readAttachedOpenFile(pathValue) {
    const text = await readWorkspaceText(pathValue);
    if (!text)
        return null;
    return {
        path: pathValue,
        excerpt: truncate(text, 4000),
    };
}
class ContextCollector {
    constructor(indexManager) {
        this.indexManager = indexManager;
    }
    collectOpenFiles() {
        return vscode.window.visibleTextEditors
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
    }
    async resolveTaskFiles(input) {
        const references = (0, context_utils_1.extractTaskPathReferences)(input.task);
        const openPaths = input.openFiles.map((file) => file.path);
        const baseCandidates = uniquePaths([...input.attachedFiles, input.activePath || "", ...openPaths, ...input.memoryFiles], 40);
        const resolved = [];
        const candidateFiles = [];
        const seenResolved = new Set();
        for (const reference of references) {
            const suggestionCandidates = await this.indexManager.getMentionSuggestions(reference.query);
            const ranked = (0, context_utils_1.rankWorkspacePathMatches)(reference.query, [...baseCandidates, ...suggestionCandidates], {
                activePath: input.activePath || undefined,
                openFiles: openPaths,
                memoryFiles: input.memoryFiles,
            });
            candidateFiles.push(...ranked.slice(0, 3));
            const bestMatch = ranked[0];
            if (!bestMatch)
                continue;
            const key = bestMatch.toLowerCase();
            if (seenResolved.has(key))
                continue;
            seenResolved.add(key);
            resolved.push({
                path: bestMatch,
                ...(reference.line ? { line: reference.line } : {}),
                reason: `Matched "${reference.query}" from the user's request`,
            });
            if (resolved.length >= 6)
                break;
        }
        return {
            explicitReferenceCount: references.length,
            resolvedTaskFiles: resolved,
            candidateFiles: uniquePaths(candidateFiles, 8),
        };
    }
    async analyze(task, options) {
        const activeEditor = vscode.window.activeTextEditor;
        const activePath = activeEditor ? (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) : null;
        const openFiles = this.collectOpenFiles();
        let attachedFiles = uniquePaths(options.attachedFiles || [], 4);
        const memoryFiles = uniquePaths(options.memoryTargets || [], 8);
        const attachedSelection = options.attachedSelection || null;
        const intent = options.intent || (0, assistant_ux_1.classifyIntent)(task);
        const diagnostics = vscode.languages
            .getDiagnostics()
            .flatMap(([uri, entries]) => entries.map((entry) => ({
            file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
            severity: entry.severity,
            message: entry.message,
            line: entry.range.start.line + 1,
        })))
            .slice(0, 40);
        const resolvedTaskState = await this.resolveTaskFiles({
            task,
            activePath,
            openFiles,
            attachedFiles,
            memoryFiles,
        });
        const shouldInferActiveFileForEdit = intent === "change" &&
            Boolean(activePath) &&
            !attachedFiles.length &&
            !attachedSelection &&
            resolvedTaskState.explicitReferenceCount === 0;
        const shouldInferActiveFileForCurrentContext = intent !== "find" &&
            Boolean(activePath) &&
            !attachedFiles.length &&
            !attachedSelection &&
            resolvedTaskState.explicitReferenceCount === 0 &&
            refersToCurrentWorkspaceContext(task);
        if (shouldInferActiveFileForEdit && activePath) {
            attachedFiles = uniquePaths([activePath, ...attachedFiles], 4);
        }
        if (shouldInferActiveFileForCurrentContext && activePath) {
            attachedFiles = uniquePaths([activePath, ...attachedFiles], 4);
        }
        let resolvedFiles = uniquePaths([
            ...attachedFiles,
            attachedSelection?.path || "",
            ...resolvedTaskState.resolvedTaskFiles.map((item) => item.path),
        ], 8);
        let candidateFiles = uniquePaths([
            ...resolvedTaskState.candidateFiles,
            activePath || "",
            ...attachedFiles,
            attachedSelection?.path || "",
            ...openFiles.map((item) => item.path),
            ...memoryFiles,
        ], 8);
        if (!resolvedFiles.length && intent === "change" && attachedSelection?.path) {
            resolvedFiles = [attachedSelection.path];
        }
        if (!resolvedFiles.length && intent === "change" && attachedFiles.length === 1) {
            resolvedFiles = attachedFiles.slice(0, 1);
        }
        if (!resolvedFiles.length && intent === "change" && candidateFiles.length === 1) {
            resolvedFiles = candidateFiles.slice(0, 1);
        }
        if (!resolvedFiles.length && intent === "change" && activePath && candidateFiles.length === 0) {
            resolvedFiles = [activePath];
            candidateFiles = [activePath];
        }
        if (!candidateFiles.length) {
            candidateFiles = uniquePaths([activePath || "", ...openFiles.map((item) => item.path), ...memoryFiles], 8);
        }
        return {
            intent,
            activeEditor,
            activePath,
            openFiles,
            diagnostics,
            attachedFiles,
            attachedSelection,
            memoryFiles,
            explicitReferenceCount: resolvedTaskState.explicitReferenceCount,
            resolvedTaskFiles: resolvedTaskState.resolvedTaskFiles,
            resolvedFiles,
            candidateFiles,
        };
    }
    async preview(task, options) {
        const analysis = await this.analyze(task, options);
        const confidence = (0, assistant_ux_1.assessContextConfidence)({
            intent: analysis.intent,
            resolvedFiles: analysis.resolvedFiles,
            candidateFiles: analysis.candidateFiles,
            attachedFiles: analysis.attachedFiles,
            memoryFiles: analysis.memoryFiles,
            hasAttachedSelection: Boolean(analysis.attachedSelection?.content),
            explicitReferenceCount: analysis.explicitReferenceCount,
            selectedFilesCount: 0,
            diagnosticsCount: analysis.diagnostics.length,
        });
        return {
            ...(analysis.activePath ? { activeFile: analysis.activePath } : {}),
            openFiles: analysis.openFiles.map((item) => item.path),
            candidateFiles: analysis.candidateFiles.slice(0, 4),
            attachedFiles: analysis.attachedFiles,
            memoryFiles: analysis.memoryFiles.slice(0, 4),
            resolvedFiles: analysis.resolvedFiles.slice(0, 8),
            selectedFiles: [],
            diagnostics: analysis.diagnostics
                .map((item) => `${item.file || "workspace"}:${item.line || 1} ${item.message}`)
                .slice(0, 8),
            intent: analysis.intent,
            confidence: confidence.confidence,
            confidenceScore: confidence.score,
            rationale: confidence.rationale,
            ...((0, config_1.getWorkspaceRootPath)() ? { workspaceRoot: (0, config_1.getWorkspaceRootPath)() || undefined } : {}),
            ...(analysis.attachedSelection
                ? {
                    attachedSelection: {
                        path: analysis.attachedSelection.path,
                        summary: analysis.attachedSelection.summary,
                    },
                }
                : {}),
            snippets: [],
        };
    }
    async collect(task, options) {
        const analysis = await this.analyze(task, options);
        const preview = await this.preview(task, options);
        const mentionPaths = extractMentionPaths(task);
        const retrievalHints = (0, intelligence_utils_1.buildRetrievalHints)({
            mentionPaths: [
                ...mentionPaths,
                ...analysis.attachedFiles,
                ...(analysis.attachedSelection ? [analysis.attachedSelection.path] : []),
                ...analysis.resolvedFiles,
                ...analysis.memoryFiles,
            ],
            candidateSymbols: extractCandidateSymbols(task),
            diagnostics: analysis.diagnostics,
            preferredTargetPath: analysis.attachedSelection?.path ||
                analysis.attachedFiles[0] ||
                analysis.resolvedFiles[0] ||
                analysis.activePath ||
                undefined,
            recentTouchedPaths: options.recentTouchedPaths,
        });
        const queryVariants = [
            task,
            options.searchDepth === "deep"
                ? `${task}\nFocus files: ${analysis.candidateFiles.slice(0, 4).join(", ")}\nMemory hints: ${analysis.memoryFiles
                    .slice(0, 4)
                    .join(", ")}`
                : "",
        ].filter(Boolean);
        const indexedBuckets = await Promise.all(queryVariants.map((queryText) => this.indexManager.query(queryText, retrievalHints)));
        const rawIndexedSnippetRows = indexedBuckets
            .flat()
            .filter((item, index, array) => array.findIndex((row) => row.path === item.path && row.content === item.content) === index);
        const shouldConstrainIndexedSnippets = analysis.intent === "change" &&
            analysis.explicitReferenceCount === 0 &&
            !analysis.attachedSelection &&
            analysis.resolvedFiles.length === 1 &&
            Boolean(analysis.activePath || analysis.attachedFiles.length);
        const allowedFocusPaths = shouldConstrainIndexedSnippets
            ? new Set(uniquePaths([
                analysis.resolvedFiles[0] || "",
                analysis.activePath || "",
                ...analysis.attachedFiles,
            ], 8).map((pathValue) => pathValue.toLowerCase()))
            : null;
        const indexedSnippetRows = allowedFocusPaths && allowedFocusPaths.size
            ? rawIndexedSnippetRows.filter((item) => allowedFocusPaths.has((0, intelligence_utils_1.normalizeContextPath)(item.path || "").toLowerCase()))
            : rawIndexedSnippetRows;
        const explicitTargetSnippets = (await Promise.all(analysis.resolvedTaskFiles
            .filter((item) => !indexedSnippetRows.some((snippet) => snippet.path === item.path))
            .map((item) => readWorkspaceSnippet(item)))).filter((item) => Boolean(item && item.content));
        const attachedOpenFiles = (await Promise.all(analysis.attachedFiles
            .filter((pathValue) => !analysis.openFiles.some((item) => item.path === pathValue))
            .map((pathValue) => readAttachedOpenFile(pathValue)))).filter((item) => Boolean(item));
        const combinedSnippets = [...explicitTargetSnippets, ...indexedSnippetRows].slice(0, 12);
        const openFiles = [...analysis.openFiles, ...attachedOpenFiles].slice(0, 8);
        const activeFileContext = analysis.attachedSelection && analysis.attachedSelection.content
            ? {
                path: analysis.attachedSelection.path,
                selection: truncate(analysis.attachedSelection.content, 12000),
            }
            : analysis.activeEditor && analysis.activePath
                ? {
                    path: analysis.activePath,
                    language: analysis.activeEditor.document.languageId,
                    ...(analysis.activeEditor.selection.isEmpty
                        ? { content: truncate(analysis.activeEditor.document.getText(), 16000) }
                        : { selection: truncate(analysis.activeEditor.document.getText(analysis.activeEditor.selection), 12000) }),
                }
                : undefined;
        const context = {
            ...(activeFileContext ? { activeFile: activeFileContext } : {}),
            ...(openFiles.length ? { openFiles } : {}),
            ...(analysis.diagnostics.length ? { diagnostics: analysis.diagnostics } : {}),
            ...(combinedSnippets.length ? { indexedSnippets: combinedSnippets } : {}),
        };
        const fullPreview = {
            ...preview,
            selectedFiles: uniquePaths([...analysis.resolvedFiles, ...combinedSnippets.map((item) => item.path || "")], 8),
            snippets: combinedSnippets
                .map((item) => ({
                path: item.path || "workspace",
                source: item.source || "local_fallback",
                reason: item.reason || "Workspace snippet",
            }))
                .slice(0, 6),
        };
        const refreshedConfidence = (0, assistant_ux_1.assessContextConfidence)({
            intent: fullPreview.intent,
            resolvedFiles: fullPreview.resolvedFiles,
            candidateFiles: fullPreview.candidateFiles,
            attachedFiles: fullPreview.attachedFiles,
            memoryFiles: fullPreview.memoryFiles,
            hasAttachedSelection: Boolean(fullPreview.attachedSelection?.summary),
            explicitReferenceCount: analysis.explicitReferenceCount,
            selectedFilesCount: fullPreview.selectedFiles.length,
            diagnosticsCount: fullPreview.diagnostics.length,
        });
        fullPreview.confidence = refreshedConfidence.confidence;
        fullPreview.confidenceScore = refreshedConfidence.score;
        fullPreview.rationale = refreshedConfidence.rationale;
        return {
            context,
            retrievalHints,
            preview: fullPreview,
        };
    }
    async getMentionSuggestions(query) {
        return this.indexManager.getMentionSuggestions(query);
    }
}
exports.ContextCollector = ContextCollector;
//# sourceMappingURL=context.js.map
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
exports.gatherPortableBundleContext = gatherPortableBundleContext;
/**
 * Context + retrievalHints for portable bundle create, aligned with Binary IDE ContextCollector.collect
 * (without cloud index — resolves path references against open tabs, active file, and workspace file search).
 */
const vscode = __importStar(require("vscode"));
const binary_intelligence_utils_1 = require("./binary-intelligence-utils");
const binary_context_path_1 = require("./binary-context-path");
const binary_intent_1 = require("./binary-intent");
const config_1 = require("./config");
function truncate(text, limit) {
    const value = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!value)
        return undefined;
    return value.slice(0, limit);
}
function uniquePaths(values, limit) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = (0, binary_intelligence_utils_1.normalizeContextPath)(value);
        const key = normalized.toLowerCase();
        if (!normalized || (0, binary_intelligence_utils_1.isRuntimePathLeak)(normalized) || seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
        if (out.length >= limit)
            break;
    }
    return out;
}
function refersToCurrentWorkspaceContext(task) {
    const normalized = String(task || "").trim().toLowerCase();
    if (!normalized)
        return false;
    return (/\b(current|existing|open)\s+(file|files|plan|doc|document|tab|tabs|integration plan)\b/.test(normalized) ||
        /\b(this|these)\s+(file|files|plan|doc|document|tab|tabs)\b/.test(normalized) ||
        /\b(continue|keep working|expand on|elaborate on|build on)\b/.test(normalized));
}
function extractMentionPaths(task) {
    const matches = task.match(/@([A-Za-z0-9_./-]+)/g) || [];
    return matches
        .map((value) => (0, binary_intelligence_utils_1.normalizeContextPath)(value))
        .filter((value) => value && !(0, binary_intelligence_utils_1.isRuntimePathLeak)(value))
        .slice(0, 12);
}
function extractCandidateSymbols(task) {
    const symbols = task.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) || [];
    return Array.from(new Set(symbols)).slice(0, 8);
}
async function findWorkspacePathsMatchingBasename(basenameQuery) {
    const root = (0, config_1.getWorkspaceRootPath)();
    if (!root || !basenameQuery.trim())
        return [];
    const pattern = `**/${basenameQuery.replace(/[\\*?[\]]/g, "")}`;
    try {
        const uris = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,dist,build,out,.next}/**", 40);
        return uris
            .map((u) => (0, config_1.toWorkspaceRelativePath)(u))
            .filter((p) => Boolean(p))
            .filter((p) => !(0, binary_intelligence_utils_1.isRuntimePathLeak)(p));
    }
    catch {
        return [];
    }
}
async function resolveTaskFiles(input) {
    const references = (0, binary_context_path_1.extractTaskPathReferences)(input.task);
    const openPaths = input.openFiles.map((file) => file.path);
    let baseCandidates = uniquePaths([...input.attachedFiles, input.activePath || "", ...openPaths, ...input.memoryFiles], 40);
    const resolved = [];
    const candidateFiles = [];
    const seenResolved = new Set();
    for (const reference of references) {
        let ranked = (0, binary_context_path_1.rankWorkspacePathMatches)(reference.query, baseCandidates, {
            activePath: input.activePath || undefined,
            openFiles: openPaths,
            memoryFiles: input.memoryFiles,
        });
        if (!ranked.length) {
            const base = reference.query.split("/").pop() || reference.query;
            const extra = await findWorkspacePathsMatchingBasename(base);
            ranked = (0, binary_context_path_1.rankWorkspacePathMatches)(reference.query, [...baseCandidates, ...extra], {
                activePath: input.activePath || undefined,
                openFiles: openPaths,
                memoryFiles: input.memoryFiles,
            });
        }
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
function collectOpenFiles() {
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
async function gatherPortableBundleContext(input) {
    const task = String(input.intentText || "").trim();
    const activeEditor = vscode.window.activeTextEditor;
    const activePath = activeEditor ? (0, config_1.toWorkspaceRelativePath)(activeEditor.document.uri) : null;
    const openFiles = collectOpenFiles();
    const attachedFiles = [];
    const attachedSelection = null;
    const memoryFiles = [];
    const intent = (0, binary_intent_1.classifyIntent)(task);
    const diagnostics = vscode.languages
        .getDiagnostics()
        .flatMap(([uri, entries]) => entries.map((entry) => ({
        file: (0, config_1.toWorkspaceRelativePath)(uri) || undefined,
        severity: entry.severity,
        message: entry.message,
        line: entry.range.start.line + 1,
    })))
        .slice(0, 40);
    const resolvedTaskState = await resolveTaskFiles({
        task,
        activePath,
        openFiles,
        attachedFiles,
        memoryFiles,
    });
    let inferredAttached = attachedFiles;
    const shouldInferActiveFileForEdit = intent === "change" &&
        Boolean(activePath) &&
        !inferredAttached.length &&
        !attachedSelection &&
        resolvedTaskState.explicitReferenceCount === 0;
    const shouldInferActiveFileForCurrentContext = intent !== "find" &&
        Boolean(activePath) &&
        !inferredAttached.length &&
        !attachedSelection &&
        resolvedTaskState.explicitReferenceCount === 0 &&
        refersToCurrentWorkspaceContext(task);
    if (shouldInferActiveFileForEdit && activePath) {
        inferredAttached = uniquePaths([activePath, ...inferredAttached], 4);
    }
    if (shouldInferActiveFileForCurrentContext && activePath) {
        inferredAttached = uniquePaths([activePath, ...inferredAttached], 4);
    }
    let resolvedFiles = uniquePaths([
        ...inferredAttached,
        ...resolvedTaskState.resolvedTaskFiles.map((item) => item.path),
    ], 8);
    let candidateFiles = uniquePaths([
        ...resolvedTaskState.candidateFiles,
        activePath || "",
        ...inferredAttached,
        ...openFiles.map((item) => item.path),
        ...memoryFiles,
    ], 8);
    if (!resolvedFiles.length && intent === "change" && inferredAttached.length === 1) {
        resolvedFiles = inferredAttached.slice(0, 1);
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
    const mentionPaths = extractMentionPaths(task);
    const retrievalHints = (0, binary_intelligence_utils_1.buildRetrievalHints)({
        mentionPaths: [
            ...mentionPaths,
            ...inferredAttached,
            ...resolvedFiles,
            ...memoryFiles,
        ],
        candidateSymbols: extractCandidateSymbols(task),
        diagnostics,
        preferredTargetPath: inferredAttached[0] || resolvedFiles[0] || activePath || undefined,
        recentTouchedPaths: input.recentTouchedPaths,
    });
    const activeFileContext = activeEditor && activePath
        ? {
            path: activePath,
            language: activeEditor.document.languageId,
            ...(activeEditor.selection.isEmpty
                ? { content: truncate(activeEditor.document.getText(), 16000) }
                : {
                    selection: truncate(activeEditor.document.getText(activeEditor.selection), 12000),
                }),
        }
        : undefined;
    const context = {
        ...(activeFileContext ? { activeFile: activeFileContext } : {}),
        ...(openFiles.length ? { openFiles } : {}),
    };
    return { context, retrievalHints };
}
//# sourceMappingURL=binary-portable-context.js.map
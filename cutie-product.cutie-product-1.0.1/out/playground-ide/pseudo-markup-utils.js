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
exports.extractReadFilePathsFromPseudoMarkup = extractReadFilePathsFromPseudoMarkup;
exports.augmentContextFromPseudoMarkup = augmentContextFromPseudoMarkup;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const intelligence_utils_1 = require("./intelligence-utils");
/**
 * Extracts read_file paths from pseudo tool-call markup in assistant text.
 * Returns only paths that are within the workspace and not runtime/extension paths.
 */
function extractReadFilePathsFromPseudoMarkup(text, workspaceRoot) {
    const source = String(text || "");
    if (!source || !workspaceRoot)
        return [];
    const toolCallMatches = Array.from(source.matchAll(/<tool_call>[\s\S]*?<function=([A-Za-z0-9_.:-]+)>[\s\S]*?<\/tool_call>/gi));
    const paths = [];
    const seen = new Set();
    for (const match of toolCallMatches) {
        const toolName = String(match[1] || "").trim().toLowerCase();
        if (toolName !== "read_file")
            continue;
        const block = String(match[0] || "");
        const paramMatches = block.matchAll(/<parameter=(?:path|absolute_path|file_path)\s*>([\s\S]*?)<\/parameter>/gi);
        for (const m of paramMatches) {
            const rawPath = String(m[1] || "").trim();
            if (!rawPath)
                continue;
            if ((0, intelligence_utils_1.isRuntimePathLeak)(rawPath))
                continue;
            const normalized = rawPath.replace(/\\/g, "/").trim();
            let absPath = null;
            const wrNormalized = workspaceRoot.replace(/\\/g, "/");
            if (path.isAbsolute(normalized)) {
                if (normalized.toLowerCase().startsWith(wrNormalized.toLowerCase())) {
                    absPath = path.resolve(normalized);
                }
            }
            else {
                absPath = path.join(workspaceRoot, normalized);
            }
            if (absPath && !seen.has(absPath)) {
                seen.add(absPath);
                paths.push(absPath);
            }
        }
    }
    return paths;
}
/**
 * Reads workspace files from pseudo markup and returns snippets for context injection.
 * When the model tried to read extension paths (filtered out), falls back to resolved workspace files.
 */
async function augmentContextFromPseudoMarkup(assistantText, workspaceRoot, fallbackPaths) {
    let paths = extractReadFilePathsFromPseudoMarkup(assistantText, workspaceRoot);
    if (!paths.length && fallbackPaths?.length && workspaceRoot) {
        paths = fallbackPaths
            .map((p) => path.join(workspaceRoot, p.replace(/\\/g, "/")))
            .filter((abs) => !(0, intelligence_utils_1.isRuntimePathLeak)(abs));
    }
    if (!paths.length)
        return [];
    const snippets = [];
    for (const absPath of paths) {
        try {
            const content = await fs.readFile(absPath, "utf-8");
            const relative = workspaceRoot ? path.relative(workspaceRoot, absPath).replace(/\\/g, "/") : absPath;
            const trimmed = content.length > 8000 ? content.slice(0, 8000) + "\n...[truncated]" : content;
            snippets.push({
                path: relative,
                content: trimmed,
                reason: "Injected from workspace (model attempted read_file)",
            });
        }
        catch {
            // Skip files we can't read
        }
    }
    return snippets;
}
//# sourceMappingURL=pseudo-markup-utils.js.map
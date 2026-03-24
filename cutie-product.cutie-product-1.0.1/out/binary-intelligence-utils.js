"use strict";
/** Aligned with vscode-extension/src/intelligence-utils.ts (retrieval hints for portable bundle API). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeContextPath = normalizeContextPath;
exports.isRuntimePathLeak = isRuntimePathLeak;
exports.buildRetrievalHints = buildRetrievalHints;
function dedupeStrings(values, limit, maxLen = 512) {
    const out = [];
    const seen = new Set();
    for (const item of values) {
        const normalized = String(item || "").trim();
        const key = normalized.toLowerCase();
        if (!normalized || normalized.length > maxLen || seen.has(key))
            continue;
        seen.add(key);
        out.push(normalized);
        if (out.length >= limit)
            break;
    }
    return out;
}
function normalizeContextPath(input) {
    return String(input || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^@+/, "")
        .replace(/^\.\/+/, "")
        .replace(/^\/+/, "")
        .replace(/[),.;:!?]+$/g, "");
}
function isRuntimePathLeak(input) {
    const normalized = normalizeContextPath(input).toLowerCase();
    if (!normalized)
        return false;
    return (normalized.includes(".trae/extensions/") ||
        normalized.includes("playgroundai.xpersona-playground-") ||
        normalized.includes("cutie-product.cutie-product-") ||
        normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
        normalized.includes("node_modules/@qwen-code/sdk/dist/cli/cli.js") ||
        normalized.includes("sdk/dist/cli/cli.js"));
}
function buildRetrievalHints(input) {
    const mentionedPaths = dedupeStrings((input.mentionPaths || [])
        .map((path) => normalizeContextPath(path))
        .filter((path) => path && !isRuntimePathLeak(path)), 12, 260);
    const candidateSymbols = dedupeStrings(input.candidateSymbols || [], 8, 120);
    const candidateErrors = dedupeStrings((input.diagnostics || []).map((item) => String(item?.message || "")).filter(Boolean), 8, 240);
    const preferredTargetPathRaw = normalizeContextPath(input.preferredTargetPath || "");
    const preferredTargetPath = isRuntimePathLeak(preferredTargetPathRaw) ? "" : preferredTargetPathRaw;
    const recentTouchedPaths = dedupeStrings((input.recentTouchedPaths || []).map((path) => normalizeContextPath(path)).filter(Boolean), 12, 260);
    return {
        mentionedPaths,
        candidateSymbols,
        candidateErrors,
        ...(preferredTargetPath ? { preferredTargetPath } : {}),
        ...(recentTouchedPaths.length ? { recentTouchedPaths } : {}),
    };
}
//# sourceMappingURL=binary-intelligence-utils.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeContextPath = normalizeContextPath;
exports.resolveRunProfileFromLegacyParallel = resolveRunProfileFromLegacyParallel;
exports.modelSupportsImages = modelSupportsImages;
exports.buildRetrievalHints = buildRetrievalHints;
exports.buildIndexChunkMetadata = buildIndexChunkMetadata;
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
function resolveRunProfileFromLegacyParallel(input) {
    if (input?.runProfile === "deep_focus" || input?.runProfile === "standard") {
        return input.runProfile;
    }
    return input?.parallel ? "deep_focus" : "standard";
}
function modelSupportsImages(selectedModelAlias, catalog) {
    const selected = String(selectedModelAlias || "").trim().toLowerCase();
    if (!selected)
        return false;
    const match = (catalog || []).find((entry) => String(entry.alias || "").trim().toLowerCase() === selected);
    return match?.capabilities?.supportsImages === true;
}
function buildRetrievalHints(input) {
    const mentionedPaths = dedupeStrings((input.mentionPaths || []).map((path) => normalizeContextPath(path)).filter(Boolean), 12, 260);
    const candidateSymbols = dedupeStrings(input.candidateSymbols || [], 8, 120);
    const candidateErrors = dedupeStrings((input.diagnostics || []).map((item) => String(item?.message || "")).filter(Boolean), 8, 240);
    const preferredTargetPath = normalizeContextPath(input.preferredTargetPath || "");
    const recentTouchedPaths = dedupeStrings((input.recentTouchedPaths || []).map((path) => normalizeContextPath(path)).filter(Boolean), 12, 260);
    return {
        mentionedPaths,
        candidateSymbols,
        candidateErrors,
        ...(preferredTargetPath ? { preferredTargetPath } : {}),
        ...(recentTouchedPaths.length ? { recentTouchedPaths } : {}),
    };
}
function buildIndexChunkMetadata(input) {
    const pathDisplay = normalizeContextPath(input.pathDisplay);
    const pathTokens = dedupeStrings(pathDisplay
        .split("/")
        .flatMap((part) => part.split(/[^A-Za-z0-9_]+/))
        .map((part) => part.trim())
        .filter(Boolean), 24, 80);
    const lines = String(input.content || "")
        .replace(/\r\n/g, "\n")
        .split("\n");
    const symbolNames = dedupeStrings(lines.flatMap((line) => {
        const matches = line.match(/\b(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_][A-Za-z0-9_]*)/g) || [];
        return matches.map((match) => {
            const symbol = /([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(match);
            return symbol?.[1] || "";
        });
    }), 20, 120);
    const headings = dedupeStrings(lines
        .map((line) => line.trim())
        .filter((line) => /^#{1,6}\s+/.test(line))
        .map((line) => line.replace(/^#{1,6}\s+/, "")), 12, 160);
    const summary = lines
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 4)
        .join(" ")
        .slice(0, 280);
    return {
        ...(input.language ? { language: input.language } : {}),
        pathTokens,
        symbolNames,
        headings,
        summary,
        ...(input.source ? { source: input.source } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
    };
}
//# sourceMappingURL=intelligence-utils.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTaskPathReferences = extractTaskPathReferences;
exports.rankWorkspacePathMatches = rankWorkspacePathMatches;
const intelligence_utils_1 = require("./intelligence-utils");
function toPathSegments(value) {
    return (0, intelligence_utils_1.normalizeContextPath)(value)
        .toLowerCase()
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean);
}
function basename(value) {
    const segments = toPathSegments(value);
    return segments[segments.length - 1] || "";
}
function isLikelyPathReference(value) {
    if (!value)
        return false;
    if (/^[a-z]+:\/\//i.test(value))
        return false;
    if (value.length > 260)
        return false;
    return /[./\\]/.test(value);
}
function getLineFromMatch(match) {
    const raw = Number(match[2] || match[3] || 0);
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}
function extractTaskPathReferences(task) {
    const patterns = [
        /@?((?:[A-Za-z0-9_.-]+[\\/])+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_-]+)?)(?::(\d+)|#L(\d+))?/g,
        /@?([A-Za-z0-9_.-]+\.[A-Za-z0-9_-]+)(?::(\d+)|#L(\d+))?/g,
    ];
    const references = [];
    const seen = new Set();
    for (const pattern of patterns) {
        let match = pattern.exec(task);
        while (match) {
            const query = (0, intelligence_utils_1.normalizeContextPath)(match[1] || "");
            if (isLikelyPathReference(query)) {
                const line = getLineFromMatch(match);
                const key = `${query.toLowerCase()}#${line || 0}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    references.push({
                        query,
                        ...(line ? { line } : {}),
                    });
                }
            }
            match = pattern.exec(task);
        }
    }
    const nestedBasenames = new Set(references
        .map((reference) => reference.query)
        .filter((query) => query.includes("/"))
        .map((query) => basename(query)));
    return references
        .filter((reference) => reference.query.includes("/") || !nestedBasenames.has(basename(reference.query)))
        .slice(0, 12);
}
function rankWorkspacePathMatches(query, candidates, options) {
    const normalizedQuery = (0, intelligence_utils_1.normalizeContextPath)(query).toLowerCase();
    const queryBase = basename(normalizedQuery);
    const activePath = (0, intelligence_utils_1.normalizeContextPath)(options?.activePath || "").toLowerCase();
    const openSet = new Set((options?.openFiles || []).map((item) => (0, intelligence_utils_1.normalizeContextPath)(item).toLowerCase()));
    const seen = new Set();
    return candidates
        .map((candidate) => (0, intelligence_utils_1.normalizeContextPath)(candidate))
        .filter(Boolean)
        .filter((candidate) => {
        const key = candidate.toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .map((candidate) => {
        const lower = candidate.toLowerCase();
        const candidateBase = basename(lower);
        let score = 0;
        if (lower === normalizedQuery)
            score += 140;
        if (normalizedQuery && lower.endsWith(`/${normalizedQuery}`))
            score += 120;
        if (candidateBase && candidateBase === queryBase)
            score += 100;
        if (normalizedQuery && lower.includes(normalizedQuery))
            score += 78;
        if (queryBase && lower.includes(queryBase))
            score += 54;
        if (activePath && lower === activePath)
            score += 34;
        if (activePath && candidateBase && basename(activePath) === candidateBase)
            score += 18;
        if (openSet.has(lower))
            score += 14;
        if (openSet.size && candidateBase && Array.from(openSet).some((item) => basename(item) === candidateBase)) {
            score += 8;
        }
        const depthPenalty = Math.max(0, toPathSegments(lower).length - Math.max(1, toPathSegments(normalizedQuery).length));
        score -= Math.min(depthPenalty * 2, 10);
        return { candidate, score };
    })
        .filter((item) => item.score > 0)
        .sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.candidate.length !== b.candidate.length)
            return a.candidate.length - b.candidate.length;
        return a.candidate.localeCompare(b.candidate);
    })
        .map((item) => item.candidate);
}
//# sourceMappingURL=context-utils.js.map
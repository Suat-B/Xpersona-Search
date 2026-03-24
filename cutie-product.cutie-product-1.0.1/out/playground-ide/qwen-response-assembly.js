"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeAssistantResponseText = mergeAssistantResponseText;
function normalizeCandidate(value) {
    return String(value || "").replace(/\r\n/g, "\n").trim();
}
function longestSuffixPrefixOverlap(left, right) {
    const maxOverlap = Math.min(left.length, right.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
        if (left.slice(-size) === right.slice(0, size)) {
            return size;
        }
    }
    return 0;
}
function overlapsAtTextBoundary(left, right, overlap) {
    if (overlap <= 0)
        return false;
    const leftBoundaryChar = left.charAt(left.length - overlap - 1);
    const rightBoundaryChar = right.charAt(overlap);
    const startsAtBoundary = !leftBoundaryChar || /[\s([{"'`-]/.test(leftBoundaryChar);
    const endsAtBoundary = !rightBoundaryChar || /[\s)\]}",'.!?;:`-]/.test(rightBoundaryChar);
    return startsAtBoundary && endsAtBoundary;
}
function shouldMergeByOverlap(left, right, overlap) {
    if (overlap <= 0)
        return false;
    if (overlap >= 24)
        return true;
    if (overlap >= 6 && overlapsAtTextBoundary(left, right, overlap))
        return true;
    return overlap >= Math.floor(Math.min(left.length, right.length) * 0.45);
}
function mergeAssistantResponseText(currentValue, nextValue) {
    const current = normalizeCandidate(currentValue);
    const next = normalizeCandidate(nextValue);
    if (!current)
        return next;
    if (!next)
        return current;
    if (current === next)
        return current;
    if (next.startsWith(current) || next.includes(current)) {
        return next;
    }
    if (current.startsWith(next) || current.includes(next)) {
        return current;
    }
    const forwardOverlap = longestSuffixPrefixOverlap(current, next);
    if (shouldMergeByOverlap(current, next, forwardOverlap)) {
        return `${current}${next.slice(forwardOverlap)}`.trim();
    }
    const reverseOverlap = longestSuffixPrefixOverlap(next, current);
    if (shouldMergeByOverlap(next, current, reverseOverlap)) {
        return `${next}${current.slice(reverseOverlap)}`.trim();
    }
    return `${current}\n\n${next}`.trim();
}
//# sourceMappingURL=qwen-response-assembly.js.map
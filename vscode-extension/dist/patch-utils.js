"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPatchTargetPath = extractPatchTargetPath;
exports.applyUnifiedDiff = applyUnifiedDiff;
function normalizePatchPath(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "/dev/null")
        return null;
    if (trimmed.startsWith("a/") || trimmed.startsWith("b/"))
        return trimmed.slice(2);
    return trimmed;
}
function parsePatch(patchText) {
    const lines = patchText.replace(/\r\n/g, "\n").split("\n");
    let oldPath = null;
    let newPath = null;
    const hunks = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i] || "";
        if (line.startsWith("--- "))
            oldPath = normalizePatchPath(line.slice(4).trim());
        if (line.startsWith("+++ "))
            newPath = normalizePatchPath(line.slice(4).trim());
        if (line.startsWith("@@")) {
            const m = /^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s+@@/.exec(line);
            if (!m)
                return null;
            const hunk = {
                oldStart: Number(m[1] || "1"),
                lines: [],
            };
            i += 1;
            while (i < lines.length) {
                const hline = lines[i] || "";
                if (hline.startsWith("@@"))
                    break;
                if (hline.startsWith("\\ No newline at end of file")) {
                    i += 1;
                    continue;
                }
                const marker = hline[0];
                if (marker === " " || marker === "+" || marker === "-") {
                    hunk.lines.push({ kind: marker, text: hline.slice(1) });
                    i += 1;
                    continue;
                }
                if (hline.startsWith("diff --git ") || hline.startsWith("--- ") || hline.startsWith("+++ "))
                    break;
                return null;
            }
            if (hunk.lines.length === 0)
                return null;
            hunks.push(hunk);
            continue;
        }
        i += 1;
    }
    if (!hunks.length)
        return null;
    return { oldPath, newPath, hunks };
}
function patchHasLineChanges(parsed) {
    return parsed.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "+" || line.kind === "-"));
}
function hunkMatchesAt(sourceLines, start, hunk) {
    let idx = start;
    for (const line of hunk.lines) {
        if (line.kind === "+")
            continue;
        if (idx >= sourceLines.length)
            return false;
        if (sourceLines[idx] !== line.text)
            return false;
        idx += 1;
    }
    return true;
}
function locateHunkStart(sourceLines, expectedStart, hunk) {
    if (hunkMatchesAt(sourceLines, expectedStart, hunk))
        return expectedStart;
    const from = Math.max(0, expectedStart - 6);
    const to = Math.min(sourceLines.length, expectedStart + 6);
    for (let i = from; i <= to; i += 1) {
        if (hunkMatchesAt(sourceLines, i, hunk))
            return i;
    }
    for (let i = 0; i < sourceLines.length; i += 1) {
        if (hunkMatchesAt(sourceLines, i, hunk))
            return i;
    }
    return -1;
}
function extractPatchTargetPath(patchText) {
    const parsed = parsePatch(patchText);
    if (!parsed)
        return null;
    return parsed.newPath || parsed.oldPath || null;
}
function applyUnifiedDiff(originalText, patchText) {
    const parsed = parsePatch(patchText);
    if (!parsed) {
        return {
            status: "rejected_invalid_patch",
            reason: "Patch could not be parsed as unified diff.",
            hunksApplied: 0,
            totalHunks: 0,
            targetPath: null,
        };
    }
    if (!patchHasLineChanges(parsed)) {
        return {
            status: "rejected_invalid_patch",
            reason: "Patch contained no line changes.",
            hunksApplied: 0,
            totalHunks: parsed.hunks.length,
            targetPath: parsed.newPath || parsed.oldPath,
        };
    }
    const sourceLines = originalText.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let cursor = 0;
    let applied = 0;
    for (const hunk of parsed.hunks) {
        const expected = Math.max(0, hunk.oldStart - 1);
        const start = locateHunkStart(sourceLines, expected, hunk);
        if (start < 0) {
            out.push(...sourceLines.slice(cursor));
            return {
                status: applied > 0 ? "partial" : "rejected_invalid_patch",
                reason: applied > 0 ? "Some hunks applied but one hunk could not be matched." : "Hunk context did not match file content.",
                content: applied > 0 ? out.join("\n") : undefined,
                targetPath: parsed.newPath || parsed.oldPath,
                hunksApplied: applied,
                totalHunks: parsed.hunks.length,
            };
        }
        out.push(...sourceLines.slice(cursor, start));
        let idx = start;
        for (const line of hunk.lines) {
            if (line.kind === " ") {
                out.push(sourceLines[idx]);
                idx += 1;
            }
            else if (line.kind === "-") {
                idx += 1;
            }
            else {
                out.push(line.text);
            }
        }
        cursor = idx;
        applied += 1;
    }
    out.push(...sourceLines.slice(cursor));
    return {
        status: "applied",
        content: out.join("\n"),
        targetPath: parsed.newPath || parsed.oldPath,
        hunksApplied: applied,
        totalHunks: parsed.hunks.length,
    };
}
//# sourceMappingURL=patch-utils.js.map
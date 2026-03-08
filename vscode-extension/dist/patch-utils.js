"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchContainsWrappedToolPayload = patchContainsWrappedToolPayload;
exports.textContainsLeakedPatchArtifacts = textContainsLeakedPatchArtifacts;
exports.patchContainsLeakedPatchArtifacts = patchContainsLeakedPatchArtifacts;
exports.extractPatchTargetPath = extractPatchTargetPath;
exports.applyUnifiedDiff = applyUnifiedDiff;
function parseHunkHeader(line) {
    const numbered = /^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s*@@/.exec(line);
    if (numbered) {
        return { oldStart: Number(numbered[1] || "1"), hasExplicitStart: true };
    }
    // Accept apply_patch-style headers like "@@" or "@@ optional context".
    if (/^@@(?:\s.*)?$/.test(line.trim())) {
        return { oldStart: 1, hasExplicitStart: false };
    }
    return null;
}
function normalizePatchPath(raw) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "/dev/null")
        return null;
    let token = trimmed;
    if (token.startsWith('"')) {
        const quoted = /^"((?:\\.|[^"])*)"/.exec(token);
        if (quoted)
            token = quoted[1].replace(/\\"/g, '"');
        else
            token = token.slice(1);
    }
    else {
        const tab = token.indexOf("\t");
        if (tab >= 0)
            token = token.slice(0, tab);
        token = token.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "");
    }
    token = token.trim().replace(/^["']|["']$/g, "");
    if (token.startsWith("a/") || token.startsWith("b/"))
        return token.slice(2);
    return token;
}
function isOmittedPlaceholder(line) {
    const trimmed = line.trim();
    if (!trimmed)
        return false;
    if (/omitted\s+for\s+brevity/i.test(trimmed))
        return true;
    return /^(\/*|#|;)?\s*\.\.\.\s*\[?omitted\s+for\s+brevity\]?\s*\.\.\.\s*$/i.test(trimmed);
}
function normalizePatchText(patchText) {
    const lines = patchText.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inHunk = false;
    for (const raw of lines) {
        const line = raw ?? "";
        if (isOmittedPlaceholder(line)) {
            continue;
        }
        if (line.trim().startsWith("```")) {
            continue;
        }
        if (line.startsWith("@@")) {
            inHunk = true;
            out.push(line);
            continue;
        }
        if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
            out.push(line);
            continue;
        }
        if (inHunk) {
            if (/^\s*[+-]\d+\s+-\d+\s*$/.test(line)) {
                continue;
            }
            const numOnly = /^\s*\d+\s*$/.exec(line);
            if (numOnly) {
                out.push(" ");
                continue;
            }
            const withNum = /^\s*\d+\s+(.*)$/.exec(line);
            if (withNum) {
                const rest = withNum[1] ?? "";
                if (!rest) {
                    out.push(" ");
                    continue;
                }
                const first = rest[0];
                if (first === "+" || first === "-" || first === " ") {
                    out.push(rest);
                    continue;
                }
                out.push(" " + rest);
                continue;
            }
        }
        out.push(line);
    }
    return out.join("\n");
}
function patchContainsWrappedToolPayload(patchText) {
    const normalized = normalizePatchText(patchText).trim();
    if (!normalized)
        return false;
    const directEnvelope = /^\s*\{/.test(normalized) &&
        /"final"\s*:/i.test(normalized) &&
        /("edits"\s*:|"actions"\s*:|"commands"\s*:)/i.test(normalized) &&
        /("path"\s*:|"patch"\s*:)/i.test(normalized);
    if (directEnvelope)
        return true;
    const addedText = normalized
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
        .map((line) => line.slice(1))
        .join("\n")
        .trim();
    if (!addedText)
        return false;
    return (/\{\s*"final"\s*:/i.test(addedText) &&
        /("edits"\s*:|"actions"\s*:|"commands"\s*:)/i.test(addedText) &&
        /("path"\s*:|"patch"\s*:)/i.test(addedText));
}
const PATCH_LEAK_MARKERS = [
    { key: "apply_patch_begin", re: /^\s*\*\*\*\s*Begin Patch\b/i },
    { key: "apply_patch_end", re: /^\s*\*\*\*\s*End Patch\b/i },
    { key: "apply_patch_update", re: /^\s*\*\*\*\s*(Update|Add|Delete)\s+File:\s+/i },
    { key: "diff_git", re: /^\s*diff --git\s+a\/.+\s+b\/.+/i },
    { key: "header_old", re: /^\s*---\s+a\/.+/i },
    { key: "header_new", re: /^\s*\+\+\+\s+b\/.+/i },
    { key: "hunk_header", re: /^\s*@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/ },
];
function collectPatchLeakMarkerKeys(text) {
    const keys = new Set();
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
        for (const marker of PATCH_LEAK_MARKERS) {
            if (marker.re.test(line)) {
                keys.add(marker.key);
            }
        }
    }
    return Array.from(keys);
}
function markerKeysLookLikePatchLeak(keys) {
    if (!keys.length)
        return false;
    const set = new Set(keys);
    if (set.has("apply_patch_begin") || set.has("apply_patch_update"))
        return true;
    if (set.has("diff_git") && (set.has("header_old") || set.has("header_new") || set.has("hunk_header")))
        return true;
    if (set.has("hunk_header") && (set.has("header_old") || set.has("header_new")))
        return true;
    return set.size >= 3;
}
function textContainsLeakedPatchArtifacts(text) {
    const keys = collectPatchLeakMarkerKeys(text);
    return markerKeysLookLikePatchLeak(keys);
}
function patchContainsLeakedPatchArtifacts(patchText) {
    const normalized = normalizePatchText(patchText);
    const addedLines = normalized
        .split("\n")
        .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
        .map((line) => line.slice(1));
    if (!addedLines.length)
        return false;
    const keys = collectPatchLeakMarkerKeys(addedLines.join("\n"));
    return markerKeysLookLikePatchLeak(keys);
}
function parsePatch(patchText) {
    const lines = normalizePatchText(patchText).split("\n");
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
            const parsedHeader = parseHunkHeader(line);
            if (!parsedHeader) {
                i += 1;
                continue;
            }
            const hunk = {
                oldStart: parsedHeader.oldStart,
                hasExplicitStart: parsedHeader.hasExplicitStart,
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
                i += 1;
            }
            if (hunk.lines.length > 0)
                hunks.push(hunk);
            continue;
        }
        i += 1;
    }
    if (!hunks.length) {
        const fallbackLines = [];
        for (const line of lines) {
            if (!line)
                continue;
            if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ "))
                continue;
            const marker = line[0];
            if (marker === " " || marker === "+" || marker === "-") {
                fallbackLines.push({ kind: marker, text: line.slice(1) });
            }
        }
        const hasChange = fallbackLines.some((line) => line.kind === "+" || line.kind === "-");
        const hasAnchor = fallbackLines.some((line) => line.kind === " " || line.kind === "-");
        if (hasChange && hasAnchor) {
            hunks.push({
                oldStart: 1,
                hasExplicitStart: false,
                lines: fallbackLines,
            });
        }
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
function normalizeMatchLine(line) {
    return line.trim();
}
function hunkMatchesAtRelaxed(sourceLines, start, hunk) {
    let idx = start;
    for (const line of hunk.lines) {
        if (line.kind === "+")
            continue;
        if (idx >= sourceLines.length)
            return false;
        if (normalizeMatchLine(sourceLines[idx]) !== normalizeMatchLine(line.text))
            return false;
        idx += 1;
    }
    return true;
}
function findRelaxedUniqueMatch(sourceLines, from, to, hunk) {
    let matchIndex = -1;
    for (let i = from; i <= to; i += 1) {
        if (hunkMatchesAtRelaxed(sourceLines, i, hunk)) {
            if (matchIndex !== -1)
                return -1;
            matchIndex = i;
        }
    }
    return matchIndex;
}
function locateHunkStart(sourceLines, expectedStart, hunk, minStart) {
    const boundedExpected = Math.max(minStart, expectedStart);
    if (hunkMatchesAt(sourceLines, boundedExpected, hunk))
        return boundedExpected;
    const from = Math.max(minStart, boundedExpected - 6);
    const to = Math.min(sourceLines.length, boundedExpected + 6);
    for (let i = from; i <= to; i += 1) {
        if (hunkMatchesAt(sourceLines, i, hunk))
            return i;
    }
    for (let i = minStart; i < sourceLines.length; i += 1) {
        if (hunkMatchesAt(sourceLines, i, hunk))
            return i;
    }
    const relaxedNearby = findRelaxedUniqueMatch(sourceLines, from, to, hunk);
    if (relaxedNearby >= 0)
        return relaxedNearby;
    return findRelaxedUniqueMatch(sourceLines, minStart, Math.max(minStart, sourceLines.length - 1), hunk);
}
function extractPatchTargetPath(patchText) {
    const parsed = parsePatch(patchText);
    if (!parsed)
        return null;
    return parsed.newPath || parsed.oldPath || null;
}
function applyUnifiedDiff(originalText, patchText) {
    if (patchContainsWrappedToolPayload(patchText)) {
        return {
            status: "rejected_invalid_patch",
            reason: "Patch appears to contain wrapped tool payload JSON instead of source-code diff.",
            hunksApplied: 0,
            totalHunks: 0,
            targetPath: null,
        };
    }
    if (patchContainsLeakedPatchArtifacts(patchText)) {
        return {
            status: "rejected_invalid_patch",
            reason: "Patch appears to leak diff/apply_patch markers into file content.",
            hunksApplied: 0,
            totalHunks: 0,
            targetPath: null,
        };
    }
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
        const expected = hunk.hasExplicitStart ? Math.max(cursor, hunk.oldStart - 1) : cursor;
        const start = locateHunkStart(sourceLines, expected, hunk, cursor);
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
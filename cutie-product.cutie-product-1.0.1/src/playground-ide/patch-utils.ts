export type PatchApplyStatus = "applied" | "partial" | "rejected_invalid_patch" | "rejected_path_policy";

type ParsedHunkLine = {
  kind: " " | "+" | "-";
  text: string;
};

type ParsedHunk = {
  oldStart: number;
  hasExplicitStart: boolean;
  lines: ParsedHunkLine[];
};

type ParsedPatch = {
  oldPath: string | null;
  newPath: string | null;
  hunks: ParsedHunk[];
};

function parseHunkHeader(line: string): { oldStart: number; hasExplicitStart: boolean } | null {
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

export type PatchApplyResult = {
  status: PatchApplyStatus;
  content?: string;
  targetPath?: string | null;
  reason?: string;
  hunksApplied: number;
  totalHunks: number;
};

function normalizePatchPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/dev/null") return null;
  let token = trimmed;
  if (token.startsWith('"')) {
    const quoted = /^"((?:\\.|[^"])*)"/.exec(token);
    if (quoted) token = quoted[1].replace(/\\"/g, '"');
    else token = token.slice(1);
  } else {
    const tab = token.indexOf("\t");
    if (tab >= 0) token = token.slice(0, tab);
    token = token.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "");
  }
  token = token.trim().replace(/^["']|["']$/g, "");
  if (token.startsWith("a/") || token.startsWith("b/")) return token.slice(2);
  return token;
}

function isOmittedPlaceholder(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/omitted\s+for\s+brevity/i.test(trimmed)) return true;
  return /^(\/*|#|;)?\s*\.\.\.\s*\[?omitted\s+for\s+brevity\]?\s*\.\.\.\s*$/i.test(trimmed);
}

function normalizePatchText(patchText: string): string {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
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

function hasEnvelopeKey(text: string, keyPattern: string): boolean {
  const re = new RegExp(
    `(?:^|[\\[{,]\\s*)(?:"(?:${keyPattern})"|'(?:${keyPattern})'|(?:${keyPattern}))\\s*:`,
    "i"
  );
  return re.test(text);
}

function looksLikeWrappedToolEnvelope(text: string): boolean {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  if (!/^\s*[\[{]/.test(normalized)) return false;
  const hasFinal = hasEnvelopeKey(normalized, "final");
  const hasCollection = hasEnvelopeKey(normalized, "edits|actions|commands");
  const hasPathOrPatch = hasEnvelopeKey(normalized, "path|patch");
  return hasFinal && hasCollection && hasPathOrPatch;
}

export function patchContainsWrappedToolPayload(patchText: string): boolean {
  const normalized = normalizePatchText(patchText).trim();
  if (!normalized) return false;

  const directEnvelope = looksLikeWrappedToolEnvelope(normalized);
  if (directEnvelope) return true;

  const addedText = normalized
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
    .map((line) => line.slice(1))
    .join("\n")
    .trim();
  if (!addedText) return false;

  return looksLikeWrappedToolEnvelope(addedText);
}

function patchLooksUsable(text: string): boolean {
  const normalized = normalizePatchText(text).trim();
  if (!normalized) return false;
  const parsed = parsePatch(normalized);
  if (!parsed) return false;
  if (!patchHasLineChanges(parsed)) return false;
  if (patchContainsWrappedToolPayload(normalized)) return false;
  if (patchContainsLeakedPatchArtifacts(normalized)) return false;
  return true;
}

function parseJsonStringValue(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
}

function parseSingleQuotedStringValue(value: string): string {
  return value
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function collectPatchCandidatesFromValue(
  value: unknown,
  out: string[],
  seen: Set<string>,
  depth = 0
): void {
  if (depth > 8 || out.length >= 24 || value == null) return;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return;
    const candidates = [raw];
    if (/^"(?:\\.|[^"\\])*"$/.test(raw)) {
      try {
        candidates.push(JSON.parse(raw) as string);
      } catch {
        // ignore malformed quoted string
      }
    }
    for (const candidate of candidates) {
      const normalized = normalizePatchText(candidate).trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      if (patchLooksUsable(normalized)) out.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPatchCandidatesFromValue(entry, out, seen, depth + 1);
      if (out.length >= 24) break;
    }
    return;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const priorityKeys = ["patch", "diff", "content", "text", "payload"];
    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        collectPatchCandidatesFromValue(obj[key], out, seen, depth + 1);
        if (out.length >= 24) return;
      }
    }
    for (const [key, entry] of Object.entries(obj)) {
      if (priorityKeys.includes(key)) continue;
      collectPatchCandidatesFromValue(entry, out, seen, depth + 1);
      if (out.length >= 24) return;
    }
  }
}

function parseJsonCandidate(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const attempts: string[] = [];
  const pushAttempt = (candidate: string) => {
    const next = candidate.trim();
    if (!next) return;
    if (!attempts.includes(next)) attempts.push(next);
  };

  pushAttempt(trimmed);

  const fenced = /^```(?:json|text)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1]) pushAttempt(fenced[1]);

  const deEscaped = trimmed.replace(/\\"/g, '"');
  if (deEscaped !== trimmed) pushAttempt(deEscaped);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    pushAttempt(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // try next shape
    }
  }
  return null;
}

export function recoverUnifiedDiffFromWrappedPayload(patchText: string): string | null {
  const raw = String(patchText || "").trim();
  if (!raw) return null;
  if (patchLooksUsable(raw) && !patchContainsWrappedToolPayload(raw)) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  const parsed = parseJsonCandidate(raw);
  if (parsed != null) {
    collectPatchCandidatesFromValue(parsed, candidates, seen, 0);
  }

  const fieldRegex = /"(?:patch|diff)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  for (const match of raw.matchAll(fieldRegex)) {
    const decoded = parseJsonStringValue(match[1] || "");
    const normalized = normalizePatchText(decoded).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (patchLooksUsable(normalized)) candidates.push(normalized);
  }

  const singleQuotedFieldRegex = /'(?:patch|diff)'\s*:\s*'((?:\\.|[^'\\])*)'/gi;
  for (const match of raw.matchAll(singleQuotedFieldRegex)) {
    const decoded = parseSingleQuotedStringValue(match[1] || "");
    const normalized = normalizePatchText(decoded).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (patchLooksUsable(normalized)) candidates.push(normalized);
  }

  const backtickFieldRegex = /(?:^|[{\s,])(?:patch|diff)\s*:\s*`([\s\S]*?)`/gi;
  for (const match of raw.matchAll(backtickFieldRegex)) {
    const decoded = String(match[1] || "").trim();
    const normalized = normalizePatchText(decoded).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (patchLooksUsable(normalized)) candidates.push(normalized);
  }

  const fencedFieldRegex = /(?:^|[{\s,])(?:patch|diff)\s*:\s*```(?:diff|patch|text)?\s*([\s\S]*?)\s*```/gi;
  for (const match of raw.matchAll(fencedFieldRegex)) {
    const decoded = String(match[1] || "").trim();
    const normalized = normalizePatchText(decoded).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (patchLooksUsable(normalized)) candidates.push(normalized);
  }

  return candidates.length ? candidates[0] : null;
}

const PATCH_LEAK_MARKERS: Array<{ key: string; re: RegExp }> = [
  { key: "apply_patch_begin", re: /^\s*\*\*\*\s*Begin Patch\b/i },
  { key: "apply_patch_end", re: /^\s*\*\*\*\s*End Patch\b/i },
  { key: "apply_patch_update", re: /^\s*\*\*\*\s*(Update|Add|Delete)\s+File:\s+/i },
  { key: "diff_git", re: /^\s*diff --git\s+a\/.+\s+b\/.+/i },
  { key: "header_old", re: /^\s*---\s+a\/.+/i },
  { key: "header_new", re: /^\s*\+\+\+\s+b\/.+/i },
  { key: "hunk_header", re: /^\s*@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/ },
];

function collectPatchLeakMarkerKeys(text: string): string[] {
  const keys = new Set<string>();
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

function markerKeysLookLikePatchLeak(keys: string[]): boolean {
  if (!keys.length) return false;
  const set = new Set(keys);
  if (set.has("apply_patch_begin") || set.has("apply_patch_update")) return true;
  if (set.has("diff_git") && (set.has("header_old") || set.has("header_new") || set.has("hunk_header"))) return true;
  if (set.has("hunk_header") && (set.has("header_old") || set.has("header_new"))) return true;
  return set.size >= 3;
}

export function textContainsLeakedPatchArtifacts(text: string): boolean {
  const keys = collectPatchLeakMarkerKeys(text);
  return markerKeysLookLikePatchLeak(keys);
}

export function patchContainsLeakedPatchArtifacts(patchText: string): boolean {
  const normalized = normalizePatchText(patchText);
  const addedLines = normalized
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
    .map((line) => line.slice(1));
  if (!addedLines.length) return false;
  const keys = collectPatchLeakMarkerKeys(addedLines.join("\n"));
  return markerKeysLookLikePatchLeak(keys);
}

function extractDiffLikeLinesFromLeakedAddedText(addedLines: string[]): string {
  const out: string[] = [];
  let inDiffBody = false;
  for (const raw of addedLines) {
    const line = String(raw || "");
    const trimmed = line.trim();
    if (!trimmed) {
      if (inDiffBody) out.push("");
      continue;
    }
    if (/^\*\*\*\s*Begin Patch\b/i.test(trimmed)) continue;
    if (/^\*\*\*\s*End Patch\b/i.test(trimmed)) continue;
    if (/^\*\*\*\s*(Update|Add|Delete)\s+File:\s+/i.test(trimmed)) continue;
    if (/^\*\*\*\s*Move to:\s+/i.test(trimmed)) continue;

    if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@")) {
      inDiffBody = true;
      out.push(line);
      continue;
    }
    if (inDiffBody && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      out.push(line);
      continue;
    }
  }
  return out.join("\n");
}

export function recoverUnifiedDiffFromLeakedPatchArtifacts(patchText: string): string | null {
  const raw = String(patchText || "").trim();
  if (!raw) return null;
  if (!patchContainsLeakedPatchArtifacts(raw)) return null;

  const normalized = normalizePatchText(raw);
  const addedLines = normalized
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++ "))
    .map((line) => line.slice(1));
  if (!addedLines.length) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidateText: string) => {
    const candidate = normalizePatchText(candidateText).trim();
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    if (patchLooksUsable(candidate)) candidates.push(candidate);
  };

  const diffLikeBody = extractDiffLikeLinesFromLeakedAddedText(addedLines);
  if (diffLikeBody) addCandidate(diffLikeBody);
  if (!candidates.length) addCandidate(addedLines.join("\n"));

  if (!candidates.length && diffLikeBody.startsWith("@@")) {
    const outerParsed = parsePatch(normalized);
    const targetPath = outerParsed?.newPath || outerParsed?.oldPath || null;
    if (targetPath) {
      const withHeaders = [
        `diff --git a/${targetPath} b/${targetPath}`,
        `--- a/${targetPath}`,
        `+++ b/${targetPath}`,
        diffLikeBody,
      ].join("\n");
      addCandidate(withHeaders);
    }
  }

  return candidates.length ? candidates[0] : null;
}

function parsePatch(patchText: string): ParsedPatch | null {
  const lines = normalizePatchText(patchText).split("\n");
  let oldPath: string | null = null;
  let newPath: string | null = null;
  const hunks: ParsedHunk[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] || "";
    if (line.startsWith("--- ")) oldPath = normalizePatchPath(line.slice(4).trim());
    if (line.startsWith("+++ ")) newPath = normalizePatchPath(line.slice(4).trim());
    if (line.startsWith("@@")) {
      const parsedHeader = parseHunkHeader(line);
      if (!parsedHeader) {
        i += 1;
        continue;
      }
      const hunk: ParsedHunk = {
        oldStart: parsedHeader.oldStart,
        hasExplicitStart: parsedHeader.hasExplicitStart,
        lines: [],
      };
      i += 1;
      while (i < lines.length) {
        const hline = lines[i] || "";
        if (hline.startsWith("@@")) break;
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
        if (hline.startsWith("diff --git ") || hline.startsWith("--- ") || hline.startsWith("+++ ")) break;
        i += 1;
      }
      if (hunk.lines.length > 0) hunks.push(hunk);
      continue;
    }
    i += 1;
  }

  if (!hunks.length) {
    const fallbackLines: ParsedHunkLine[] = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) continue;
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

  if (!hunks.length) return null;
  return { oldPath, newPath, hunks };
}

function patchHasLineChanges(parsed: ParsedPatch): boolean {
  return parsed.hunks.some((hunk) => hunk.lines.some((line) => line.kind === "+" || line.kind === "-"));
}

function hunkMatchesAt(sourceLines: string[], start: number, hunk: ParsedHunk): boolean {
  let idx = start;
  for (const line of hunk.lines) {
    if (line.kind === "+") continue;
    if (idx >= sourceLines.length) return false;
    if (sourceLines[idx] !== line.text) return false;
    idx += 1;
  }
  return true;
}

function locateHunkStart(sourceLines: string[], expectedStart: number, hunk: ParsedHunk, minStart: number): number {
  const boundedExpected = Math.max(minStart, expectedStart);
  if (hunkMatchesAt(sourceLines, boundedExpected, hunk)) return boundedExpected;

  const from = Math.max(minStart, boundedExpected - 6);
  const to = Math.min(sourceLines.length, boundedExpected + 6);
  for (let i = from; i <= to; i += 1) {
    if (hunkMatchesAt(sourceLines, i, hunk)) return i;
  }
  for (let i = minStart; i < sourceLines.length; i += 1) {
    if (hunkMatchesAt(sourceLines, i, hunk)) return i;
  }
  return -1;
}

/**
 * True when the patch has ---/+++ paths or every hunk uses line-numbered @@ headers.
 * Bare @@ hunks default to line 1 and previously paired with trim-relaxed matching risks.
 */
export function isPatchSafelyAnchoredForExistingFile(patchText: string): boolean {
  const wrapped = recoverUnifiedDiffFromWrappedPayload(patchText);
  const leaked = recoverUnifiedDiffFromLeakedPatchArtifacts(wrapped || patchText);
  const patchToApply = leaked || wrapped || patchText;
  const normalized = normalizePatchText(patchToApply).trim();
  if (!normalized) return false;
  const parsed = parsePatch(normalized);
  if (!parsed?.hunks.length) return false;
  if (parsed.oldPath && parsed.newPath) return true;
  return parsed.hunks.every((h) => h.hasExplicitStart);
}

export function extractPatchTargetPath(patchText: string): string | null {
  const wrapped = recoverUnifiedDiffFromWrappedPayload(patchText);
  const leaked = recoverUnifiedDiffFromLeakedPatchArtifacts(wrapped || patchText);
  const parsed = parsePatch(leaked || wrapped || patchText);
  if (!parsed) return null;
  return parsed.newPath || parsed.oldPath || null;
}

export function applyUnifiedDiff(originalText: string, patchText: string): PatchApplyResult {
  const wrapped = recoverUnifiedDiffFromWrappedPayload(patchText);
  const leaked = recoverUnifiedDiffFromLeakedPatchArtifacts(wrapped || patchText);
  const patchToApply = leaked || wrapped || patchText;
  if (patchContainsWrappedToolPayload(patchToApply)) {
    return {
      status: "rejected_invalid_patch",
      reason: "Patch appears to contain wrapped tool payload JSON instead of source-code diff.",
      hunksApplied: 0,
      totalHunks: 0,
      targetPath: null,
    };
  }
  if (patchContainsLeakedPatchArtifacts(patchToApply)) {
    return {
      status: "rejected_invalid_patch",
      reason: "Patch appears to leak diff/apply_patch markers into file content.",
      hunksApplied: 0,
      totalHunks: 0,
      targetPath: null,
    };
  }
  const parsed = parsePatch(patchToApply);
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
  const out: string[] = [];
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
      } else if (line.kind === "-") {
        idx += 1;
      } else {
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

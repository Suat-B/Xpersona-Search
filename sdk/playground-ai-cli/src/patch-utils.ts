export type PatchApplyStatus = "applied" | "partial" | "rejected_invalid_patch";

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

export type PatchApplyResult = {
  status: PatchApplyStatus;
  content?: string;
  targetPath?: string | null;
  reason?: string;
  hunksApplied: number;
  totalHunks: number;
};

function parseHunkHeader(line: string): { oldStart: number; hasExplicitStart: boolean } | null {
  const numbered = /^@@\s+-([0-9]+)(?:,([0-9]+))?\s+\+([0-9]+)(?:,([0-9]+))?\s*@@/.exec(line);
  if (numbered) {
    return { oldStart: Number(numbered[1] || "1"), hasExplicitStart: true };
  }
  if (/^@@(?:\s.*)?$/.test(line.trim())) {
    return { oldStart: 1, hasExplicitStart: false };
  }
  return null;
}

function normalizePatchPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/dev/null") return null;
  let token = trimmed;
  if (token.startsWith("a/") || token.startsWith("b/")) token = token.slice(2);
  return token.replace(/^["']|["']$/g, "").trim() || null;
}

function normalizePatchText(patchText: string): string {
  return String(patchText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !line.trim().startsWith("```"))
    .join("\n");
}

function parsePatch(patchText: string): ParsedPatch | null {
  const lines = normalizePatchText(patchText).split("\n");
  let oldPath: string | null = null;
  let newPath: string | null = null;
  const hunks: ParsedHunk[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] || "";
    if (line.startsWith("--- ")) oldPath = normalizePatchPath(line.slice(4));
    if (line.startsWith("+++ ")) newPath = normalizePatchPath(line.slice(4));
    if (!line.startsWith("@@")) {
      i += 1;
      continue;
    }

    const header = parseHunkHeader(line);
    if (!header) {
      i += 1;
      continue;
    }

    const hunk: ParsedHunk = {
      oldStart: header.oldStart,
      hasExplicitStart: header.hasExplicitStart,
      lines: [],
    };
    i += 1;
    while (i < lines.length) {
      const hunkLine = lines[i] || "";
      if (hunkLine.startsWith("@@")) break;
      if (hunkLine.startsWith("\\ No newline at end of file")) {
        i += 1;
        continue;
      }
      if (hunkLine.startsWith("diff --git ") || hunkLine.startsWith("--- ") || hunkLine.startsWith("+++ ")) break;
      const marker = hunkLine[0];
      if (marker === " " || marker === "+" || marker === "-") {
        hunk.lines.push({ kind: marker, text: hunkLine.slice(1) });
      }
      i += 1;
    }
    if (hunk.lines.length) hunks.push(hunk);
  }

  if (!hunks.length) return null;
  return { oldPath, newPath, hunks };
}

function hunkHasChanges(hunk: ParsedHunk): boolean {
  return hunk.lines.some((line) => line.kind === "+" || line.kind === "-");
}

function hunkMatchesAt(sourceLines: string[], start: number, hunk: ParsedHunk): boolean {
  let index = start;
  for (const line of hunk.lines) {
    if (line.kind === "+") continue;
    if (index >= sourceLines.length) return false;
    if (sourceLines[index] !== line.text) return false;
    index += 1;
  }
  return true;
}

function locateHunkStart(sourceLines: string[], expectedStart: number, hunk: ParsedHunk, minStart: number): number {
  const preferred = Math.max(minStart, expectedStart);
  if (hunkMatchesAt(sourceLines, preferred, hunk)) return preferred;

  const nearbyFrom = Math.max(minStart, preferred - 6);
  const nearbyTo = Math.min(sourceLines.length, preferred + 6);
  for (let i = nearbyFrom; i <= nearbyTo; i += 1) {
    if (hunkMatchesAt(sourceLines, i, hunk)) return i;
  }
  for (let i = minStart; i < sourceLines.length; i += 1) {
    if (hunkMatchesAt(sourceLines, i, hunk)) return i;
  }
  return -1;
}

export function applyUnifiedDiff(originalText: string, patchText: string): PatchApplyResult {
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

  if (!parsed.hunks.some(hunkHasChanges)) {
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
    let index = start;
    for (const line of hunk.lines) {
      if (line.kind === " ") {
        out.push(sourceLines[index]);
        index += 1;
      } else if (line.kind === "-") {
        index += 1;
      } else {
        out.push(line.text);
      }
    }
    cursor = index;
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

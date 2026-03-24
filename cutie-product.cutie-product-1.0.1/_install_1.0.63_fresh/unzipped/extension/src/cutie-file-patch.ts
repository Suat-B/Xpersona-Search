import { createHash } from "crypto";

export type CutieLineEdit = {
  startLine: number;
  deleteLineCount: number;
  replacement: string;
};

function normalizeText(text: string): { normalized: string; eol: "\r\n" | "\n"; hadTrailingNewline: boolean } {
  const raw = String(text || "");
  return {
    normalized: raw.replace(/\r\n/g, "\n"),
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
    hadTrailingNewline: /\r?\n$/.test(raw),
  };
}

function splitIntoLines(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split("\n");
}

function stripTerminalEmptyLine(lines: string[], hadTrailingNewline: boolean): string[] {
  if (!hadTrailingNewline) return lines;
  if (!lines.length) return lines;
  if (lines[lines.length - 1] !== "") return lines;
  return lines.slice(0, -1);
}

function joinWithOriginalStyle(lines: string[], eol: "\r\n" | "\n", hadTrailingNewline: boolean): string {
  const body = lines.join(eol);
  if (hadTrailingNewline && lines.length > 0) {
    return `${body}${eol}`;
  }
  return body;
}

export function computeWorkspaceRevisionId(text: string, existed = true): string {
  if (!existed) return "missing";
  return `sha1:${createHash("sha1").update(String(text || ""), "utf8").digest("hex")}`;
}

export function applyLineEditsToText(
  before: string,
  edits: CutieLineEdit[]
): { after: string; changedLineCount: number } {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error("patch_file requires at least one line edit.");
  }

  const { normalized, eol, hadTrailingNewline } = normalizeText(before);
  const originalLines = stripTerminalEmptyLine(splitIntoLines(normalized), hadTrailingNewline);
  const nextLines = [...originalLines];

  let lastEnd = 0;
  let delta = 0;
  let changedLineCount = 0;

  for (const edit of edits) {
    const startLine = Number(edit.startLine);
    const deleteLineCount = Number(edit.deleteLineCount);
    if (!Number.isInteger(startLine) || startLine < 1) {
      throw new Error("patch_file edits must use a 1-based integer startLine.");
    }
    if (!Number.isInteger(deleteLineCount) || deleteLineCount < 0) {
      throw new Error("patch_file edits must use a non-negative integer deleteLineCount.");
    }

    const startIndex = startLine - 1;
    const endIndex = startIndex + deleteLineCount;
    if (startIndex < lastEnd) {
      throw new Error("patch_file edits must be in ascending order and must not overlap.");
    }
    if (startIndex > originalLines.length) {
      throw new Error("patch_file startLine is past the end of the current file.");
    }
    if (endIndex > originalLines.length) {
      throw new Error("patch_file delete range exceeds the current file length.");
    }

    const replacementNormalized = String(edit.replacement ?? "").replace(/\r\n/g, "\n");
    const replacementLines =
      replacementNormalized === "" ? [] : stripTerminalEmptyLine(splitIntoLines(replacementNormalized), /\n$/.test(replacementNormalized));

    const runtimeStart = startIndex + delta;
    const runtimeDeleteCount = deleteLineCount;
    nextLines.splice(runtimeStart, runtimeDeleteCount, ...replacementLines);

    lastEnd = endIndex;
    delta += replacementLines.length - deleteLineCount;
    changedLineCount += deleteLineCount + replacementLines.length;
  }

  return {
    after: joinWithOriginalStyle(nextLines, eol, hadTrailingNewline),
    changedLineCount,
  };
}

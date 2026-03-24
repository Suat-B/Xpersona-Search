/** Aligned with vscode-extension/src/intelligence-utils.ts (retrieval hints for portable bundle API). */

import type { RetrievalHints } from "./binary-types";

export type RetrievalHintsInput = {
  mentionPaths?: string[];
  candidateSymbols?: string[];
  diagnostics?: Array<{ message?: string }>;
  preferredTargetPath?: string;
  recentTouchedPaths?: string[];
};

function dedupeStrings(values: Iterable<string>, limit: number, maxLen = 512): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const normalized = String(item || "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length > maxLen || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeContextPath(input: string | null | undefined): string {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/[),.;:!?]+$/g, "");
}

export function isRuntimePathLeak(input: string | null | undefined): boolean {
  const normalized = normalizeContextPath(input).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes(".trae/extensions/") ||
    normalized.includes("playgroundai.xpersona-playground-") ||
    normalized.includes("cutie-product.cutie-product-") ||
    normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
    normalized.includes("node_modules/@qwen-code/sdk/dist/cli/cli.js") ||
    normalized.includes("sdk/dist/cli/cli.js")
  );
}

export function buildRetrievalHints(input: RetrievalHintsInput): RetrievalHints {
  const mentionedPaths = dedupeStrings(
    (input.mentionPaths || [])
      .map((path) => normalizeContextPath(path))
      .filter((path) => path && !isRuntimePathLeak(path)),
    12,
    260
  );
  const candidateSymbols = dedupeStrings(input.candidateSymbols || [], 8, 120);
  const candidateErrors = dedupeStrings(
    (input.diagnostics || []).map((item) => String(item?.message || "")).filter(Boolean),
    8,
    240
  );
  const preferredTargetPathRaw = normalizeContextPath(input.preferredTargetPath || "");
  const preferredTargetPath = isRuntimePathLeak(preferredTargetPathRaw) ? "" : preferredTargetPathRaw;
  const recentTouchedPaths = dedupeStrings(
    (input.recentTouchedPaths || []).map((path) => normalizeContextPath(path)).filter(Boolean),
    12,
    260
  );
  return {
    mentionedPaths,
    candidateSymbols,
    candidateErrors,
    ...(preferredTargetPath ? { preferredTargetPath } : {}),
    ...(recentTouchedPaths.length ? { recentTouchedPaths } : {}),
  };
}

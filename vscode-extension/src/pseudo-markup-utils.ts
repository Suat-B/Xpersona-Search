import * as fs from "fs/promises";
import * as path from "path";
import { isRuntimePathLeak } from "./intelligence-utils";

/**
 * Extracts read_file paths from pseudo tool-call markup in assistant text.
 * Returns only paths that are within the workspace and not runtime/extension paths.
 */
export function extractReadFilePathsFromPseudoMarkup(
  text: string,
  workspaceRoot: string | null
): string[] {
  const source = String(text || "");
  if (!source || !workspaceRoot) return [];

  const toolCallMatches = Array.from(
    source.matchAll(/<tool_call>[\s\S]*?<function=([A-Za-z0-9_.:-]+)>[\s\S]*?<\/tool_call>/gi)
  );
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const match of toolCallMatches) {
    const toolName = String(match[1] || "").trim().toLowerCase();
    if (toolName !== "read_file") continue;

    const block = String(match[0] || "");
    const paramMatches = block.matchAll(
      /<parameter=(?:path|absolute_path|file_path)\s*>([\s\S]*?)<\/parameter>/gi
    );
    for (const m of paramMatches) {
      const rawPath = String(m[1] || "").trim();
      if (!rawPath) continue;
      if (isRuntimePathLeak(rawPath)) continue;

      const normalized = rawPath.replace(/\\/g, "/").trim();
      let absPath: string | null = null;
      const wrNormalized = workspaceRoot.replace(/\\/g, "/");
      if (path.isAbsolute(normalized)) {
        if (normalized.toLowerCase().startsWith(wrNormalized.toLowerCase())) {
          absPath = path.resolve(normalized);
        }
      } else {
        absPath = path.join(workspaceRoot, normalized);
      }
      if (absPath && !seen.has(absPath)) {
        seen.add(absPath);
        paths.push(absPath);
      }
    }
  }
  return paths;
}

/**
 * Reads workspace files from pseudo markup and returns snippets for context injection.
 * When the model tried to read extension paths (filtered out), falls back to resolved workspace files.
 */
export async function augmentContextFromPseudoMarkup(
  assistantText: string,
  workspaceRoot: string | null,
  fallbackPaths?: string[]
): Promise<Array<{ path: string; content: string; reason: string }>> {
  let paths = extractReadFilePathsFromPseudoMarkup(assistantText, workspaceRoot);
  if (!paths.length && fallbackPaths?.length && workspaceRoot) {
    paths = fallbackPaths
      .map((p) => path.join(workspaceRoot, p.replace(/\\/g, "/")))
      .filter((abs) => !isRuntimePathLeak(abs));
  }
  if (!paths.length) return [];

  const snippets: Array<{ path: string; content: string; reason: string }> = [];
  for (const absPath of paths) {
    try {
      const content = await fs.readFile(absPath, "utf-8");
      const relative = workspaceRoot ? path.relative(workspaceRoot, absPath).replace(/\\/g, "/") : absPath;
      const trimmed = content.length > 8000 ? content.slice(0, 8000) + "\n...[truncated]" : content;
      snippets.push({
        path: relative,
        content: trimmed,
        reason: "Injected from workspace (model attempted read_file)",
      });
    } catch {
      // Skip files we can't read
    }
  }
  return snippets;
}

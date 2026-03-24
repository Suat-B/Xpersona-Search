/**
 * Context + retrievalHints for portable bundle create, aligned with Binary IDE ContextCollector.collect
 * (without cloud index — resolves path references against open tabs, active file, and workspace file search).
 */
import * as vscode from "vscode";
import type { BinaryContextPayload, RetrievalHints } from "./binary-types";
import { buildRetrievalHints, normalizeContextPath, isRuntimePathLeak } from "./binary-intelligence-utils";
import { extractTaskPathReferences, rankWorkspacePathMatches } from "./binary-context-path";
import { classifyIntent, type IntentKind } from "./binary-intent";
import { getWorkspaceRootPath, toWorkspaceRelativePath } from "./config";

function truncate(text: string | undefined, limit: number): string | undefined {
  const value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value) return undefined;
  return value.slice(0, limit);
}

function uniquePaths(values: Iterable<string>, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeContextPath(value);
    const key = normalized.toLowerCase();
    if (!normalized || isRuntimePathLeak(normalized) || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function refersToCurrentWorkspaceContext(task: string): boolean {
  const normalized = String(task || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\b(current|existing|open)\s+(file|files|plan|doc|document|tab|tabs|integration plan)\b/.test(normalized) ||
    /\b(this|these)\s+(file|files|plan|doc|document|tab|tabs)\b/.test(normalized) ||
    /\b(continue|keep working|expand on|elaborate on|build on)\b/.test(normalized)
  );
}

function extractMentionPaths(task: string): string[] {
  const matches = task.match(/@([A-Za-z0-9_./-]+)/g) || [];
  return matches
    .map((value) => normalizeContextPath(value))
    .filter((value) => value && !isRuntimePathLeak(value))
    .slice(0, 12);
}

function extractCandidateSymbols(task: string): string[] {
  const symbols = task.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) || [];
  return Array.from(new Set(symbols)).slice(0, 8);
}

type OpenWorkspaceFile = {
  path: string;
  language?: string;
  excerpt?: string;
};

async function findWorkspacePathsMatchingBasename(basenameQuery: string): Promise<string[]> {
  const root = getWorkspaceRootPath();
  if (!root || !basenameQuery.trim()) return [];
  const pattern = `**/${basenameQuery.replace(/[\\*?[\]]/g, "")}`;
  try {
    const uris = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,dist,build,out,.next}/**", 40);
    return uris
      .map((u) => toWorkspaceRelativePath(u))
      .filter((p): p is string => Boolean(p))
      .filter((p) => !isRuntimePathLeak(p));
  } catch {
    return [];
  }
}

async function resolveTaskFiles(input: {
  task: string;
  activePath: string | null;
  openFiles: OpenWorkspaceFile[];
  attachedFiles: string[];
  memoryFiles: string[];
}): Promise<{
  explicitReferenceCount: number;
  resolvedTaskFiles: Array<{ path: string; line?: number; reason: string }>;
  candidateFiles: string[];
}> {
  const references = extractTaskPathReferences(input.task);
  const openPaths = input.openFiles.map((file) => file.path);
  let baseCandidates = uniquePaths(
    [...input.attachedFiles, input.activePath || "", ...openPaths, ...input.memoryFiles],
    40
  );

  const resolved: Array<{ path: string; line?: number; reason: string }> = [];
  const candidateFiles: string[] = [];
  const seenResolved = new Set<string>();

  for (const reference of references) {
    let ranked = rankWorkspacePathMatches(reference.query, baseCandidates, {
      activePath: input.activePath || undefined,
      openFiles: openPaths,
      memoryFiles: input.memoryFiles,
    });
    if (!ranked.length) {
      const base = reference.query.split("/").pop() || reference.query;
      const extra = await findWorkspacePathsMatchingBasename(base);
      ranked = rankWorkspacePathMatches(reference.query, [...baseCandidates, ...extra], {
        activePath: input.activePath || undefined,
        openFiles: openPaths,
        memoryFiles: input.memoryFiles,
      });
    }
    candidateFiles.push(...ranked.slice(0, 3));
    const bestMatch = ranked[0];
    if (!bestMatch) continue;
    const key = bestMatch.toLowerCase();
    if (seenResolved.has(key)) continue;
    seenResolved.add(key);
    resolved.push({
      path: bestMatch,
      ...(reference.line ? { line: reference.line } : {}),
      reason: `Matched "${reference.query}" from the user's request`,
    });
    if (resolved.length >= 6) break;
  }

  return {
    explicitReferenceCount: references.length,
    resolvedTaskFiles: resolved,
    candidateFiles: uniquePaths(candidateFiles, 8),
  };
}

function collectOpenFiles(): OpenWorkspaceFile[] {
  return vscode.window.visibleTextEditors
    .map<OpenWorkspaceFile | null>((editor) => {
      const relativePath = toWorkspaceRelativePath(editor.document.uri);
      if (!relativePath) return null;
      return {
        path: relativePath,
        language: editor.document.languageId,
        excerpt: truncate(editor.document.getText(), 5_000),
      };
    })
    .filter((item): item is OpenWorkspaceFile => item !== null)
    .slice(0, 6);
}

export async function gatherPortableBundleContext(input: {
  intentText: string;
  recentTouchedPaths: string[];
}): Promise<{ context: BinaryContextPayload; retrievalHints: RetrievalHints }> {
  const task = String(input.intentText || "").trim();
  const activeEditor = vscode.window.activeTextEditor;
  const activePath = activeEditor ? toWorkspaceRelativePath(activeEditor.document.uri) : null;
  const openFiles = collectOpenFiles();
  const attachedFiles: string[] = [];
  const attachedSelection = null;
  const memoryFiles: string[] = [];
  const intent: IntentKind = classifyIntent(task);

  const diagnostics = vscode.languages
    .getDiagnostics()
    .flatMap(([uri, entries]) =>
      entries.map((entry) => ({
        file: toWorkspaceRelativePath(uri) || undefined,
        severity: entry.severity,
        message: entry.message,
        line: entry.range.start.line + 1,
      }))
    )
    .slice(0, 40);

  const resolvedTaskState = await resolveTaskFiles({
    task,
    activePath,
    openFiles,
    attachedFiles,
    memoryFiles,
  });

  let inferredAttached = attachedFiles;
  const shouldInferActiveFileForEdit =
    intent === "change" &&
    Boolean(activePath) &&
    !inferredAttached.length &&
    !attachedSelection &&
    resolvedTaskState.explicitReferenceCount === 0;

  const shouldInferActiveFileForCurrentContext =
    intent !== "find" &&
    Boolean(activePath) &&
    !inferredAttached.length &&
    !attachedSelection &&
    resolvedTaskState.explicitReferenceCount === 0 &&
    refersToCurrentWorkspaceContext(task);

  if (shouldInferActiveFileForEdit && activePath) {
    inferredAttached = uniquePaths([activePath, ...inferredAttached], 4);
  }
  if (shouldInferActiveFileForCurrentContext && activePath) {
    inferredAttached = uniquePaths([activePath, ...inferredAttached], 4);
  }

  let resolvedFiles = uniquePaths(
    [
      ...inferredAttached,
      ...resolvedTaskState.resolvedTaskFiles.map((item) => item.path),
    ],
    8
  );

  let candidateFiles = uniquePaths(
    [
      ...resolvedTaskState.candidateFiles,
      activePath || "",
      ...inferredAttached,
      ...openFiles.map((item) => item.path),
      ...memoryFiles,
    ],
    8
  );

  if (!resolvedFiles.length && intent === "change" && inferredAttached.length === 1) {
    resolvedFiles = inferredAttached.slice(0, 1);
  }

  if (!resolvedFiles.length && intent === "change" && candidateFiles.length === 1) {
    resolvedFiles = candidateFiles.slice(0, 1);
  }

  if (!resolvedFiles.length && intent === "change" && activePath && candidateFiles.length === 0) {
    resolvedFiles = [activePath];
    candidateFiles = [activePath];
  }

  if (!candidateFiles.length) {
    candidateFiles = uniquePaths([activePath || "", ...openFiles.map((item) => item.path), ...memoryFiles], 8);
  }

  const mentionPaths = extractMentionPaths(task);
  const retrievalHints = buildRetrievalHints({
    mentionPaths: [
      ...mentionPaths,
      ...inferredAttached,
      ...resolvedFiles,
      ...memoryFiles,
    ],
    candidateSymbols: extractCandidateSymbols(task),
    diagnostics,
    preferredTargetPath:
      inferredAttached[0] || resolvedFiles[0] || activePath || undefined,
    recentTouchedPaths: input.recentTouchedPaths,
  });

  const activeFileContext =
    activeEditor && activePath
      ? {
          path: activePath,
          language: activeEditor.document.languageId,
          ...(activeEditor.selection.isEmpty
            ? { content: truncate(activeEditor.document.getText(), 16_000) }
            : {
                selection: truncate(
                  activeEditor.document.getText(activeEditor.selection),
                  12_000
                ),
              }),
        }
      : undefined;

  const context: BinaryContextPayload = {
    ...(activeFileContext ? { activeFile: activeFileContext } : {}),
    ...(openFiles.length ? { openFiles } : {}),
  };

  return { context, retrievalHints };
}

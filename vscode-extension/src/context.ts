import * as vscode from "vscode";
import { extractTaskPathReferences, rankWorkspacePathMatches } from "./context-utils";
import { buildRetrievalHints, normalizeContextPath } from "./intelligence-utils";
import { toAbsoluteWorkspacePath, toWorkspaceRelativePath } from "./config";
import { CloudIndexManager } from "./indexer";
import type { AssistContext, ContextPreview, RetrievalHints } from "./shared";

type OpenWorkspaceFile = {
  path: string;
  language: string;
  excerpt?: string;
};

type ResolvedTaskFile = {
  path: string;
  line?: number;
  reason: string;
};

type IndexedSnippet = NonNullable<AssistContext["indexedSnippets"]>[number];

function truncate(text: string | undefined, limit: number): string | undefined {
  const value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value) return undefined;
  return value.slice(0, limit);
}

function extractMentionPaths(task: string): string[] {
  const matches = task.match(/@([A-Za-z0-9_./-]+)/g) || [];
  return matches
    .map((value) => normalizeContextPath(value))
    .filter(Boolean)
    .slice(0, 12);
}

function extractCandidateSymbols(task: string): string[] {
  const symbols = task.match(/\b[A-Z][A-Za-z0-9_]{2,}\b/g) || [];
  return Array.from(new Set(symbols)).slice(0, 8);
}

function uniquePaths(values: Iterable<string>, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeContextPath(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

async function readWorkspaceSnippet(target: ResolvedTaskFile): Promise<IndexedSnippet | null> {
  const absolutePath = toAbsoluteWorkspacePath(target.path);
  if (!absolutePath) return null;

  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
    const raw = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    let content = raw;

    if (target.line) {
      const start = Math.max(1, target.line - 25);
      const end = Math.min(lines.length, target.line + 25);
      content = lines.slice(start - 1, end).join("\n");
      return {
        path: target.path,
        content: truncate(content, 6_000) || "",
        source: "local_fallback",
        reason: `${target.reason} near line ${target.line}`,
      };
    }

    content = lines.slice(0, 180).join("\n");
    return {
      path: target.path,
      content: truncate(content, 6_000) || "",
      source: "local_fallback",
      reason: target.reason,
    };
  } catch {
    return null;
  }
}

export class ContextCollector {
  constructor(private readonly indexManager: CloudIndexManager) {}

  private collectOpenFiles(): OpenWorkspaceFile[] {
    const items = vscode.window.visibleTextEditors
      .map<OpenWorkspaceFile | null>((editor) => {
        const relativePath = toWorkspaceRelativePath(editor.document.uri);
        if (!relativePath) return null;
        return {
          path: relativePath,
          language: editor.document.languageId,
          excerpt: truncate(editor.document.getText(), 5_000),
        };
      })
      .filter((item): item is OpenWorkspaceFile => item !== null);
    return items.slice(0, 6);
  }

  private async resolveTaskFiles(task: string, activePath: string | null, openFiles: OpenWorkspaceFile[]): Promise<ResolvedTaskFile[]> {
    const references = extractTaskPathReferences(task);
    if (!references.length) return [];

    const openPaths = openFiles.map((file) => file.path);
    const resolved: ResolvedTaskFile[] = [];
    const seen = new Set<string>();

    for (const reference of references) {
      const localCandidates = uniquePaths(
        [activePath || "", ...openPaths].filter((candidate) => {
          const normalizedCandidate = normalizeContextPath(candidate).toLowerCase();
          const normalizedQuery = normalizeContextPath(reference.query).toLowerCase();
          const candidateBase = normalizedCandidate.split("/").pop() || normalizedCandidate;
          const queryBase = normalizedQuery.split("/").pop() || normalizedQuery;
          return (
            normalizedCandidate === normalizedQuery ||
            normalizedCandidate.endsWith(`/${normalizedQuery}`) ||
            candidateBase === queryBase
          );
        }),
        12
      );
      const suggestionCandidates = await this.indexManager.getMentionSuggestions(reference.query);
      const ranked = rankWorkspacePathMatches(reference.query, [...localCandidates, ...suggestionCandidates], {
        activePath: activePath || undefined,
        openFiles: openPaths,
      });
      const bestMatch = ranked[0];
      if (!bestMatch) continue;

      const key = bestMatch.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      resolved.push({
        path: bestMatch,
        ...(reference.line ? { line: reference.line } : {}),
        reason: `Matched "${reference.query}" from the user's request`,
      });
      if (resolved.length >= 6) break;
    }

    return resolved;
  }

  async collect(task: string, recentTouchedPaths: string[]): Promise<{
    context: AssistContext;
    retrievalHints: RetrievalHints;
    preview: ContextPreview;
  }> {
    const activeEditor = vscode.window.activeTextEditor;
    const activePath = activeEditor ? toWorkspaceRelativePath(activeEditor.document.uri) : null;
    const openFiles = this.collectOpenFiles();
    const mentionPaths = extractMentionPaths(task);
    const resolvedTaskFiles = await this.resolveTaskFiles(task, activePath, openFiles);
    const resolvedPaths = resolvedTaskFiles.map((item) => item.path);
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
    const retrievalHints = buildRetrievalHints({
      mentionPaths: [...mentionPaths, ...resolvedPaths],
      candidateSymbols: extractCandidateSymbols(task),
      diagnostics,
      preferredTargetPath: mentionPaths[0] || resolvedPaths[0] || activePath || undefined,
      recentTouchedPaths,
    });

    const indexedSnippets = await this.indexManager.query(task, retrievalHints);
    const explicitTargetSnippets: IndexedSnippet[] = (
      await Promise.all(
        resolvedTaskFiles
          .filter((item) => !indexedSnippets.some((snippet) => snippet.path === item.path))
          .map((item) => readWorkspaceSnippet(item))
      )
    ).filter((item): item is IndexedSnippet => Boolean(item && item.content));

    const combinedSnippets: IndexedSnippet[] = [...explicitTargetSnippets, ...indexedSnippets].slice(0, 10);

    const context: AssistContext = {
      ...(activeEditor && activePath
        ? {
            activeFile: {
              path: activePath,
              language: activeEditor.document.languageId,
              ...(activeEditor.selection.isEmpty
                ? { content: truncate(activeEditor.document.getText(), 16_000) }
                : { selection: truncate(activeEditor.document.getText(activeEditor.selection), 12_000) }),
            },
          }
        : {}),
      ...(openFiles.length ? { openFiles } : {}),
      ...(diagnostics.length ? { diagnostics } : {}),
      ...(combinedSnippets.length ? { indexedSnippets: combinedSnippets } : {}),
    };

    return {
      context,
      retrievalHints,
      preview: {
        ...(activePath ? { activeFile: activePath } : {}),
        openFiles: openFiles.map((item) => item.path),
        resolvedFiles: resolvedPaths.slice(0, 8),
        selectedFiles: combinedSnippets
          .map((item) => item.path)
          .filter((value): value is string => Boolean(value))
          .slice(0, 8),
        diagnostics: diagnostics
          .map((item) => `${item.file || "workspace"}:${item.line || 1} ${item.message}`)
          .slice(0, 8),
        snippets: combinedSnippets
          .map((item) => ({
            path: item.path || "workspace",
            source: item.source || "local_fallback",
            reason: item.reason || "Workspace snippet",
          }))
          .slice(0, 6),
      },
    };
  }

  async getMentionSuggestions(query: string): Promise<string[]> {
    return this.indexManager.getMentionSuggestions(query);
  }
}

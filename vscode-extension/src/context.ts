import * as vscode from "vscode";
import { buildRetrievalHints, normalizeContextPath } from "./intelligence-utils";
import { toWorkspaceRelativePath } from "./config";
import { CloudIndexManager } from "./indexer";
import type { AssistContext, ContextPreview, RetrievalHints } from "./shared";

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

export class ContextCollector {
  constructor(private readonly indexManager: CloudIndexManager) {}

  async collect(task: string, recentTouchedPaths: string[]): Promise<{
    context: AssistContext;
    retrievalHints: RetrievalHints;
    preview: ContextPreview;
  }> {
    const activeEditor = vscode.window.activeTextEditor;
    const activePath = activeEditor ? toWorkspaceRelativePath(activeEditor.document.uri) : null;
    const mentionPaths = extractMentionPaths(task);
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
      mentionPaths,
      candidateSymbols: extractCandidateSymbols(task),
      diagnostics,
      preferredTargetPath: mentionPaths[0] || activePath || undefined,
      recentTouchedPaths,
    });

    const indexedSnippets = await this.indexManager.query(task, retrievalHints);
    const openFiles = vscode.window.visibleTextEditors
      .map((editor) => {
        const relativePath = toWorkspaceRelativePath(editor.document.uri);
        if (!relativePath) return null;
        return {
          path: relativePath,
          language: editor.document.languageId,
          excerpt: truncate(editor.document.getText(), 5_000),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, 6);

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
      ...(indexedSnippets.length ? { indexedSnippets } : {}),
    };

    return {
      context,
      retrievalHints,
      preview: {
        ...(activePath ? { activeFile: activePath } : {}),
        openFiles: openFiles.map((item) => item.path),
        selectedFiles: indexedSnippets
          .map((item) => item.path)
          .filter((value): value is string => Boolean(value))
          .slice(0, 8),
        diagnostics: diagnostics
          .map((item) => `${item.file || "workspace"}:${item.line || 1} ${item.message}`)
          .slice(0, 8),
        snippets: indexedSnippets
          .map((item) => ({
            path: item.path || "workspace",
            source: item.source,
            reason: item.reason,
          }))
          .slice(0, 6),
      },
    };
  }

  async getMentionSuggestions(query: string): Promise<string[]> {
    return this.indexManager.getMentionSuggestions(query);
  }
}

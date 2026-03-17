import * as vscode from "vscode";
import { createHash } from "crypto";
import { buildIndexChunkMetadata } from "./intelligence-utils";
import { requestJson } from "./api-client";
import {
  INDEX_FILE_STATE_KEY,
  INDEX_STATE_KEY,
  getBaseApiUrl,
  getProjectKey,
  normalizeWorkspaceRelativePath,
  toWorkspaceRelativePath,
} from "./config";
import type { IndexState, RequestAuth, RetrievalHints } from "./shared";

type IndexedSnippet = {
  path?: string;
  score?: number;
  content: string;
  source: "cloud" | "local_fallback";
  reason: string;
};

type IndexRow = {
  pathDisplay?: string;
  content?: string;
  score?: number;
  metadata?: {
    source?: "cloud" | "local_fallback";
    reason?: string;
  };
};

type IndexedFileState = {
  contentHash: string;
  chunkCount: number;
};

type IndexedFileStateMap = Record<string, IndexedFileState>;

const MAX_INDEXED_FILES = 2_000;
const MAX_FILE_BYTES = 160_000;
const UPSERT_BATCH_SIZE = 120;
const CHUNK_SIZE = 4_000;
const CHUNK_OVERLAP = 300;

function sha1(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

function isExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return (
    normalized.startsWith(".git/") ||
    normalized.includes("/.git/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.startsWith("dist/") ||
    normalized.includes("/dist/") ||
    normalized.startsWith("build/") ||
    normalized.includes("/build/") ||
    normalized.startsWith(".next/") ||
    normalized.includes("/.next/") ||
    normalized.includes("/coverage/") ||
    normalized.includes("/_vsix_") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".gif") ||
    normalized.endsWith(".webp") ||
    normalized.endsWith(".ico") ||
    normalized.endsWith(".zip") ||
    normalized.endsWith(".vsix") ||
    normalized.endsWith(".pdf") ||
    normalized.endsWith(".mp4") ||
    normalized.endsWith(".mp3") ||
    normalized.endsWith(".woff") ||
    normalized.endsWith(".woff2")
  );
}

function chunkText(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.length <= CHUNK_SIZE) return [normalized];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    chunks.push(normalized.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function readUtf8(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_FILE_BYTES) return null;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  if (sample.some((byte) => byte === 0)) return null;
  return Buffer.from(bytes).toString("utf8");
}

function scoreLocalPath(pathValue: string, queryTerms: string[], hints?: RetrievalHints): number {
  const normalized = pathValue.toLowerCase();
  let score = 0;
  for (const term of queryTerms) {
    if (normalized.includes(term)) score += 3;
  }
  if (hints?.preferredTargetPath && normalized === hints.preferredTargetPath.toLowerCase()) score += 10;
  if (hints?.mentionedPaths.some((item) => item.toLowerCase() === normalized)) score += 8;
  if (hints?.recentTouchedPaths?.some((item) => item.toLowerCase() === normalized)) score += 4;
  return score;
}

export class CloudIndexManager {
  private state: IndexState;
  private readonly onDidChangeStateEmitter = new vscode.EventEmitter<IndexState>();
  private rebuildTimer: NodeJS.Timeout | null = null;
  private fileCache: string[] = [];
  private indexedFiles: IndexedFileStateMap;
  private rebuildPromise: Promise<void> | null = null;
  private queuedRebuildReason: "manual" | "background" | null = null;

  public readonly onDidChangeState = this.onDidChangeStateEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getAuth: () => Promise<RequestAuth | null>
  ) {
    this.state =
      context.workspaceState.get<IndexState>(INDEX_STATE_KEY) || {
        projectKey: getProjectKey() || undefined,
        chunks: 0,
        freshness: "idle",
        lastQueryMatches: 0,
      };
    this.indexedFiles = context.workspaceState.get<IndexedFileStateMap>(INDEX_FILE_STATE_KEY) || {};
  }

  getState(): IndexState {
    return this.state;
  }

  start(): void {
    void this.refreshFileCache();
    this.scheduleRebuild(1_500);
  }

  scheduleRebuild(delayMs = 3_000): void {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      void this.rebuild("background");
    }, delayMs);
  }

  async rebuild(reason: "manual" | "background" = "manual"): Promise<void> {
    if (this.rebuildPromise) {
      this.queuedRebuildReason =
        this.queuedRebuildReason === "manual" || reason === "manual" ? "manual" : "background";
      await this.rebuildPromise;
      return;
    }

    this.rebuildPromise = this.performRebuild(reason);
    try {
      await this.rebuildPromise;
    } finally {
      this.rebuildPromise = null;
      if (this.queuedRebuildReason) {
        const nextReason = this.queuedRebuildReason;
        this.queuedRebuildReason = null;
        void this.rebuild(nextReason);
      }
    }
  }

  private async performRebuild(reason: "manual" | "background"): Promise<void> {
    const projectKey = getProjectKey();
    const auth = await this.getAuth();
    if (!projectKey) {
      this.updateState({
        projectKey: undefined,
        chunks: 0,
        freshness: "stale",
        lastQueryMatches: this.state.lastQueryMatches,
        lastError: "Open a workspace folder to enable cloud indexing.",
      });
      return;
    }
    if (!auth) {
      this.updateState({
        ...this.state,
        projectKey,
        freshness: "stale",
        lastError: "Authenticate to sync the workspace index.",
      });
      return;
    }

    this.updateState({
      ...this.state,
      projectKey,
      freshness: "indexing",
      lastError: undefined,
    });

    try {
      const files = await this.collectWorkspaceFiles();
      let uploadedChunks = 0;
      let totalChunks = 0;
      const pendingChunks: Array<{
        pathHash: string;
        chunkHash: string;
        pathDisplay: string;
        content: string;
        metadata: Record<string, unknown>;
      }> = [];
      const nextIndexedFiles: IndexedFileStateMap = {};

      for (const file of files) {
        const bytes = await vscode.workspace.fs.readFile(file);
        const content = readUtf8(bytes);
        if (!content) continue;
        const relativePath = toWorkspaceRelativePath(file);
        if (!relativePath || isExcludedPath(relativePath)) continue;

        const contentHash = sha1(content);
        const previousEntry = this.indexedFiles[relativePath];
        if (previousEntry?.contentHash === contentHash) {
          nextIndexedFiles[relativePath] = previousEntry;
          totalChunks += previousEntry.chunkCount;
          continue;
        }

        const chunks = chunkText(content);
        nextIndexedFiles[relativePath] = {
          contentHash,
          chunkCount: chunks.length,
        };
        totalChunks += chunks.length;
        for (const chunk of chunks) {
          pendingChunks.push({
            pathHash: sha1(relativePath),
            chunkHash: sha1(`${relativePath}:${chunk}`),
            pathDisplay: relativePath,
            content: chunk,
            metadata: buildIndexChunkMetadata({
              pathDisplay: relativePath,
              content: chunk,
              source: "cloud",
              reason: reason === "manual" ? "Manual rebuild" : "Background refresh",
            }) as unknown as Record<string, unknown>,
          });
        }
      }

      if (pendingChunks.length > 0) {
        for (let index = 0; index < pendingChunks.length; index += UPSERT_BATCH_SIZE) {
          const batch = pendingChunks.slice(index, index + UPSERT_BATCH_SIZE);
          await requestJson(
            "POST",
            `${getBaseApiUrl()}/api/v1/playground/index/upsert`,
            auth,
            {
              projectKey,
              chunks: batch,
              cursor: String(index + batch.length),
              stats: {
                chunkCount: pendingChunks.length,
                fileCount: files.length,
              },
            }
          );
          uploadedChunks += batch.length;
        }
      }

      this.indexedFiles = nextIndexedFiles;
      await this.context.workspaceState.update(INDEX_FILE_STATE_KEY, nextIndexedFiles);

      this.updateState({
        projectKey,
        chunks: totalChunks,
        freshness: "ready",
        lastQueryMatches: this.state.lastQueryMatches,
        lastRebuildAt: new Date().toISOString(),
      });
    } catch (error) {
      this.updateState({
        ...this.state,
        projectKey,
        freshness: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async query(query: string, hints?: RetrievalHints): Promise<IndexedSnippet[]> {
    const projectKey = getProjectKey();
    const auth = await this.getAuth();
    if (projectKey && auth) {
      try {
        const rows = await requestJson<IndexRow[]>(
          "POST",
          `${getBaseApiUrl()}/api/v1/playground/index/query`,
          auth,
          {
            projectKey,
            query,
            limit: 6,
            retrievalHints: hints,
          }
        );
        if (Array.isArray(rows) && rows.length > 0) {
          const snippets = rows
            .map((row) => ({
              path: normalizeWorkspaceRelativePath(row.pathDisplay),
              score: row.score,
              content: String(row.content || "").slice(0, 6_000),
              source: row.metadata?.source || "cloud",
              reason: row.metadata?.reason || "Cloud index hit",
            }))
            .filter((row) => row.path && row.content);
          this.updateState({
            ...this.state,
            projectKey,
            freshness: "ready",
            lastQueryMatches: snippets.length,
          });
          if (snippets.length > 0) {
            return snippets as IndexedSnippet[];
          }
        }
      } catch {
        // Fall through to local fallback.
      }
    }

    const fallback = await this.localFallbackQuery(query, hints);
    this.updateState({
      ...this.state,
      projectKey: projectKey || undefined,
      freshness: this.state.freshness === "idle" ? "stale" : this.state.freshness,
      lastQueryMatches: fallback.length,
    });
    return fallback;
  }

  async getMentionSuggestions(rawQuery: string): Promise<string[]> {
    const query = normalizeWorkspaceRelativePath(rawQuery) || "";
    if (this.fileCache.length === 0) {
      await this.refreshFileCache();
    }
    const normalizedQuery = query.toLowerCase();
    const exactStarts = this.fileCache.filter((item) => item.toLowerCase().startsWith(normalizedQuery));
    const fuzzy = this.fileCache.filter(
      (item) => !exactStarts.includes(item) && item.toLowerCase().includes(normalizedQuery)
    );
    return [...exactStarts, ...fuzzy].slice(0, 12);
  }

  private async collectWorkspaceFiles(): Promise<vscode.Uri[]> {
    const files = await vscode.workspace.findFiles("**/*", undefined, MAX_INDEXED_FILES);
    this.fileCache = files
      .map((uri) => toWorkspaceRelativePath(uri))
      .filter((value): value is string => Boolean(value))
      .filter((value) => !isExcludedPath(value))
      .sort((a, b) => a.localeCompare(b));
    return files;
  }

  private async refreshFileCache(): Promise<void> {
    await this.collectWorkspaceFiles().catch(() => null);
  }

  private async localFallbackQuery(query: string, hints?: RetrievalHints): Promise<IndexedSnippet[]> {
    if (this.fileCache.length === 0) {
      await this.refreshFileCache();
    }

    const terms = Array.from(
      new Set(
        String(query || "")
          .toLowerCase()
          .split(/[^a-z0-9_./-]+/)
          .map((item) => item.trim())
          .filter((item) => item.length >= 2)
      )
    ).slice(0, 8);

    const candidates = this.fileCache
      .map((filePath) => ({
        path: filePath,
        score: scoreLocalPath(filePath, terms, hints),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folderUri) return [];

    const snippets: IndexedSnippet[] = [];
    for (const candidate of candidates) {
      const uri = vscode.Uri.joinPath(folderUri, candidate.path);
      try {
        const content = readUtf8(await vscode.workspace.fs.readFile(uri));
        if (!content) continue;
        snippets.push({
          path: candidate.path,
          score: candidate.score,
          content: content.slice(0, 4_000),
          source: "local_fallback",
          reason: "Local workspace fallback",
        });
      } catch {
        // ignore unreadable file
      }
    }

    return snippets;
  }

  private updateState(next: IndexState): void {
    this.state = next;
    void this.context.workspaceState.update(INDEX_STATE_KEY, next);
    this.onDidChangeStateEmitter.fire(next);
  }
}

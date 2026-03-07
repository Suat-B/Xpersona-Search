import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";

type AssistContext = {
  activeFile?: { path?: string; language?: string; selection?: string; content?: string };
  openFiles?: Array<{ path: string; language?: string; excerpt?: string }>;
  diagnostics?: Array<{ file?: string; severity?: string | number; message: string; line?: number }>;
  git?: { status?: string[]; diffSummary?: string };
  indexedSnippets?: Array<{ path?: string; score?: number; content: string }>;
};

type WorkspaceFile = {
  absPath: string;
  relPath: string;
  size: number;
};

type RankedWorkspaceFile = WorkspaceFile & {
  pathScore: number;
  contentScore: number;
  totalScore: number;
  excerpt: string;
  snippet: string;
  content: string;
};

const ALLOWED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".yaml",
  ".yml",
  ".sql",
  ".sh",
  ".ps1",
  ".toml",
]);

const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".vercel",
  ".turbo",
  ".cache",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "artifacts",
  "playground_ai",
  "sdk",
]);

const PREFERRED_ROOTS = ["app/", "components/", "lib/", "vscode-extension/", "scripts/", "docs/"];

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "and",
  "any",
  "are",
  "back",
  "because",
  "before",
  "between",
  "both",
  "build",
  "can",
  "change",
  "code",
  "does",
  "each",
  "editor",
  "file",
  "for",
  "from",
  "have",
  "help",
  "here",
  "into",
  "just",
  "make",
  "more",
  "need",
  "only",
  "open",
  "please",
  "project",
  "should",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "this",
  "those",
  "use",
  "using",
  "very",
  "want",
  "with",
  "your",
]);

const MAX_SCAN_FILES = 900;
const MAX_CANDIDATE_FILES = 28;
const MAX_CONTEXT_FILES = 8;
const MAX_SNIPPETS = 12;
const MAX_FILE_BYTES = 300 * 1024;
const MAX_SCAN_MS = 1_600;
const MAX_TOTAL_CONTEXT_CHARS = 170_000;

const CATALOG_CACHE_TTL_MS = 60_000;
let catalogCache: { root: string; at: number; files: WorkspaceFile[] } | null = null;

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  return ext || "text";
}

function normalizeRelPath(root: string, absPath: string): string | null {
  const rel = path.relative(root, absPath).replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel;
}

function shouldSkipDirectory(name: string): boolean {
  if (EXCLUDED_DIRS.has(name)) return true;
  if (name.startsWith(".") && name !== ".github" && name !== ".vscode") return true;
  return false;
}

function execFileSafe(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  maxBuffer: number
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, stdout: "" });
        return;
      }
      resolve({ ok: true, stdout: String(stdout || "") });
    });
  });
}

async function collectGitContext(root: string): Promise<{ status: string[]; diffSummary: string }> {
  const [status, diff] = await Promise.all([
    execFileSafe("git", ["status", "--short"], root, 2_500, 24_000),
    execFileSafe("git", ["diff", "--stat"], root, 2_500, 24_000),
  ]);
  return {
    status: status.ok
      ? status.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 200)
      : [],
    diffSummary: diff.ok ? diff.stdout.slice(0, 12_000) : "",
  };
}

function extractSearchTokens(task: string): string[] {
  const pathMentions = String(task || "")
    .match(/[A-Za-z0-9_.\/-]+\.[A-Za-z0-9]{1,10}/g)
    ?.map((token) => token.trim())
    .filter(Boolean) ?? [];

  const words = String(task || "")
    .replace(/[`"'()[\]{}<>]/g, " ")
    .match(/[A-Za-z_][A-Za-z0-9_]{2,}/g)
    ?.map((token) => token.trim()) ?? [];

  const merged = [...pathMentions, ...words];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of merged) {
    const cleaned = token.replace(/^[./]+/, "").replace(/[.,;:!?]+$/, "");
    if (!cleaned) continue;
    const normalized = cleaned.toLowerCase();
    if (normalized.length < 3) continue;
    if (!/[a-z]/i.test(normalized)) continue;
    if (STOP_WORDS.has(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(cleaned);
    if (out.length >= 10) break;
  }
  return out;
}

function scorePath(relPath: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const low = relPath.toLowerCase();
  const base = path.basename(relPath).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (low === t || base === t) {
      score += 24;
      continue;
    }
    if (base.startsWith(`${t}.`) || base.includes(`${t}.`)) {
      score += 18;
      continue;
    }
    if (low.includes(`/${t}/`) || low.includes(`/${t}.`) || low.endsWith(`/${t}`)) {
      score += 14;
      continue;
    }
    if (low.includes(t)) {
      score += 8;
    }
  }
  for (const root of PREFERRED_ROOTS) {
    if (low.startsWith(root)) {
      score += 2;
      break;
    }
  }
  return score;
}

function scoreContent(content: string, tokens: string[]): { score: number; firstMatchLine: number } {
  if (!tokens.length || !content) return { score: 0, firstMatchLine: -1 };
  const low = content.toLowerCase();
  let score = 0;
  let firstMatchIndex = -1;
  for (const token of tokens) {
    const t = token.toLowerCase();
    let from = 0;
    let count = 0;
    while (count < 10) {
      const idx = low.indexOf(t, from);
      if (idx < 0) break;
      if (firstMatchIndex < 0) firstMatchIndex = idx;
      count += 1;
      from = idx + t.length;
    }
    if (count > 0) {
      score += Math.min(20, count * 3);
    }
  }
  if (firstMatchIndex < 0) return { score, firstMatchLine: -1 };
  const prefix = content.slice(0, firstMatchIndex);
  const firstMatchLine = prefix.split(/\r?\n/).length - 1;
  return { score, firstMatchLine };
}

function withLineNumbers(lines: string[], startLine: number): string {
  return lines.map((line, idx) => `${String(startLine + idx).padStart(4, " ")} | ${line}`).join("\n");
}

function extractExcerpt(content: string, firstMatchLine: number, maxChars: number): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = firstMatchLine >= 0 ? Math.max(0, firstMatchLine - 14) : 0;
  const end = Math.min(lines.length, start + 80);
  let excerpt = withLineNumbers(lines.slice(start, end), start + 1);
  if (excerpt.length > maxChars) excerpt = excerpt.slice(0, maxChars);
  if (end < lines.length) excerpt += `\n... [truncated ${lines.length - end} lines]`;
  return excerpt;
}

function extractSnippet(content: string, firstMatchLine: number, maxChars: number): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = firstMatchLine >= 0 ? Math.max(0, firstMatchLine - 6) : 0;
  const end = Math.min(lines.length, start + 28);
  let snippet = lines.slice(start, end).join("\n");
  if (snippet.length > maxChars) snippet = snippet.slice(0, maxChars);
  if (end < lines.length) snippet += `\n... [truncated ${lines.length - end} lines]`;
  return snippet;
}

function trimContextToMaxChars(ctx: AssistContext, maxChars: number): AssistContext {
  const clone: AssistContext = {
    activeFile: ctx.activeFile ? { ...ctx.activeFile } : undefined,
    openFiles: [...(ctx.openFiles ?? [])],
    diagnostics: [...(ctx.diagnostics ?? [])],
    git: ctx.git ? { ...ctx.git } : undefined,
    indexedSnippets: [...(ctx.indexedSnippets ?? [])],
  };
  const size = () => JSON.stringify(clone).length;
  if (size() <= maxChars) return clone;

  while ((clone.indexedSnippets?.length ?? 0) > 0 && size() > maxChars) clone.indexedSnippets?.pop();
  while ((clone.openFiles?.length ?? 0) > 0 && size() > maxChars) clone.openFiles?.pop();

  if (size() > maxChars && clone.activeFile?.content) {
    clone.activeFile.content = clone.activeFile.content.slice(0, 12_000);
  }
  return clone;
}

async function buildWorkspaceCatalog(root: string): Promise<WorkspaceFile[]> {
  const now = Date.now();
  if (catalogCache && catalogCache.root === root && now - catalogCache.at <= CATALOG_CACHE_TTL_MS) {
    return catalogCache.files;
  }

  const startedAt = Date.now();
  const files: WorkspaceFile[] = [];
  const queue: Array<{ absPath: string }> = [{ absPath: root }];

  while (queue.length > 0 && files.length < MAX_SCAN_FILES && Date.now() - startedAt < MAX_SCAN_MS) {
    const current = queue.shift();
    if (!current) break;
    const dirEntries = await fs.readdir(current.absPath, { withFileTypes: true }).catch(() => []);
    const sorted = dirEntries.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      const absPath = path.join(current.absPath, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) continue;
        queue.push({ absPath });
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      const relPath = normalizeRelPath(root, absPath);
      if (!relPath) continue;
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) continue;
      files.push({ absPath, relPath, size: stat.size });
      if (files.length >= MAX_SCAN_FILES) break;
    }
  }

  catalogCache = { root, at: now, files };
  return files;
}

function selectCandidateFiles(files: WorkspaceFile[], tokens: string[]): Array<WorkspaceFile & { pathScore: number }> {
  const ranked = files
    .map((file) => ({ ...file, pathScore: scorePath(file.relPath, tokens) }))
    .sort((a, b) => b.pathScore - a.pathScore || a.relPath.localeCompare(b.relPath));

  const positives = ranked.filter((file) => file.pathScore > 0).slice(0, MAX_CANDIDATE_FILES);
  if (positives.length >= Math.min(8, MAX_CANDIDATE_FILES)) return positives;

  const preferred = ranked
    .filter((file) => PREFERRED_ROOTS.some((prefix) => file.relPath.startsWith(prefix)))
    .slice(0, MAX_CANDIDATE_FILES);
  const merged = new Map<string, WorkspaceFile & { pathScore: number }>();
  for (const file of [...positives, ...preferred]) {
    if (!merged.has(file.relPath)) merged.set(file.relPath, file);
    if (merged.size >= MAX_CANDIDATE_FILES) break;
  }
  return Array.from(merged.values());
}

async function rankCandidateFiles(
  candidates: Array<WorkspaceFile & { pathScore: number }>,
  tokens: string[]
): Promise<RankedWorkspaceFile[]> {
  const ranked: RankedWorkspaceFile[] = [];
  for (const file of candidates) {
    const raw = await fs.readFile(file.absPath, "utf8").catch(() => "");
    if (!raw) continue;
    const content = raw.replace(/\r\n/g, "\n");
    const scored = scoreContent(content, tokens);
    const totalScore = file.pathScore + scored.score;
    if (totalScore <= 0 && ranked.length >= 6) continue;
    ranked.push({
      ...file,
      content,
      contentScore: scored.score,
      totalScore,
      excerpt: extractExcerpt(content, scored.firstMatchLine, 8_500),
      snippet: extractSnippet(content, scored.firstMatchLine, 3_600),
    });
  }
  return ranked.sort((a, b) => b.totalScore - a.totalScore || a.relPath.localeCompare(b.relPath));
}

export async function buildWorkspaceAssistContext(task: string): Promise<AssistContext | null> {
  const trimmedTask = String(task || "").trim();
  if (!trimmedTask) return null;

  const root = process.cwd();
  const [catalog, git] = await Promise.all([buildWorkspaceCatalog(root), collectGitContext(root)]);
  if (!catalog.length) {
    if (!git.status.length && !git.diffSummary) return null;
    return { git };
  }

  const tokens = extractSearchTokens(trimmedTask);
  const candidates = selectCandidateFiles(catalog, tokens);
  const ranked = await rankCandidateFiles(candidates, tokens);

  const top = ranked.slice(0, MAX_CONTEXT_FILES);
  if (!top.length && !git.status.length && !git.diffSummary) return null;

  const active = top[0];
  const context: AssistContext = {
    ...(active
      ? {
          activeFile: {
            path: active.relPath,
            language: languageFromPath(active.relPath),
            content: active.content.slice(0, 16_000),
          },
        }
      : {}),
    openFiles: top.map((file) => ({
      path: file.relPath,
      language: languageFromPath(file.relPath),
      excerpt: file.excerpt,
    })),
    indexedSnippets: ranked.slice(0, MAX_SNIPPETS).map((file) => ({
      path: file.relPath,
      score: Number((file.totalScore / 100).toFixed(4)),
      content: file.snippet,
    })),
    git,
  };

  return trimContextToMaxChars(context, MAX_TOTAL_CONTEXT_CHARS);
}


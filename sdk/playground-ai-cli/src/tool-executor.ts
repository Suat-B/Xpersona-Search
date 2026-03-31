import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { applyUnifiedDiff } from "./patch-utils.js";
import { PendingToolCall, ToolResult } from "./types.js";

const execAsync = promisify(exec);

const SKIP_DIRS = new Set([".git", ".next", "node_modules", "dist", "build", "__pycache__", ".cache"]);

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

export function inferTaskProjectRoot(task: string): string | null {
  const patterns = [
    /\b(?:project|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
    /\bnamed\s+([A-Za-z0-9._-]+)\s+in\s+the\s+current\s+workspace\b/i,
    /\bcreate\s+(?:a\s+new\s+)?(?:plain\s+\w+\s+)?(?:project\s+folder|folder)\s+named\s+([A-Za-z0-9._-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match?.[1]) return normalizeWorkspacePath(match[1]);
  }
  return null;
}

function looksLikeProjectScopedCommand(command: string): boolean {
  return /^(npm|pnpm|yarn|bun|node)\b/i.test(command.trim());
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string | null {
  const relative = path.relative(workspaceRoot, absolutePath);
  if (!relative || relative === "") return path.basename(absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return normalizeWorkspacePath(relative);
}

function resolveWorkspacePath(workspaceRoot: string, inputPath: string): { absolutePath: string; relativePath: string } | null {
  const raw = normalizeWorkspacePath(String(inputPath || "").trim());
  if (!raw) return null;
  const absolutePath = path.resolve(workspaceRoot, raw);
  const relativePath = toWorkspaceRelativePath(workspaceRoot, absolutePath);
  if (!relativePath) return null;
  return { absolutePath, relativePath };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

async function collectWorkspaceFiles(root: string, limit: number): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];

  while (stack.length && out.length < limit) {
    const current = stack.pop() as string;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (out.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = toWorkspaceRelativePath(root, full);
      if (relative) out.push(relative);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

async function searchWorkspaceFallback(root: string, query: string, limit: number): Promise<Array<{
  path: string;
  line: number | null;
  content: string;
  source: string;
  reason: string;
}>> {
  const files = await collectWorkspaceFiles(root, 400);
  const out: Array<{
    path: string;
    line: number | null;
    content: string;
    source: string;
    reason: string;
  }> = [];
  const caseSensitive = /[A-Z]/.test(query);
  const needle = caseSensitive ? query : query.toLowerCase();

  for (const relativePath of files) {
    if (out.length >= limit) break;
    const absolutePath = path.join(root, relativePath);
    let raw: string;
    try {
      raw = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || "";
      const haystack = caseSensitive ? line : line.toLowerCase();
      if (!haystack.includes(needle)) continue;
      out.push({
        path: relativePath,
        line: index + 1,
        content: line.trim(),
        source: "local_scan_fallback",
        reason: "Workspace text scan fallback",
      });
      break;
    }
  }

  return out;
}

async function suggestWorkspacePath(workspaceRoot: string, requestedPath: string): Promise<string | null> {
  const normalizedRequested = normalizeWorkspacePath(String(requestedPath || "").trim());
  if (!normalizedRequested) return null;
  const files = await collectWorkspaceFiles(workspaceRoot, 400);
  const suffixMatch = files.find((file) => file.endsWith(`/${normalizedRequested}`));
  if (suffixMatch) return suffixMatch;
  const basename = path.posix.basename(normalizedRequested);
  if (!basename || basename === normalizedRequested) return null;
  return files.find((file) => path.posix.basename(file) === basename) || null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  return fs
    .stat(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function runShellCommand(command: string, cwd: string, timeoutMs?: number): Promise<{
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 2_000_000,
      shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
    });
    return {
      command,
      exitCode: 0,
      stdout: String(stdout || ""),
      stderr: String(stderr || ""),
      timedOut: false,
    };
  } catch (error) {
    const typed = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      signal?: string;
    };
    return {
      command,
      exitCode: typeof typed.code === "number" ? typed.code : 1,
      stdout: String(typed.stdout || ""),
      stderr: String(typed.stderr || ""),
      timedOut: Boolean(typed.killed || typed.signal === "SIGTERM"),
    };
  }
}

export class CliToolExecutor {
  private readonly workspaceRoot: string;
  private readonly observedRoots = new Set<string>();
  private readonly preferredProjectRoot: string | null;

  constructor(workspaceRoot: string, preferredProjectRoot?: string | null) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.preferredProjectRoot = preferredProjectRoot ? normalizeWorkspacePath(preferredProjectRoot) : null;
  }

  private getPreferredObservedRoot(): string | null {
    if (this.preferredProjectRoot) return this.preferredProjectRoot;
    if (this.observedRoots.size === 1) {
      const [observedRoot] = Array.from(this.observedRoots);
      return observedRoot || null;
    }
    return null;
  }

  private rememberObservedPath(relativePath: string): void {
    const normalized = normalizeWorkspacePath(relativePath);
    if (!normalized) return;
    if (!normalized.includes("/")) return;
    const [topLevel] = normalized.split("/");
    if (!topLevel) return;
    this.observedRoots.add(topLevel);
  }

  private rememberObservedDirectory(relativePath: string): void {
    const normalized = normalizeWorkspacePath(relativePath);
    if (!normalized) return;
    const [topLevel] = normalized.split("/");
    if (!topLevel) return;
    this.observedRoots.add(topLevel);
  }

  private async maybeRewriteIntoObservedRoot(
    relativePath: string,
    options?: { preferExisting?: boolean }
  ): Promise<{ absolutePath: string; relativePath: string } | null> {
    const observedRoot = this.getPreferredObservedRoot();
    if (!observedRoot) return null;
    const normalized = normalizeWorkspacePath(relativePath);
    if (!normalized) return null;
    const [topLevel] = normalized.split("/");
    if (topLevel && topLevel === observedRoot) return null;

    const rewritten = normalizeWorkspacePath(`${observedRoot}/${normalized}`);
    const resolved = resolveWorkspacePath(this.workspaceRoot, rewritten);
    if (!resolved) return null;
    if (options?.preferExisting) {
      const exists = await fs
        .stat(resolved.absolutePath)
        .then(() => true)
        .catch(() => false);
      if (!exists) return null;
    }
    return resolved;
  }

  private async resolveWithObservedRoot(
    inputPath: string,
    options?: { preferExisting?: boolean }
  ): Promise<{ absolutePath: string; relativePath: string } | null> {
    const direct = resolveWorkspacePath(this.workspaceRoot, String(inputPath || ""));
    if (!direct) return null;
    if (!options?.preferExisting) return direct;
    const directExists = await fs
      .stat(direct.absolutePath)
      .then(() => true)
      .catch(() => false);
    if (directExists) return direct;
    return (await this.maybeRewriteIntoObservedRoot(direct.relativePath, options)) || direct;
  }

  private inferCommandCwd(command: string, explicitCwd?: string): string {
    if (explicitCwd && explicitCwd.trim()) {
      const resolved =
        this.resolveStaticPath(explicitCwd, { preferObservedRoot: true }) || this.workspaceRoot;
      return resolved;
    }
    const observedRoot = this.getPreferredObservedRoot();
    if (observedRoot && looksLikeProjectScopedCommand(command)) {
      const resolved = path.resolve(this.workspaceRoot, observedRoot);
      return resolved;
    }
    return this.workspaceRoot;
  }

  private resolveStaticPath(
    inputPath: string,
    options?: { preferObservedRoot?: boolean }
  ): string | null {
    const direct = resolveWorkspacePath(this.workspaceRoot, String(inputPath || ""));
    if (!direct) return null;
    if (!options?.preferObservedRoot) return direct.absolutePath;
    const normalized = normalizeWorkspacePath(direct.relativePath);
    const observedRoot = this.getPreferredObservedRoot();
    if (observedRoot && normalized) {
      const [topLevel] = normalized.split("/");
      if (topLevel && topLevel !== observedRoot) {
        return path.resolve(this.workspaceRoot, observedRoot, normalized);
      }
    }
    return direct.absolutePath;
  }

  private async findNearestGitRoot(startPath: string): Promise<string | null> {
    let current = path.resolve(startPath);
    const workspaceRoot = this.workspaceRoot;

    try {
      const stats = await fs.stat(current);
      if (stats.isFile()) current = path.dirname(current);
    } catch {
      current = path.dirname(current);
    }

    while (true) {
      if (await pathExists(path.join(current, ".git"))) return current;
      if (current === workspaceRoot) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      if (path.relative(workspaceRoot, parent).startsWith("..")) break;
      current = parent;
    }

    return (await pathExists(path.join(workspaceRoot, ".git"))) ? workspaceRoot : null;
  }

  private async inferGitCwd(args: Record<string, unknown>): Promise<string> {
    const candidates: string[] = [];
    const requestedPath = typeof args.path === "string" ? args.path : "";
    if (requestedPath.trim()) {
      const resolved = await this.resolveWithObservedRoot(requestedPath, { preferExisting: true });
      if (resolved) candidates.push(resolved.absolutePath);
    }

    const observedRoot = this.getPreferredObservedRoot();
    if (observedRoot) candidates.push(path.resolve(this.workspaceRoot, observedRoot));
    candidates.push(this.workspaceRoot);

    for (const candidate of candidates) {
      const gitRoot = await this.findNearestGitRoot(candidate);
      if (gitRoot) return gitRoot;
    }

    return this.workspaceRoot;
  }

  async execute(pendingToolCall: PendingToolCall): Promise<ToolResult> {
    const toolCall = pendingToolCall.toolCall;
    const args = toolCall.arguments || {};

    try {
      if (toolCall.name === "list_files") {
        const query = String(args.query || "").trim().toLowerCase();
        const limit = clamp(Number(args.limit || 30), 1, 300);
        const files = await collectWorkspaceFiles(this.workspaceRoot, Math.max(limit * 6, 300));
        const filtered = query ? files.filter((file) => file.toLowerCase().includes(query)) : files;
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Listed ${Math.min(filtered.length, limit)} workspace file(s).`,
          data: { files: filtered.slice(0, limit) },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "read_file") {
        const resolved = await this.resolveWithObservedRoot(String(args.path || ""), { preferExisting: true });
        if (!resolved) {
          return this.fail(toolCall.id, toolCall.name, "Invalid workspace-relative path for read_file.");
        }
        let raw: string;
        try {
          raw = await fs.readFile(resolved.absolutePath, "utf8");
        } catch (error) {
          const suggestion = await suggestWorkspacePath(this.workspaceRoot, resolved.relativePath);
          if ((error as NodeJS.ErrnoException)?.code === "ENOENT" && suggestion) {
            return this.fail(
              toolCall.id,
              toolCall.name,
              `Missing file ${resolved.relativePath}. Did you mean ${suggestion}?`
            );
          }
          throw error;
        }
        const lines = raw.replace(/\r\n/g, "\n").split("\n");
        const startLine = Number.isFinite(Number(args.startLine))
          ? clamp(Number(args.startLine), 1, Math.max(1, lines.length))
          : 1;
        const endLine = Number.isFinite(Number(args.endLine))
          ? clamp(Number(args.endLine), startLine, Math.max(startLine, lines.length))
          : Math.min(Math.max(1, lines.length), startLine + 199);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Read ${resolved.relativePath} (${startLine}-${endLine}).`,
          data: {
            path: resolved.relativePath,
            range: `${startLine}-${endLine}`,
            content: lines.slice(startLine - 1, endLine).join("\n"),
            lineCount: lines.length,
          },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "search_workspace") {
        const query = String(args.query || "").trim();
        const limit = clamp(Number(args.limit || 6), 1, 20);
        if (!query) {
          return this.fail(toolCall.id, toolCall.name, "search_workspace requires a non-empty query.");
        }
        const command = `rg -n --no-heading --hidden -S --glob "!node_modules" --glob "!.git" --glob "!dist" --glob "!build" ${JSON.stringify(query)} .`;
        const result = await runShellCommand(command, this.workspaceRoot, 10_000);
        let matches = result.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, limit)
          .map((line) => {
            const match = /^(.*?):(\d+):(.*)$/.exec(line);
            if (!match) {
              return {
                path: "",
                line: null,
                content: line,
                source: "local_fallback",
                reason: "Local ripgrep match",
              };
            }
            return {
              path: normalizeWorkspacePath(match[1] || ""),
              line: Number(match[2] || "0") || null,
              content: String(match[3] || "").trim(),
              source: "local_fallback",
              reason: "Local ripgrep match",
            };
          });
        if (!matches.length && result.exitCode !== 0) {
          matches = await searchWorkspaceFallback(this.workspaceRoot, query, limit);
        }
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: result.exitCode === 0 || matches.length > 0,
          summary: matches.length
            ? `Found ${matches.length} workspace snippet(s) for "${query}".`
            : `No workspace snippets matched "${query}".`,
          data: { query, matches },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "git_status" || toolCall.name === "git_diff") {
        const gitCwd = await this.inferGitCwd(args);
        const gitCommand =
          toolCall.name === "git_status"
            ? "git status --short"
            : typeof args.path === "string" && args.path.trim()
              ? `git diff -- ${JSON.stringify(String(args.path))}`
              : "git diff --stat";
        const result = await runShellCommand(gitCommand, gitCwd, 15_000);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: result.exitCode === 0,
          summary:
            result.exitCode === 0
              ? toolCall.name === "git_status"
                ? "Captured git status."
                : "Captured git diff."
              : `${toolCall.name} failed: ${result.stderr || result.stdout || "unknown error"}`,
          data: {
            ...result,
            cwd: gitCwd,
          },
          error: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "create_checkpoint") {
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Checkpoint noted: ${String(args.reason || "Before local mutation")}.`,
          data: { reason: typeof args.reason === "string" ? args.reason : null },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "mkdir") {
        const resolved =
          (await this.maybeRewriteIntoObservedRoot(String(args.path || ""))) ||
          resolveWorkspacePath(this.workspaceRoot, String(args.path || ""));
        if (!resolved) {
          return this.fail(toolCall.id, toolCall.name, "Invalid workspace-relative path for mkdir.");
        }
        await fs.mkdir(resolved.absolutePath, { recursive: true });
        this.rememberObservedDirectory(resolved.relativePath);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Created directory ${resolved.relativePath}.`,
          data: { path: resolved.relativePath },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "write_file") {
        const resolved =
          (await this.maybeRewriteIntoObservedRoot(String(args.path || ""))) ||
          resolveWorkspacePath(this.workspaceRoot, String(args.path || ""));
        if (!resolved) {
          return this.fail(toolCall.id, toolCall.name, "Invalid workspace-relative path for write_file.");
        }
        const overwrite = typeof args.overwrite === "boolean" ? args.overwrite : true;
        const exists = await fs
          .stat(resolved.absolutePath)
          .then(() => true)
          .catch(() => false);
        if (exists && !overwrite) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            ok: false,
            blocked: true,
            summary: `Refused to overwrite ${resolved.relativePath}.`,
            data: { path: resolved.relativePath },
            error: "overwrite=false and file already exists",
            createdAt: nowIso(),
          };
        }
        await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
        await fs.writeFile(resolved.absolutePath, String(args.content || ""), "utf8");
        this.rememberObservedPath(resolved.relativePath);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Wrote ${resolved.relativePath}.`,
          data: { path: resolved.relativePath },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "edit") {
        const resolved = await this.resolveWithObservedRoot(String(args.path || ""), { preferExisting: true });
        if (!resolved) {
          return this.fail(toolCall.id, toolCall.name, "Invalid workspace-relative path for edit.");
        }
        const before = await fs.readFile(resolved.absolutePath, "utf8").catch(() => null);
        if (before == null) {
          const suggestion = await suggestWorkspacePath(this.workspaceRoot, resolved.relativePath);
          return this.fail(
            toolCall.id,
            toolCall.name,
            suggestion
              ? `Cannot edit missing file ${resolved.relativePath}. Did you mean ${suggestion}?`
              : `Cannot edit missing file ${resolved.relativePath}.`
          );
        }
        const patch = String(args.patch || "");
        const applied = applyUnifiedDiff(before, patch);
        if (applied.status !== "applied" || typeof applied.content !== "string") {
          return this.fail(
            toolCall.id,
            toolCall.name,
            applied.reason || `Patch failed for ${resolved.relativePath}.`
          );
        }
        await fs.writeFile(resolved.absolutePath, applied.content, "utf8");
        this.rememberObservedPath(resolved.relativePath);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Patched ${resolved.relativePath}.`,
          data: {
            path: resolved.relativePath,
            hunksApplied: applied.hunksApplied,
            totalHunks: applied.totalHunks,
          },
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "run_command") {
        const command = String(args.command || "").trim();
        if (!command) {
          return this.fail(toolCall.id, toolCall.name, "run_command requires a non-empty command.");
        }
        const timeoutMs =
          typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
            ? clamp(args.timeoutMs, 1_000, 120_000)
            : 30_000;
        const cwd = this.inferCommandCwd(command, typeof args.cwd === "string" ? args.cwd : undefined);
        const result = await runShellCommand(command, cwd, timeoutMs);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: result.exitCode === 0 && !result.timedOut,
          summary:
            result.exitCode === 0 && !result.timedOut
              ? `Command succeeded: ${command}`
              : `Command failed: ${command}`,
          data: {
            ...result,
            cwd,
          },
          error: result.exitCode === 0 && !result.timedOut ? undefined : result.stderr || result.stdout,
          createdAt: nowIso(),
        };
      }

      if (toolCall.name === "get_workspace_memory" || toolCall.name === "get_diagnostics") {
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary:
            toolCall.name === "get_workspace_memory"
              ? "No persisted workspace memory is available in the CLI."
              : "Diagnostics are not available in the standalone CLI.",
          data: toolCall.name === "get_workspace_memory" ? { memory: null } : { diagnostics: [] },
          createdAt: nowIso(),
        };
      }

      return this.fail(toolCall.id, toolCall.name, `Unsupported tool ${toolCall.name}.`);
    } catch (error) {
      return this.fail(
        toolCall.id,
        toolCall.name,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private fail(toolCallId: string, name: string, message: string): ToolResult {
    return {
      toolCallId,
      name,
      ok: false,
      summary: message,
      error: message,
      createdAt: nowIso(),
    };
  }
}

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  normalizeWorkspaceRelativePath,
  nowIso,
  randomId,
  validateShellCommand,
} from "./cutie-policy";
import { getWorkspaceRootPath } from "./config";
import type { CutieCheckpoint } from "./types";

const execAsync = promisify(exec);

type UndoEntry = {
  path: string;
  existed: boolean;
  content: string;
};

type CheckpointState = {
  id: string;
  createdAt: string;
  reason?: string;
  files: UndoEntry[];
  createdDirectories: string[];
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toAbsoluteWorkspacePath(relativePath: string): string | null {
  const root = getWorkspaceRootPath();
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!root || !normalized) return null;
  return path.join(root, normalized);
}

function isExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return (
    normalized.startsWith(".git/") ||
    normalized.includes("/.git/") ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized.startsWith(".next/") ||
    normalized.includes("/.next/")
  );
}

export class CutieWorkspaceAdapter {
  private checkpoint: CheckpointState | null = null;

  async listFiles(query: string, limit: number): Promise<{ files: string[] }> {
    const rows = await vscode.workspace.findFiles("**/*", undefined, 2_000);
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const files = rows
      .map((uri) => {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) return null;
        return normalizeWorkspaceRelativePath(path.relative(folder.uri.fsPath, uri.fsPath));
      })
      .filter((value): value is string => Boolean(value))
      .filter((value) => !isExcludedPath(value))
      .filter((value) => !normalizedQuery || value.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, Math.max(1, Math.min(limit, 200)));
    return { files };
  }

  async readFile(filePath: string, startLineValue?: unknown, endLineValue?: unknown) {
    const absolutePath = toAbsoluteWorkspacePath(filePath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${filePath}`);
    const raw = await fs.readFile(absolutePath, "utf8");
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const maxLine = Math.max(lines.length, 1);
    const startLine = Number.isFinite(Number(startLineValue))
      ? Math.max(1, Math.min(Number(startLineValue), maxLine))
      : 1;
    const endLine = Number.isFinite(Number(endLineValue))
      ? Math.max(startLine, Math.min(Number(endLineValue), maxLine))
      : Math.min(maxLine, startLine + 199);
    return {
      path: filePath,
      range: `${startLine}-${endLine}`,
      content: lines.slice(startLine - 1, endLine).join("\n"),
      lineCount: lines.length,
    };
  }

  async searchWorkspace(query: string, limit: number): Promise<{
    query: string;
    matches: Array<{ path: string; line: number; preview: string }>;
  }> {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      return {
        query: trimmed,
        matches: [],
      };
    }

    const root = getWorkspaceRootPath();
    if (!root) throw new Error("Open a workspace folder before searching.");

    const matches = await this.searchWithRipgrep(trimmed, limit).catch(() => this.searchWithWorkspaceFiles(trimmed, limit));
    return {
      query: trimmed,
      matches,
    };
  }

  async getDiagnostics(pathFilter?: string) {
    const normalizedFilter = normalizeWorkspaceRelativePath(pathFilter || "");
    return vscode.languages
      .getDiagnostics()
      .flatMap(([uri, entries]) => {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) return [];
        const relativePath = normalizeWorkspaceRelativePath(path.relative(folder.uri.fsPath, uri.fsPath));
        return entries.map((entry) => ({
          path: relativePath || undefined,
          severity: entry.severity,
          message: entry.message,
          line: entry.range.start.line + 1,
        }));
      })
      .filter((item) => !normalizedFilter || item.path === normalizedFilter)
      .slice(0, 100);
  }

  async gitStatus(): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
    return this.runProcess("git status --short", getWorkspaceRootPath() || undefined, 20_000);
  }

  async gitDiff(pathFilter?: string): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
    const normalized = normalizeWorkspaceRelativePath(pathFilter || "");
    const command = normalized ? `git diff -- ${normalized}` : "git diff --stat";
    return this.runProcess(command, getWorkspaceRootPath() || undefined, 20_000);
  }

  createCheckpoint(reason?: string): CutieCheckpoint {
    if (!this.checkpoint) {
      this.checkpoint = {
        id: randomId("cutie_checkpoint"),
        createdAt: nowIso(),
        reason,
        files: [],
        createdDirectories: [],
      };
    } else if (reason && !this.checkpoint.reason) {
      this.checkpoint.reason = reason;
    }

    return {
      id: this.checkpoint.id,
      createdAt: this.checkpoint.createdAt,
      reason: this.checkpoint.reason,
      trackedPaths: uniqueStrings(this.checkpoint.files.map((entry) => entry.path)),
    };
  }

  async editFile(input: {
    path: string;
    find: string;
    replace: string;
    replaceAll?: boolean;
  }): Promise<{ path: string; replacedCount: number; checkpoint: CutieCheckpoint }> {
    const normalizedPath = normalizeWorkspaceRelativePath(input.path);
    if (!normalizedPath) throw new Error("edit_file requires a workspace-relative path.");
    if (!input.find) throw new Error("edit_file requires a non-empty find string.");

    const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);

    await this.captureUndoSnapshot(normalizedPath);
    const before = await fs.readFile(absolutePath, "utf8");
    const occurrences = before.split(input.find).length - 1;
    if (occurrences <= 0) {
      throw new Error(`edit_file could not find the requested text in ${normalizedPath}.`);
    }

    const after = input.replaceAll
      ? before.split(input.find).join(input.replace)
      : before.replace(input.find, input.replace);

    const replacedCount = input.replaceAll ? occurrences : 1;
    await fs.writeFile(absolutePath, after, "utf8");

    return {
      path: normalizedPath,
      replacedCount,
      checkpoint: this.createCheckpoint(),
    };
  }

  async writeFile(input: {
    path: string;
    content: string;
    overwrite?: boolean;
  }): Promise<{ path: string; bytes: number; checkpoint: CutieCheckpoint }> {
    const normalizedPath = normalizeWorkspaceRelativePath(input.path);
    if (!normalizedPath) throw new Error("write_file requires a workspace-relative path.");
    const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);

    if (!input.overwrite) {
      const existing = await fs.stat(absolutePath).catch(() => null);
      if (existing?.isFile()) {
        throw new Error(`write_file refused to overwrite ${normalizedPath} without overwrite=true.`);
      }
    }

    await this.captureUndoSnapshot(normalizedPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, String(input.content || ""), "utf8");
    return {
      path: normalizedPath,
      bytes: Buffer.byteLength(String(input.content || ""), "utf8"),
      checkpoint: this.createCheckpoint(),
    };
  }

  async mkdir(directoryPath: string): Promise<{ path: string; checkpoint: CutieCheckpoint }> {
    const normalizedPath = normalizeWorkspaceRelativePath(directoryPath);
    if (!normalizedPath) throw new Error("mkdir requires a workspace-relative path.");
    const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);

    if (!this.checkpoint) this.createCheckpoint("Automatic checkpoint before mkdir.");
    await fs.mkdir(absolutePath, { recursive: true });
    if (this.checkpoint && !this.checkpoint.createdDirectories.includes(normalizedPath)) {
      this.checkpoint.createdDirectories.push(normalizedPath);
    }
    return {
      path: normalizedPath,
      checkpoint: this.createCheckpoint(),
    };
  }

  async runCommand(input: {
    command: string;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
    const validation = validateShellCommand(input.command);
    if (!validation.ok) {
      throw new Error(validation.reason || "Command blocked by Cutie safety policy.");
    }

    const root = getWorkspaceRootPath();
    if (!root) throw new Error("Open a workspace folder before running commands.");

    const normalizedCwd = normalizeWorkspaceRelativePath(input.cwd || "");
    const absoluteCwd = normalizedCwd ? path.join(root, normalizedCwd) : root;
    return this.runProcess(input.command, absoluteCwd, Math.max(100, Math.min(input.timeoutMs || 60_000, 300_000)));
  }

  getCurrentCheckpoint(): CutieCheckpoint | null {
    if (!this.checkpoint) return null;
    return {
      id: this.checkpoint.id,
      createdAt: this.checkpoint.createdAt,
      reason: this.checkpoint.reason,
      trackedPaths: uniqueStrings(this.checkpoint.files.map((entry) => entry.path)),
    };
  }

  private async searchWithRipgrep(
    query: string,
    limit: number
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const root = getWorkspaceRootPath();
    if (!root) return [];
    const result = await execAsync("rg --version", {
      windowsHide: true,
      shell: process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : undefined,
      cwd: root,
    }).catch(() => null);
    if (!result) {
      throw new Error("rg is not available.");
    }

    const command = `rg -n -F --hidden --glob "!node_modules/**" --glob "!.git/**" --glob "!.next/**" --max-count ${Math.max(
      1,
      Math.min(limit, 50)
    )} ${JSON.stringify(query)}`;
    const response = await this.runProcess(command, root, 30_000);
    if (response.exitCode !== 0 && !response.stdout.trim()) {
      return [];
    }

    return response.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = /^(.+?):(\d+):(.*)$/.exec(line);
        if (!match) return null;
        return {
          path: normalizeWorkspaceRelativePath(match[1]) || match[1],
          line: Number(match[2]) || 1,
          preview: match[3].trim(),
        };
      })
      .filter((item): item is { path: string; line: number; preview: string } => Boolean(item))
      .slice(0, Math.max(1, Math.min(limit, 50)));
  }

  private async searchWithWorkspaceFiles(
    query: string,
    limit: number
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const files = await this.listFiles("", 300);
    const matches: Array<{ path: string; line: number; preview: string }> = [];
    const needle = query.toLowerCase();

    for (const filePath of files.files) {
      if (matches.length >= limit) break;
      const absolutePath = toAbsoluteWorkspacePath(filePath);
      if (!absolutePath) continue;
      const raw = await fs.readFile(absolutePath, "utf8").catch(() => null);
      if (!raw) continue;
      const lines = raw.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].toLowerCase().includes(needle)) continue;
        matches.push({
          path: filePath,
          line: index + 1,
          preview: lines[index].trim(),
        });
        if (matches.length >= limit) break;
      }
    }

    return matches;
  }

  private async captureUndoSnapshot(filePath: string): Promise<void> {
    if (!this.checkpoint) {
      this.createCheckpoint("Automatic checkpoint before workspace mutation.");
    }
    if (!this.checkpoint) return;
    if (this.checkpoint.files.some((entry) => entry.path === filePath)) return;

    const absolutePath = toAbsoluteWorkspacePath(filePath);
    if (!absolutePath) return;

    try {
      this.checkpoint.files.push({
        path: filePath,
        existed: true,
        content: await fs.readFile(absolutePath, "utf8"),
      });
    } catch {
      this.checkpoint.files.push({
        path: filePath,
        existed: false,
        content: "",
      });
    }
  }

  private async runProcess(
    command: string,
    cwd: string | undefined,
    timeoutMs: number
  ): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
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
      };
    } catch (error) {
      const typed = error as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
      };
      return {
        command,
        exitCode: typeof typed.code === "number" ? typed.code : 1,
        stdout: String(typed.stdout || ""),
        stderr: String(typed.stderr || ""),
      };
    }
  }
}

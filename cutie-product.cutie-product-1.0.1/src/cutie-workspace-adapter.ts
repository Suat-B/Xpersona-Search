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

/**
 * read_file normalizes CRLF→LF in returned content so the model often proposes LF-only find strings.
 * edit_file must match against on-disk / buffer text, which may still be CRLF on Windows.
 * Try a literal match first, then the same strings after normalizing newlines for comparison only.
 */
function applyEditFindReplace(
  before: string,
  find: string,
  replace: string,
  replaceAll: boolean
): { after: string; replacedCount: number } | null {
  const run = (src: string, f: string, r: string, all: boolean): { after: string; count: number } | null => {
    const occurrences = src.split(f).length - 1;
    if (occurrences <= 0) return null;
    const after = all ? src.split(f).join(r) : src.replace(f, r);
    return { after, count: all ? occurrences : 1 };
  };

  const direct = run(before, find, replace, replaceAll);
  if (direct) return { after: direct.after, replacedCount: direct.count };

  const findNl = find.replace(/\r\n/g, "\n");
  const repNl = replace.replace(/\r\n/g, "\n");
  const beforeNl = before.replace(/\r\n/g, "\n");
  const viaNl = run(beforeNl, findNl, repNl, replaceAll);
  if (!viaNl) return null;

  if (before.includes("\r\n")) {
    return {
      after: viaNl.after.replace(/\n/g, "\r\n"),
      replacedCount: viaNl.count,
    };
  }
  return { after: viaNl.after, replacedCount: viaNl.count };
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

  private openDocumentForAbsolutePath(absolutePath: string): vscode.TextDocument | undefined {
    const resolved = path.resolve(absolutePath);
    return vscode.workspace.textDocuments.find((doc) => path.resolve(doc.uri.fsPath) === resolved);
  }

  private fullDocumentRange(doc: vscode.TextDocument): vscode.Range {
    if (doc.lineCount <= 0) {
      return new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
    }
    const last = doc.lineAt(doc.lineCount - 1);
    return new vscode.Range(new vscode.Position(0, 0), last.range.end);
  }

  /**
   * Baseline for edits: live editor buffer when the file is open (saved or unsaved), else disk.
   * Unsaved buffers are merged by replacing the whole document and saving — no user prompts.
   */
  private async readUtf8Baseline(absolutePath: string, _normalizedPath: string): Promise<{ text: string; existed: boolean }> {
    const open = this.openDocumentForAbsolutePath(absolutePath);
    if (open) {
      return { text: open.getText(), existed: true };
    }
    try {
      const text = await fs.readFile(absolutePath, "utf8");
      return { text, existed: true };
    } catch {
      return { text: "", existed: false };
    }
  }

  private async replaceEntireFileViaWorkspace(uri: vscode.Uri, newText: string, normalizedPath: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const range = this.fullDocumentRange(doc);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, newText);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error(`VS Code did not apply Cutie's edit to "${normalizedPath}".`);
    }
    await vscode.workspace.save(uri);
  }

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
    const open = this.openDocumentForAbsolutePath(absolutePath);
    const raw = open ? open.getText() : await fs.readFile(absolutePath, "utf8");
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
  }): Promise<{ path: string; replacedCount: number; previousContent: string; checkpoint: CutieCheckpoint }> {
    const normalizedPath = normalizeWorkspaceRelativePath(input.path);
    if (!normalizedPath) throw new Error("edit_file requires a workspace-relative path.");
    if (!input.find) throw new Error("edit_file requires a non-empty find string.");

    const absolutePath = toAbsoluteWorkspacePath(normalizedPath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${normalizedPath}`);

    const { text: before, existed } = await this.readUtf8Baseline(absolutePath, normalizedPath);
    if (!existed) {
      throw new Error(`edit_file target does not exist yet: ${normalizedPath}`);
    }
    await this.captureUndoSnapshotWithBaseline(normalizedPath, before, true);

    const applied = applyEditFindReplace(before, input.find, input.replace, Boolean(input.replaceAll));
    if (!applied) {
      throw new Error(`edit_file could not find the requested text in ${normalizedPath}.`);
    }

    const { after, replacedCount } = applied;
    const uri = vscode.Uri.file(absolutePath);
    await this.replaceEntireFileViaWorkspace(uri, after, normalizedPath);

    return {
      path: normalizedPath,
      replacedCount,
      previousContent: before,
      checkpoint: this.createCheckpoint(),
    };
  }

  async writeFile(input: {
    path: string;
    content: string;
    overwrite?: boolean;
  }): Promise<{ path: string; bytes: number; previousContent: string; checkpoint: CutieCheckpoint }> {
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

    const { text: previousContent, existed } = await this.readUtf8Baseline(absolutePath, normalizedPath);
    await this.captureUndoSnapshotWithBaseline(normalizedPath, previousContent, existed);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const uri = vscode.Uri.file(absolutePath);
    const nextContent = String(input.content || "");

    if (!existed) {
      await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(nextContent, "utf8")));
    } else {
      await this.replaceEntireFileViaWorkspace(uri, nextContent, normalizedPath);
    }

    return {
      path: normalizedPath,
      bytes: Buffer.byteLength(nextContent, "utf8"),
      previousContent,
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

  private async captureUndoSnapshotWithBaseline(filePath: string, baselineText: string, existed: boolean): Promise<void> {
    if (!this.checkpoint) {
      this.createCheckpoint("Automatic checkpoint before workspace mutation.");
    }
    if (!this.checkpoint) return;
    if (this.checkpoint.files.some((entry) => entry.path === filePath)) return;

    this.checkpoint.files.push({
      path: filePath,
      existed,
      content: baselineText,
    });
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

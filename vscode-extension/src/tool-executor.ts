import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { ActionRunner } from "./actions";
import { requestJson } from "./api-client";
import { getBaseApiUrl, getWorkspaceRootPath, toAbsoluteWorkspacePath, toWorkspaceRelativePath } from "./config";
import { CloudIndexManager } from "./indexer";
import type {
  PendingToolCall,
  PlaygroundToolName,
  RequestAuth,
  ToolResult,
} from "./shared";

const execAsync = promisify(exec);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function isGitMissingRepositoryOutput(stdout: string, stderr: string): boolean {
  const blob = `${stderr}\n${stdout}`;
  return /not a git repository/i.test(blob);
}

function summarizeCommandFailure(result: {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}): string {
  if (result.timedOut) {
    return `Command timed out: ${result.command}`;
  }
  const detail = String(result.stderr || result.stdout || "").trim();
  return detail
    ? `Command failed (${result.exitCode}): ${detail.slice(0, 400)}`
    : `Command failed (${result.exitCode}): ${result.command}`;
}

function findMutationFailureDetail(details: string[]): string | undefined {
  return details.find((line) =>
    /^(FAIL\b|Skipped\b|Patch failed\b|Patch produced no content change\b|Edit could not create missing file\b)/.test(
      line
    )
  );
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

type WorkspaceMemoryResponse = {
  data?: {
    memory?: {
      summary?: string | null;
      promotedMemories?: string[];
      touchedPaths?: string[];
      enabled?: boolean;
      updatedAt?: string;
    } | null;
  };
};

export class ToolExecutor {
  constructor(
    private readonly actionRunner: ActionRunner,
    private readonly indexManager: CloudIndexManager
  ) {}

  getSupportedTools(): PlaygroundToolName[] {
    return [
      "list_files",
      "read_file",
      "search_workspace",
      "get_diagnostics",
      "git_status",
      "git_diff",
      "create_checkpoint",
      "edit",
      "write_file",
      "mkdir",
      "run_command",
      "get_workspace_memory",
    ];
  }

  async executeToolCall(input: {
    pendingToolCall: PendingToolCall;
    auth: RequestAuth;
    sessionId?: string;
    workspaceFingerprint: string;
    signal?: AbortSignal;
  }): Promise<ToolResult> {
    const toolCall = input.pendingToolCall.toolCall;
    const args = toolCall.arguments || {};

    try {
      if (input.signal?.aborted) {
        throw new Error("Prompt aborted");
      }
      if (toolCall.name === "list_files") {
        const result = await this.listFiles(String(args.query || ""), Number(args.limit || 30));
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Listed ${result.files.length} workspace file(s).`,
          data: result,
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "read_file") {
        const filePath = String(args.path || "");
        const result = await this.readFile(filePath, args.startLine, args.endLine);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Read ${result.path}${result.range ? ` (${result.range})` : ""}.`,
          data: result,
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "search_workspace") {
        const query = String(args.query || "").trim();
        const limit = clamp(Number(args.limit || 6), 1, 12);
        const rows = await this.indexManager.query(query, undefined);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: `Found ${rows.slice(0, limit).length} workspace snippet(s) for "${query}".`,
          data: {
            query,
            matches: rows.slice(0, limit).map((row) => ({
              path: row.path,
              score: row.score,
              source: row.source,
              reason: row.reason,
              content: row.content,
            })),
          },
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "get_diagnostics") {
        const diagnostics = await this.getDiagnostics(typeof args.path === "string" ? args.path : undefined);
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: diagnostics.length
            ? `Collected ${diagnostics.length} diagnostic item(s).`
            : "No current diagnostics were found.",
          data: { diagnostics },
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "git_status") {
        const result = await this.runGitCommand("git status --short");
        const noRepo = isGitMissingRepositoryOutput(result.stdout, result.stderr);
        if (noRepo) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            ok: true,
            summary: "Workspace is not a Git repository; no status to report.",
            data: result,
            createdAt: new Date().toISOString(),
          };
        }
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: result.exitCode === 0,
          summary: result.exitCode === 0 ? "Captured git status." : `git status failed: ${result.stderr || result.stdout}`,
          data: result,
          error: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "git_diff") {
        const command =
          typeof args.path === "string" && args.path.trim()
            ? `git diff -- ${args.path}`
            : "git diff --stat";
        const result = await this.runGitCommand(command);
        const noRepo = isGitMissingRepositoryOutput(result.stdout, result.stderr);
        if (noRepo) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            ok: true,
            summary: "Workspace is not a Git repository; no diff to report.",
            data: result,
            createdAt: new Date().toISOString(),
          };
        }
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: result.exitCode === 0,
          summary: result.exitCode === 0 ? "Captured git diff." : `git diff failed: ${result.stderr || result.stdout}`,
          data: result,
          error: result.exitCode === 0 ? undefined : result.stderr || result.stdout,
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "create_checkpoint") {
        const summary = this.actionRunner.createCheckpoint(
          typeof args.reason === "string" ? args.reason : undefined
        );
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary,
          data: { reason: typeof args.reason === "string" ? args.reason : null },
          createdAt: new Date().toISOString(),
        };
      }

      if (
        toolCall.name === "patch_file" ||
        toolCall.name === "edit_file" ||
        toolCall.name === "edit" ||
        toolCall.name === "write_file" ||
        toolCall.name === "mkdir" ||
        toolCall.name === "run_command"
      ) {
        const report = await this.runMutationTool({
          name: toolCall.name,
          args,
          auth: input.auth,
          sessionId: input.sessionId,
          workspaceFingerprint: input.workspaceFingerprint,
          signal: input.signal,
        });
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: report.ok,
          blocked: report.blocked,
          summary: report.summary,
          data: report.data,
          error: report.error,
          createdAt: new Date().toISOString(),
        };
      }

      if (toolCall.name === "get_workspace_memory") {
        const response = await requestJson<WorkspaceMemoryResponse>(
          "GET",
          `${getBaseApiUrl()}/api/v1/playground/memory/workspace?workspaceFingerprint=${encodeURIComponent(input.workspaceFingerprint)}`,
          input.auth,
          undefined,
          { signal: input.signal }
        );
        const memory = response?.data?.memory || null;
        return {
          toolCallId: toolCall.id,
          name: toolCall.name,
          ok: true,
          summary: memory?.summary
            ? `Loaded workspace memory updated at ${memory.updatedAt || "unknown time"}.`
            : "No persisted workspace memory was found.",
          data: {
            memory,
          },
          createdAt: new Date().toISOString(),
        };
      }

      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        summary: `Unsupported tool ${toolCall.name}.`,
        error: `Unsupported tool ${toolCall.name}.`,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        ok: false,
        summary: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error.message : String(error),
        createdAt: new Date().toISOString(),
      };
    }
  }

  private async listFiles(query: string, limit: number): Promise<{ files: string[] }> {
    const rows = await vscode.workspace.findFiles("**/*", undefined, 2_000);
    const items = rows
      .map((uri) => toWorkspaceRelativePath(uri))
      .filter((value): value is string => Boolean(value))
      .filter((value) => !isExcludedPath(value));
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? items.filter((item) => item.toLowerCase().includes(normalizedQuery))
      : items;
    return {
      files: filtered.sort((a, b) => a.localeCompare(b)).slice(0, clamp(limit, 1, 200)),
    };
  }

  private async readFile(filePath: string, startLineValue: unknown, endLineValue: unknown) {
    const absolutePath = toAbsoluteWorkspacePath(filePath);
    if (!absolutePath) throw new Error(`Invalid workspace-relative path: ${filePath}`);
    const raw = await fs.readFile(absolutePath, "utf8");
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const startLine = Number.isFinite(Number(startLineValue)) ? clamp(Number(startLineValue), 1, lines.length || 1) : 1;
    const endLine = Number.isFinite(Number(endLineValue)) ? clamp(Number(endLineValue), startLine, lines.length || startLine) : Math.min(lines.length || 1, startLine + 199);
    return {
      path: filePath,
      range: `${startLine}-${endLine}`,
      content: lines.slice(startLine - 1, endLine).join("\n"),
      lineCount: lines.length,
    };
  }

  private async getDiagnostics(pathFilter?: string) {
    const normalizedPath = pathFilter?.trim().replace(/\\/g, "/").toLowerCase();
    return vscode.languages
      .getDiagnostics()
      .flatMap(([uri, entries]) =>
        entries.map((entry) => ({
          path: toWorkspaceRelativePath(uri) || undefined,
          severity: entry.severity,
          message: entry.message,
          line: entry.range.start.line + 1,
        }))
      )
      .filter((item) => !normalizedPath || item.path?.toLowerCase() === normalizedPath)
      .slice(0, 100);
  }

  private async runGitCommand(command: string): Promise<{
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const cwd = getWorkspaceRootPath();
    if (!cwd) {
      return {
        command,
        exitCode: 1,
        stdout: "",
        stderr: "Open a workspace folder before running git tools.",
      };
    }
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
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
        code?: number;
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

  private async runMutationTool(input: {
    name: "patch_file" | "edit_file" | "edit" | "write_file" | "mkdir" | "run_command";
    args: Record<string, unknown>;
    auth: RequestAuth;
    sessionId?: string;
    workspaceFingerprint: string;
    signal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    blocked?: boolean;
    summary: string;
    data: Record<string, unknown>;
    error?: string;
  }> {
    const commandCategory: "implementation" | "validation" =
      input.args.category === "implementation" || input.args.category === "validation"
        ? input.args.category
        : "implementation";
    const action =
      input.name === "patch_file" || input.name === "edit_file" || input.name === "edit"
        ? {
            type: "edit" as const,
            path: String(input.args.path || ""),
            patch: String(input.args.patch || ""),
          }
        : input.name === "write_file"
          ? {
              type: "write_file" as const,
              path: String(input.args.path || ""),
              content: String(input.args.content || ""),
              overwrite: typeof input.args.overwrite === "boolean" ? input.args.overwrite : true,
            }
          : input.name === "mkdir"
            ? {
                type: "mkdir" as const,
                path: String(input.args.path || ""),
              }
            : {
                type: "command" as const,
                command: String(input.args.command || ""),
                timeoutMs: typeof input.args.timeoutMs === "number" ? input.args.timeoutMs : undefined,
                category: commandCategory,
              };

    const report = await this.actionRunner.apply({
      mode: input.name === "run_command" ? "yolo" : "auto",
      actions: [action],
      auth: input.auth,
      sessionId: input.sessionId,
      workspaceFingerprint: input.workspaceFingerprint,
      signal: input.signal,
    });

    const changedTarget =
      input.name === "patch_file" || input.name === "edit_file" || input.name === "edit" || input.name === "write_file"
        ? report.changedFiles.includes(String(input.args.path || ""))
        : input.name === "mkdir"
          ? report.createdDirectories.includes(String(input.args.path || ""))
          : report.commandResults.length > 0;
    const commandFailure = report.commandResults.find((result) => result.exitCode !== 0 || result.timedOut);
    const blocked =
      report.blockedActions.length > 0 &&
      report.changedFiles.length === 0 &&
      report.createdDirectories.length === 0 &&
      report.commandResults.length === 0;
    const detailFailure = findMutationFailureDetail(report.details);
    const firstFailure =
      report.blockedActions[0] ||
      (commandFailure ? summarizeCommandFailure(commandFailure) : undefined) ||
      (!changedTarget ? detailFailure || report.summary : undefined);
    const ok = !blocked && !commandFailure && changedTarget;
    return {
      ok,
      blocked,
      summary: ok ? report.summary : firstFailure || report.summary,
      data: {
        changedFiles: report.changedFiles,
        createdDirectories: report.createdDirectories,
        blockedActions: report.blockedActions,
        commandResults: report.commandResults,
        details: report.details,
      },
      error: blocked || firstFailure ? String(firstFailure) : undefined,
    };
  }
}

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { applyUnifiedDiff } from "./patch-utils";
import { collapseConflictingFileActions } from "./apply-recovery-utils";
import { planQuickValidationForFile } from "./validation-utils";
import { requestJson } from "./api-client";
import {
  getBaseApiUrl,
  getWorkspaceRootPath,
  normalizeWorkspaceRelativePath,
  toAbsoluteWorkspacePath,
} from "./config";
import type {
  AssistAction,
  CommandExecutionResult,
  LocalApplyReport,
  Mode,
  RequestAuth,
} from "./shared";

const execAsync = promisify(exec);

type UndoEntry = {
  path: string;
  existed: boolean;
  content: string;
};

type UndoBatch = {
  files: UndoEntry[];
  createdDirectories: string[];
};

type ExecuteApprovalResponse = {
  results?: Array<{
    action?: AssistAction;
    status?: "approved" | "blocked";
    reason?: string;
  }>;
};

function extractContentFromAddPatch(patch: string): string | null {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("-")) return null;
    if (line.startsWith("+") || line.startsWith(" ")) {
      out.push(line.slice(1));
    }
  }

  return out.length ? out.join("\n") : null;
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((value) => String(value || "").trim()).filter(Boolean)));
}

function summarizeCommandResult(result: CommandExecutionResult): string {
  const base = `${result.exitCode === 0 ? "OK" : "FAIL"} ${result.command}`;
  if (result.timedOut) return `${base} (timed out)`;
  if (result.exitCode !== 0 && result.stderr.trim()) return `${base}: ${result.stderr.trim().slice(0, 200)}`;
  return base;
}

export class ActionRunner {
  private undoBatch: UndoBatch | null = null;
  private recentTouchedPaths: string[] = [];
  private workspaceHasLintScript: boolean | null = null;
  private pythonAvailable: boolean | null = null;
  private readonly onDidChangeUndoEmitter = new vscode.EventEmitter<boolean>();

  public readonly onDidChangeUndo = this.onDidChangeUndoEmitter.event;

  getRecentTouchedPaths(): string[] {
    return this.recentTouchedPaths.slice();
  }

  canUndo(): boolean {
    return this.undoBatch !== null;
  }

  async apply(input: {
    mode: Mode;
    actions: AssistAction[];
    auth: RequestAuth;
    sessionId?: string;
    workspaceFingerprint: string;
  }): Promise<LocalApplyReport> {
    if (input.mode === "plan") {
      return {
        summary: "Plan mode does not execute local actions.",
        details: [],
        changedFiles: [],
        blockedActions: [],
        commandResults: [],
        canUndo: this.canUndo(),
      };
    }

    const rootPath = getWorkspaceRootPath();
    if (!rootPath) {
      return {
        summary: "Open a workspace folder before applying local changes.",
        details: [],
        changedFiles: [],
        blockedActions: [],
        commandResults: [],
        canUndo: this.canUndo(),
      };
    }

    const collapsed = collapseConflictingFileActions(input.actions);
    const approval = await requestJson<ExecuteApprovalResponse>(
      "POST",
      `${getBaseApiUrl()}/api/v1/playground/execute`,
      input.auth,
      {
        sessionId: input.sessionId,
        workspaceFingerprint: input.workspaceFingerprint,
        actions: collapsed.actions,
      }
    );

    const approvedActions = (approval.results || [])
      .filter((result) => result.status === "approved" && result.action)
      .map((result) => result.action as AssistAction);
    const blockedActions = (approval.results || [])
      .filter((result) => result.status === "blocked")
      .map((result) => `${result.action?.type || "action"} blocked${result.reason ? `: ${result.reason}` : ""}`);
    const createdDirectories: string[] = [];
    const touchedFiles = uniquePaths(
      approvedActions
        .filter((action): action is Extract<AssistAction, { type: "edit" | "write_file" }> => action.type === "edit" || action.type === "write_file")
        .map((action) => action.path)
    );
    const undoEntries: UndoEntry[] = [];

    for (const filePath of touchedFiles) {
      const absolutePath = toAbsoluteWorkspacePath(filePath);
      if (!absolutePath) continue;
      try {
        undoEntries.push({
          path: filePath,
          existed: true,
          content: await fs.readFile(absolutePath, "utf8"),
        });
      } catch {
        undoEntries.push({
          path: filePath,
          existed: false,
          content: "",
        });
      }
    }

    const details: string[] = [];
    const changedFiles: string[] = [];

    for (const action of approvedActions) {
      if (action.type === "mkdir") {
        const absolutePath = toAbsoluteWorkspacePath(action.path);
        if (!absolutePath) {
          details.push(`Skipped invalid directory path ${action.path}.`);
          continue;
        }
        await fs.mkdir(absolutePath, { recursive: true });
        createdDirectories.push(action.path);
        details.push(`Created directory ${action.path}.`);
        continue;
      }

      if (action.type === "write_file") {
        const absolutePath = toAbsoluteWorkspacePath(action.path);
        if (!absolutePath) {
          details.push(`Skipped invalid file path ${action.path}.`);
          continue;
        }
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        let previous = "";
        try {
          previous = await fs.readFile(absolutePath, "utf8");
        } catch {
          previous = "";
        }
        if (previous === action.content) {
          details.push(`No content change for ${action.path}.`);
          continue;
        }
        await fs.writeFile(absolutePath, action.content, "utf8");
        changedFiles.push(action.path);
        details.push(`Wrote ${action.path}.`);
        continue;
      }

      if (action.type === "edit") {
        const absolutePath = toAbsoluteWorkspacePath(action.path);
        const patch = String(action.patch || action.diff || "");
        if (!absolutePath || !patch.trim()) {
          details.push(`Skipped invalid edit action for ${action.path}.`);
          continue;
        }
        let previous = "";
        let existed = true;
        try {
          previous = await fs.readFile(absolutePath, "utf8");
        } catch {
          existed = false;
        }

        if (!existed) {
          const createdContent = extractContentFromAddPatch(patch);
          if (!createdContent) {
            details.push(`Edit could not create missing file ${action.path}.`);
            continue;
          }
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });
          await fs.writeFile(absolutePath, createdContent, "utf8");
          changedFiles.push(action.path);
          details.push(`Created ${action.path} from additive patch.`);
          continue;
        }

        const result = applyUnifiedDiff(previous, patch);
        if (result.status !== "applied" || typeof result.content !== "string") {
          details.push(`Patch failed for ${action.path}: ${result.reason || result.status}.`);
          continue;
        }
        if (result.content === previous) {
          details.push(`Patch produced no content change for ${action.path}.`);
          continue;
        }
        await fs.writeFile(absolutePath, result.content, "utf8");
        changedFiles.push(action.path);
        details.push(`Patched ${action.path}.`);
      }
    }

    const commandActions = approvedActions.filter(
      (action): action is Extract<AssistAction, { type: "command" }> => action.type === "command"
    );
    const explicitCommands =
      input.mode === "auto"
        ? commandActions.filter((action) => action.category === "validation")
        : commandActions;

    const validationCommands = await this.buildValidationCommands(rootPath, changedFiles);
    const commandQueue = [...explicitCommands.map((action) => ({
      command: action.command,
      timeoutMs: action.timeoutMs ?? 60_000,
    }))];

    for (const command of validationCommands) {
      if (!commandQueue.some((item) => item.command === command.command)) {
        commandQueue.push(command);
      }
    }

    const commandResults: CommandExecutionResult[] = [];
    for (const command of commandQueue) {
      const result = await this.runCommand(command.command, rootPath, command.timeoutMs);
      commandResults.push(result);
      details.push(summarizeCommandResult(result));
    }

    if (changedFiles.length > 0) {
      this.undoBatch = {
        files: undoEntries,
        createdDirectories,
      };
      this.recentTouchedPaths = uniquePaths([...changedFiles, ...this.recentTouchedPaths]).slice(0, 16);
    } else {
      this.undoBatch = null;
    }
    this.onDidChangeUndoEmitter.fire(this.canUndo());

    const summaryParts = [
      changedFiles.length ? `Applied changes to ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}.` : "",
      createdDirectories.length
        ? `Created ${createdDirectories.length} director${createdDirectories.length === 1 ? "y" : "ies"}.`
        : "",
      commandResults.length ? `Ran ${commandResults.length} command${commandResults.length === 1 ? "" : "s"}.` : "",
      blockedActions.length ? `${blockedActions.length} action${blockedActions.length === 1 ? "" : "s"} blocked by policy.` : "",
    ].filter(Boolean);

    return {
      summary: summaryParts.join(" ") || "No local changes were applied.",
      details,
      changedFiles: uniquePaths(changedFiles),
      blockedActions,
      commandResults,
      canUndo: this.canUndo(),
    };
  }

  async undoLastBatch(): Promise<string> {
    if (!this.undoBatch) return "There is no recent Playground change batch to undo.";

    const rootPath = getWorkspaceRootPath();
    if (!rootPath) return "Open a workspace folder before undoing changes.";

    for (const entry of [...this.undoBatch.files].reverse()) {
      const absolutePath = toAbsoluteWorkspacePath(entry.path);
      if (!absolutePath) continue;
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      if (!entry.existed) {
        await fs.rm(absolutePath, { force: true }).catch(() => null);
      } else {
        await fs.writeFile(absolutePath, entry.content, "utf8");
      }
    }

    for (const directory of [...this.undoBatch.createdDirectories].reverse()) {
      const absolutePath = toAbsoluteWorkspacePath(directory);
      if (!absolutePath) continue;
      await fs.rm(absolutePath, { recursive: false, force: true }).catch(() => null);
    }

    this.undoBatch = null;
    this.onDidChangeUndoEmitter.fire(false);
    return "Reverted the last Playground change batch.";
  }

  private async buildValidationCommands(
    workspaceFolder: string,
    changedFiles: string[]
  ): Promise<Array<{ command: string; timeoutMs: number }>> {
    if (changedFiles.length === 0) return [];
    const hasWorkspaceLintScript = await this.hasLintScript(workspaceFolder);
    const pythonAvailable = await this.isPythonAvailable(workspaceFolder);
    const plans = changedFiles.map((filePath) =>
      planQuickValidationForFile({
        filePath,
        absFile: path.join(workspaceFolder, normalizeWorkspaceRelativePath(filePath) || filePath),
        workspaceFolder,
        changed: true,
        hasWorkspaceLintScript,
        pythonAvailable,
      })
    );
    return uniquePaths(plans.flatMap((plan) => plan.commands)).map((command) => ({
      command,
      timeoutMs: 60_000,
    }));
  }

  private async hasLintScript(workspaceFolder: string): Promise<boolean> {
    if (this.workspaceHasLintScript !== null) return this.workspaceHasLintScript;
    try {
      const packageJson = JSON.parse(await fs.readFile(path.join(workspaceFolder, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      this.workspaceHasLintScript = typeof packageJson.scripts?.lint === "string";
    } catch {
      this.workspaceHasLintScript = false;
    }
    return this.workspaceHasLintScript;
  }

  private async isPythonAvailable(workspaceFolder: string): Promise<boolean> {
    if (this.pythonAvailable !== null) return this.pythonAvailable;
    const result = await this.runCommand("python --version", workspaceFolder, 15_000);
    this.pythonAvailable = result.exitCode === 0;
    return this.pythonAvailable;
  }

  private async runCommand(command: string, cwd: string, timeoutMs: number): Promise<CommandExecutionResult> {
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
        stderr: String(typed.stderr || typed.signal || ""),
        timedOut: typed.killed === true,
      };
    }
  }
}

import { PendingToolCall, ToolResult } from "./types.js";
export declare function inferTaskProjectRoot(task: string): string | null;
export declare class CliToolExecutor {
    private readonly workspaceRoot;
    private readonly observedRoots;
    private readonly preferredProjectRoot;
    constructor(workspaceRoot: string, preferredProjectRoot?: string | null);
    private getPreferredObservedRoot;
    private rememberObservedPath;
    private rememberObservedDirectory;
    private maybeRewriteIntoObservedRoot;
    private resolveWithObservedRoot;
    private inferCommandCwd;
    private resolveStaticPath;
    private findNearestGitRoot;
    private inferGitCwd;
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
    private fail;
}

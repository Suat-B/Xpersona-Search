import { PendingToolCall, ToolResult } from "./types.js";
export declare class CliToolExecutor {
    private readonly workspaceRoot;
    private readonly observedRoots;
    constructor(workspaceRoot: string);
    private rememberObservedPath;
    private maybeRewriteIntoObservedRoot;
    private resolveWithObservedRoot;
    private inferCommandCwd;
    private resolveStaticPath;
    execute(pendingToolCall: PendingToolCall): Promise<ToolResult>;
    private fail;
}

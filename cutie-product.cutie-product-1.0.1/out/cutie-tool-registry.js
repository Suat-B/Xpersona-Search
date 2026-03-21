"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieToolRegistry = void 0;
const cutie_policy_1 = require("./cutie-policy");
const TOOL_DEFINITIONS = [
    {
        name: "list_files",
        kind: "observe",
        domain: "workspace",
        description: "List workspace files filtered by an optional substring query.",
        inputShape: '{ "query"?: string, "limit"?: number }',
    },
    {
        name: "read_file",
        kind: "observe",
        domain: "workspace",
        description: "Read a workspace-relative file, optionally with a line range.",
        inputShape: '{ "path": string, "startLine"?: number, "endLine"?: number }',
    },
    {
        name: "search_workspace",
        kind: "observe",
        domain: "workspace",
        description: "Search text across the workspace.",
        inputShape: '{ "query": string, "limit"?: number }',
    },
    {
        name: "get_diagnostics",
        kind: "observe",
        domain: "workspace",
        description: "Read editor diagnostics for the workspace or a single path.",
        inputShape: '{ "path"?: string }',
    },
    {
        name: "git_status",
        kind: "observe",
        domain: "workspace",
        description: "Inspect the current git status.",
        inputShape: "{}",
    },
    {
        name: "git_diff",
        kind: "observe",
        domain: "workspace",
        description: "Inspect git diff statistics or diff for one path.",
        inputShape: '{ "path"?: string }',
    },
    {
        name: "desktop_capture_screen",
        kind: "observe",
        domain: "desktop",
        description: "Capture a local desktop screenshot and return snapshot metadata.",
        inputShape: '{ "displayId"?: string }',
    },
    {
        name: "desktop_get_active_window",
        kind: "observe",
        domain: "desktop",
        description: "Get the currently active desktop window.",
        inputShape: "{}",
    },
    {
        name: "desktop_list_windows",
        kind: "observe",
        domain: "desktop",
        description: "List visible desktop windows.",
        inputShape: "{}",
    },
    {
        name: "create_checkpoint",
        kind: "mutate",
        domain: "workspace",
        description: "Create a local workspace checkpoint before edits.",
        inputShape: '{ "reason"?: string }',
    },
    {
        name: "edit_file",
        kind: "mutate",
        domain: "workspace",
        description: "Replace text inside a workspace file.",
        inputShape: '{ "path": string, "find": string, "replace": string, "replaceAll"?: boolean }',
    },
    {
        name: "write_file",
        kind: "mutate",
        domain: "workspace",
        description: "Write a full file inside the workspace.",
        inputShape: '{ "path": string, "content": string, "overwrite"?: boolean }',
    },
    {
        name: "mkdir",
        kind: "mutate",
        domain: "workspace",
        description: "Create a workspace-relative directory.",
        inputShape: '{ "path": string }',
    },
    {
        name: "run_command",
        kind: "command",
        domain: "workspace",
        description: "Run a non-destructive shell command inside the workspace.",
        inputShape: '{ "command": string, "cwd"?: string, "timeoutMs"?: number }',
    },
    {
        name: "desktop_open_app",
        kind: "mutate",
        domain: "desktop",
        description: "Launch a desktop app locally.",
        inputShape: '{ "app": string, "args"?: string[] }',
    },
    {
        name: "desktop_open_url",
        kind: "mutate",
        domain: "desktop",
        description: "Open a URL in the default browser.",
        inputShape: '{ "url": string }',
    },
    {
        name: "desktop_focus_window",
        kind: "mutate",
        domain: "desktop",
        description: "Focus a local window by id, title, or app.",
        inputShape: '{ "windowId"?: string, "title"?: string, "app"?: string }',
    },
    {
        name: "desktop_click",
        kind: "mutate",
        domain: "desktop",
        description: "Click a display using normalized coordinates from 0 to 1.",
        inputShape: '{ "displayId": string, "normalizedX": number, "normalizedY": number, "button"?: "left" | "right" | "middle", "clickCount"?: number }',
    },
    {
        name: "desktop_type",
        kind: "mutate",
        domain: "desktop",
        description: "Type text into the active desktop window.",
        inputShape: '{ "text": string }',
    },
    {
        name: "desktop_keypress",
        kind: "mutate",
        domain: "desktop",
        description: "Send a desktop keypress chord.",
        inputShape: '{ "keys": string[] }',
    },
    {
        name: "desktop_scroll",
        kind: "mutate",
        domain: "desktop",
        description: "Scroll the active desktop window.",
        inputShape: '{ "deltaX"?: number, "deltaY"?: number }',
    },
    {
        name: "desktop_wait",
        kind: "mutate",
        domain: "desktop",
        description: "Wait for a bounded amount of time.",
        inputShape: '{ "durationMs": number }',
    },
];
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function asString(value, fieldName, options) {
    const normalized = String(value ?? "").trim();
    if (!normalized && !options?.optional) {
        throw new Error(`${fieldName} must be a non-empty string.`);
    }
    return normalized;
}
function asNumber(value, fieldName, options) {
    if ((value === undefined || value === null || value === "") && options?.optional) {
        return Number.NaN;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${fieldName} must be a valid number.`);
    }
    if (options?.min !== undefined && parsed < options.min) {
        throw new Error(`${fieldName} must be at least ${options.min}.`);
    }
    if (options?.max !== undefined && parsed > options.max) {
        throw new Error(`${fieldName} must be at most ${options.max}.`);
    }
    return parsed;
}
function asBoolean(value) {
    return value === true || value === "true";
}
function asStringArray(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new Error(`${fieldName} must be an array of strings.`);
    }
    const normalized = value.map((item) => String(item ?? "").trim()).filter(Boolean);
    if (!normalized.length) {
        throw new Error(`${fieldName} must include at least one string.`);
    }
    return normalized;
}
function maybeString(value) {
    const normalized = String(value ?? "").trim();
    return normalized || undefined;
}
function maybeNumber(value, min, max) {
    if (value === undefined || value === null || value === "")
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error("Expected a number.");
    }
    if (min !== undefined && parsed < min) {
        throw new Error(`Number must be at least ${min}.`);
    }
    if (max !== undefined && parsed > max) {
        throw new Error(`Number must be at most ${max}.`);
    }
    return parsed;
}
function getDefinition(name) {
    const definition = TOOL_DEFINITIONS.find((item) => item.name === name);
    if (!definition) {
        throw new Error(`Unknown Cutie tool: ${name}`);
    }
    return definition;
}
function resultFromCheckpoint(checkpoint) {
    return checkpoint ? { checkpoint } : undefined;
}
class CutieToolRegistry {
    constructor(workspace, desktop) {
        this.workspace = workspace;
        this.desktop = desktop;
    }
    listDefinitions() {
        return TOOL_DEFINITIONS.slice();
    }
    describeToolsForPrompt() {
        return this.listDefinitions()
            .map((tool) => `- ${tool.name} [${tool.kind}/${tool.domain}]: ${tool.description} Args: ${tool.inputShape}`)
            .join("\n");
    }
    getCurrentCheckpoint() {
        return this.workspace.getCurrentCheckpoint();
    }
    async createAutomaticCheckpoint(reason) {
        const checkpoint = this.workspace.createCheckpoint(reason);
        return {
            toolName: "create_checkpoint",
            kind: "mutate",
            domain: "workspace",
            ok: true,
            summary: `Created checkpoint ${checkpoint.id}.`,
            data: { checkpoint },
            checkpoint,
        };
    }
    async execute(toolCall, options) {
        const definition = getDefinition(toolCall.name);
        try {
            const argumentsRecord = asRecord(toolCall.arguments);
            switch (toolCall.name) {
                case "list_files": {
                    const query = maybeString(argumentsRecord.query) || "";
                    const limit = maybeNumber(argumentsRecord.limit, 1, 200) ?? 80;
                    const data = await this.workspace.listFiles(query, limit);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Found ${data.files.length} matching file${data.files.length === 1 ? "" : "s"}.`,
                        data,
                    };
                }
                case "read_file": {
                    const filePath = asString(argumentsRecord.path, "path");
                    const startLine = maybeNumber(argumentsRecord.startLine, 1);
                    const endLine = maybeNumber(argumentsRecord.endLine, 1);
                    const data = await this.workspace.readFile(filePath, startLine, endLine);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Read ${data.path}${data.range ? ` lines ${data.range}` : ""}.`,
                        data,
                    };
                }
                case "search_workspace": {
                    const query = asString(argumentsRecord.query, "query");
                    const limit = maybeNumber(argumentsRecord.limit, 1, 50) ?? 20;
                    const data = await this.workspace.searchWorkspace(query, limit);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Found ${data.matches.length} workspace match${data.matches.length === 1 ? "" : "es"}.`,
                        data: { query: data.query, matches: data.matches },
                    };
                }
                case "get_diagnostics": {
                    const filePath = maybeString(argumentsRecord.path);
                    const diagnostics = await this.workspace.getDiagnostics(filePath);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Collected ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}.`,
                        data: { diagnostics },
                    };
                }
                case "git_status": {
                    const data = await this.workspace.gitStatus();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: "Collected git status.",
                        data,
                    };
                }
                case "git_diff": {
                    const filePath = maybeString(argumentsRecord.path);
                    const data = await this.workspace.gitDiff(filePath);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: filePath ? `Collected git diff for ${filePath}.` : "Collected git diff summary.",
                        data,
                    };
                }
                case "desktop_capture_screen": {
                    const displayId = maybeString(argumentsRecord.displayId);
                    const snapshot = await this.desktop.captureScreen(displayId);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Captured snapshot ${snapshot.snapshotId}.`,
                        data: { snapshot },
                        snapshot,
                    };
                }
                case "desktop_get_active_window": {
                    const window = await this.desktop.getActiveWindow();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: window ? "Captured active window information." : "No active window information was available.",
                        data: { window },
                    };
                }
                case "desktop_list_windows": {
                    const windows = await this.desktop.listWindows();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Found ${windows.length} window${windows.length === 1 ? "" : "s"}.`,
                        data: { windows },
                    };
                }
                case "create_checkpoint": {
                    const checkpoint = this.workspace.createCheckpoint(maybeString(argumentsRecord.reason));
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Created checkpoint ${checkpoint.id}.`,
                        data: { checkpoint },
                        checkpoint,
                    };
                }
                case "edit_file": {
                    const data = await this.workspace.editFile({
                        path: asString(argumentsRecord.path, "path"),
                        find: asString(argumentsRecord.find, "find"),
                        replace: String(argumentsRecord.replace ?? ""),
                        replaceAll: asBoolean(argumentsRecord.replaceAll),
                    });
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Updated ${data.path} with ${data.replacedCount} replacement${data.replacedCount === 1 ? "" : "s"}.`,
                        data: {
                            path: data.path,
                            replacedCount: data.replacedCount,
                            previousContent: data.previousContent,
                            ...resultFromCheckpoint(data.checkpoint),
                        },
                        checkpoint: data.checkpoint,
                    };
                }
                case "write_file": {
                    const data = await this.workspace.writeFile({
                        path: asString(argumentsRecord.path, "path"),
                        content: String(argumentsRecord.content ?? ""),
                        overwrite: asBoolean(argumentsRecord.overwrite),
                    });
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Wrote ${data.path}.`,
                        data: {
                            path: data.path,
                            bytes: data.bytes,
                            previousContent: data.previousContent,
                            ...resultFromCheckpoint(data.checkpoint),
                        },
                        checkpoint: data.checkpoint,
                    };
                }
                case "mkdir": {
                    const data = await this.workspace.mkdir(asString(argumentsRecord.path, "path"));
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Created directory ${data.path}.`,
                        data: {
                            path: data.path,
                            ...resultFromCheckpoint(data.checkpoint),
                        },
                        checkpoint: data.checkpoint,
                    };
                }
                case "run_command": {
                    const data = await this.workspace.runCommand({
                        command: asString(argumentsRecord.command, "command"),
                        cwd: maybeString(argumentsRecord.cwd),
                        timeoutMs: maybeNumber(argumentsRecord.timeoutMs, 100, 300000),
                    });
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: data.exitCode === 0,
                        summary: data.exitCode === 0 ? "Command completed." : `Command exited with code ${data.exitCode}.`,
                        data,
                        error: data.exitCode === 0 ? undefined : data.stderr || data.stdout || `Command exited with code ${data.exitCode}.`,
                    };
                }
                case "desktop_open_app": {
                    const app = asString(argumentsRecord.app, "app");
                    const args = Array.isArray(argumentsRecord.args)
                        ? argumentsRecord.args.map((item) => String(item ?? "")).filter(Boolean)
                        : [];
                    await this.desktop.openApp(app, args);
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Opened app ${app}.`,
                        data: { app, args },
                    };
                }
                case "desktop_open_url": {
                    const url = asString(argumentsRecord.url, "url");
                    await this.desktop.openUrl(url);
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Opened ${url}.`,
                        data: { url },
                    };
                }
                case "desktop_focus_window": {
                    const windowId = maybeString(argumentsRecord.windowId);
                    const title = maybeString(argumentsRecord.title);
                    const app = maybeString(argumentsRecord.app);
                    const validation = (0, cutie_policy_1.validateWindowTarget)([windowId, title, app].filter(Boolean).join(" "));
                    if (!validation.ok) {
                        return {
                            toolName: toolCall.name,
                            kind: definition.kind,
                            domain: definition.domain,
                            ok: false,
                            blocked: true,
                            summary: validation.reason || "Window target blocked.",
                            error: validation.reason || "Window target blocked.",
                        };
                    }
                    await this.desktop.focusWindow({ windowId, title, app });
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: "Focused the requested window.",
                        data: { windowId, title, app },
                    };
                }
                case "desktop_click": {
                    const displayId = asString(argumentsRecord.displayId, "displayId");
                    const normalizedX = asNumber(argumentsRecord.normalizedX, "normalizedX", { min: 0, max: 1 });
                    const normalizedY = asNumber(argumentsRecord.normalizedY, "normalizedY", { min: 0, max: 1 });
                    const button = maybeString(argumentsRecord.button);
                    const clickCount = maybeNumber(argumentsRecord.clickCount, 1, 4) ?? 1;
                    await this.desktop.click({
                        displayId,
                        normalizedX,
                        normalizedY,
                        button,
                        clickCount,
                    });
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Clicked ${button || "left"} on ${displayId}.`,
                        data: { displayId, normalizedX, normalizedY, button: button || "left", clickCount },
                    };
                }
                case "desktop_type": {
                    const text = asString(argumentsRecord.text, "text");
                    await this.desktop.typeText(text);
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Typed ${text.length} character${text.length === 1 ? "" : "s"}.`,
                        data: { textLength: text.length },
                    };
                }
                case "desktop_keypress": {
                    const keys = asStringArray(argumentsRecord.keys, "keys");
                    await this.desktop.keypress(keys);
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Pressed ${keys.join("+")}.`,
                        data: { keys },
                    };
                }
                case "desktop_scroll": {
                    const deltaX = maybeNumber(argumentsRecord.deltaX, -20000, 20000) ?? 0;
                    const deltaY = maybeNumber(argumentsRecord.deltaY, -20000, 20000) ?? 0;
                    await this.desktop.scroll({ deltaX, deltaY });
                    this.desktop.invalidateDesktopContextCache();
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: "Scrolled the active window.",
                        data: { deltaX, deltaY },
                    };
                }
                case "desktop_wait": {
                    const durationMs = asNumber(argumentsRecord.durationMs, "durationMs", { min: 0, max: 120000 });
                    await this.desktop.wait(durationMs, options?.signal);
                    return {
                        toolName: toolCall.name,
                        kind: definition.kind,
                        domain: definition.domain,
                        ok: true,
                        summary: `Waited ${Math.round(durationMs)}ms.`,
                        data: { durationMs: Math.round(durationMs) },
                    };
                }
                default:
                    throw new Error(`Unsupported tool ${toolCall.name}`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                toolName: toolCall.name,
                kind: definition.kind,
                domain: definition.domain,
                ok: false,
                blocked: /blocked|disabled/.test(message.toLowerCase()),
                summary: `${toolCall.name} failed.`,
                error: message,
            };
        }
    }
}
exports.CutieToolRegistry = CutieToolRegistry;
//# sourceMappingURL=cutie-tool-registry.js.map
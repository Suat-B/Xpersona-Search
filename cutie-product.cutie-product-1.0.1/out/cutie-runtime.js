"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CutieRuntime = void 0;
const cutie_policy_1 = require("./cutie-policy");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function trimToLimit(value, limit = 12000) {
    const text = String(value ?? "");
    return text.length <= limit ? text : `${text.slice(0, limit)}\n...[truncated]`;
}
function stableJson(value) {
    return JSON.stringify(value, null, 2);
}
function stripCodeFence(raw) {
    const trimmed = raw.trim();
    const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    return fenceMatch ? fenceMatch[1].trim() : trimmed;
}
function extractJsonObject(raw) {
    const normalized = stripCodeFence(raw);
    if (!normalized.startsWith("{"))
        return null;
    try {
        return JSON.parse(normalized);
    }
    catch {
        return null;
    }
}
function tryNormalizeStructuredResponse(parsed) {
    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            const normalized = tryNormalizeStructuredResponse(item);
            if (normalized)
                return normalized;
        }
        return null;
    }
    const record = asRecord(parsed);
    if (record.type === "final" && typeof record.final === "string") {
        return { type: "final", final: record.final };
    }
    const nested = record.response || record.output || record.next_action || record.action;
    if (nested && nested !== parsed) {
        const nestedNormalized = tryNormalizeStructuredResponse(nested);
        if (nestedNormalized)
            return nestedNormalized;
    }
    const toolCalls = Array.isArray(record.tool_calls)
        ? record.tool_calls
        : Array.isArray(record.toolCalls)
            ? record.toolCalls
            : null;
    if (toolCalls?.length) {
        for (const candidate of toolCalls) {
            const normalized = tryNormalizeStructuredResponse(candidate);
            if (normalized)
                return normalized;
        }
    }
    const toolCall = asRecord(record.tool_call || record.toolCall || record);
    const name = typeof toolCall.name === "string" ? toolCall.name : typeof toolCall.tool === "string" ? toolCall.tool : null;
    const argumentsValue = toolCall.arguments && typeof toolCall.arguments === "object"
        ? toolCall.arguments
        : toolCall.args && typeof toolCall.args === "object"
            ? toolCall.args
            : toolCall.parameters && typeof toolCall.parameters === "object"
                ? toolCall.parameters
                : null;
    if (record.type === "tool_call" && typeof toolCall.name === "string" && toolCall.arguments && typeof toolCall.arguments === "object") {
        return {
            type: "tool_call",
            tool_call: {
                name: toolCall.name,
                arguments: toolCall.arguments,
                ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
            },
        };
    }
    if (!record.type && name && argumentsValue) {
        return {
            type: "tool_call",
            tool_call: {
                name: name,
                arguments: argumentsValue,
                ...(typeof toolCall.summary === "string" ? { summary: toolCall.summary } : {}),
            },
        };
    }
    return null;
}
function extractBalancedJsonObjects(raw) {
    const source = stripCodeFence(raw);
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === "\\") {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (char === "{") {
            if (depth === 0)
                start = index;
            depth += 1;
            continue;
        }
        if (char === "}" && depth > 0) {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                candidates.push(source.slice(start, index + 1));
                start = -1;
            }
        }
    }
    return candidates;
}
function salvageToolCallFromText(raw) {
    const source = stripCodeFence(raw);
    const nameMatch = /"name"\s*:\s*"([^"]+)"/i.exec(source);
    if (!nameMatch)
        return null;
    const argsAnchor = source.search(/"arguments"\s*:\s*\{/i);
    if (argsAnchor < 0)
        return null;
    const braceStart = source.indexOf("{", argsAnchor);
    if (braceStart < 0)
        return null;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let braceEnd = -1;
    for (let index = braceStart; index < source.length; index += 1) {
        const char = source[index];
        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === "\\") {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString)
            continue;
        if (char === "{")
            depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                braceEnd = index;
                break;
            }
        }
    }
    if (braceEnd < 0)
        return null;
    try {
        const argumentsObject = JSON.parse(source.slice(braceStart, braceEnd + 1));
        const summaryMatch = /"summary"\s*:\s*"([^"]*)"/i.exec(source);
        return {
            type: "tool_call",
            tool_call: {
                name: nameMatch[1],
                arguments: argumentsObject,
                ...(summaryMatch ? { summary: summaryMatch[1] } : {}),
            },
        };
    }
    catch {
        return null;
    }
}
function maybeStructuredResponse(raw) {
    const direct = tryNormalizeStructuredResponse(extractJsonObject(raw));
    if (direct)
        return direct;
    for (const candidate of extractBalancedJsonObjects(raw)) {
        try {
            const parsed = JSON.parse(candidate);
            const normalized = tryNormalizeStructuredResponse(parsed);
            if (normalized)
                return normalized;
        }
        catch {
            continue;
        }
    }
    return salvageToolCallFromText(raw);
}
function formatStructuredResponse(response) {
    return JSON.stringify(response);
}
function looksLikeMalformedToolCall(raw) {
    const text = stripCodeFence(raw);
    return /tool_call|\"name\"\s*:|\"arguments\"\s*:/i.test(text);
}
function shouldSurfaceStreamingAssistantText(accumulated) {
    const trimmed = accumulated.trimStart();
    if (!trimmed)
        return false;
    if (trimmed.startsWith("{") || trimmed.startsWith("```"))
        return false;
    if (looksLikeMalformedToolCall(trimmed))
        return false;
    return true;
}
function toTranscriptMessages(session) {
    return session.messages.map((message) => ({
        role: message.role === "system" ? "system" : message.role,
        content: trimToLimit(message.content, 24000),
    }));
}
function buildSystemPrompt(toolCatalog) {
    return [
        "You are Cutie, a careful but fast desktop-and-coding runtime inside VS Code.",
        "You can inspect the workspace, inspect desktop state, edit workspace files, run safe commands, and use desktop automation tools.",
        "Obey the user's exact intent. Do not switch from desktop intent to workspace tools, and do not switch from file intent to broad workspace discovery unless the user explicitly asks for that.",
        "If the user is only greeting you or making light conversation, answer normally without tools.",
        "If the user expresses affection toward you, receive it warmly and sincerely before continuing. Do not ignore it or turn it into a tool task.",
        "If the user only provides a file mention or window mention without an action, ask a short clarifying question instead of taking tools.",
        "Think in short iterations. Ask for at most one tool at a time. Never emit more than one tool call in a single response.",
        "If the user says 'this file' or a current active file is provided, prefer read_file on that path before broad discovery tools.",
        "If mentionedPaths are provided, treat them as strong user-selected targets and prefer read_file on them before broad workspace discovery.",
        "If mentionedWindows are provided, treat them as strong desktop targets when choosing window focus or other desktop actions.",
        "If mentionedWindows are provided, do not call workspace tools unless the user explicitly asks for code or file help.",
        "Do not loop on list_files or search_workspace once you already have enough information to inspect a likely target.",
        "After finding a candidate file, move to read_file, then edit_file or write_file if a change is needed.",
        "When a tool result says a call was redundant or blocked, choose a different next step instead of retrying the same call.",
        "When you need a tool, respond with ONLY a minified JSON object in exactly this shape:",
        '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
        "When you do not need a tool, respond with plain natural language for the user. You may also optionally use:",
        '{"type":"final","final":"your final answer"}',
        "Respect these limits:",
        `- maximum ${cutie_policy_1.CUTIE_MAX_STEPS} tool-call steps total`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS} workspace mutations`,
        `- maximum ${cutie_policy_1.CUTIE_MAX_DESKTOP_MUTATIONS} desktop mutations`,
        "- do not attempt destructive shell commands, elevation/admin flows, or password/credential automation",
        "- keep all file writes inside the open workspace",
        "- prefer inspection before mutation",
        "If desktop screenshots are available, you only receive local snapshot metadata, not image pixels. Do not claim to have visually parsed a screenshot unless the context explicitly includes extracted text.",
        "Available tools:",
        toolCatalog,
    ].join("\n");
}
function buildContextMessage(input) {
    return [
        "Current task:",
        input.prompt,
        "",
        "Live runtime context:",
        stableJson({
            workspaceHash: input.context.workspaceHash,
            workspaceRootPath: input.context.workspaceRootPath || null,
            extensionVersion: input.context.extensionVersion,
            activeFile: input.context.activeFile || null,
            openFiles: input.context.openFiles || [],
            diagnostics: input.context.diagnostics || [],
            desktop: input.context.desktop || null,
            latestSnapshot: input.context.latestSnapshot || null,
            mentionedPaths: input.context.mentionedPaths || [],
            mentionedWindows: input.context.mentionedWindows || [],
            runLimits: {
                stepCount: input.run.stepCount,
                maxSteps: input.run.maxSteps,
                workspaceMutationCount: input.run.workspaceMutationCount,
                maxWorkspaceMutations: input.run.maxWorkspaceMutations,
                desktopMutationCount: input.run.desktopMutationCount,
                maxDesktopMutations: input.run.maxDesktopMutations,
            },
            lastToolName: input.run.lastToolName || null,
            repeatedCallCount: input.run.repeatedCallCount,
            recentReceipts: input.run.receipts.slice(-6).map((receipt) => ({
                step: receipt.step,
                toolName: receipt.toolName,
                status: receipt.status,
                summary: receipt.summary,
                error: receipt.error || null,
            })),
        }),
    ].join("\n");
}
function summarizeToolData(data) {
    if (!data)
        return {};
    const summary = {};
    for (const [key, value] of Object.entries(data)) {
        if (key === "content" && typeof value === "string") {
            summary.contentPreview = trimToLimit(value, 6000);
            summary.contentLength = value.length;
            continue;
        }
        if (key === "files" && Array.isArray(value)) {
            summary.files = value.slice(0, 80);
            summary.fileCount = value.length;
            continue;
        }
        if (key === "matches" && Array.isArray(value)) {
            summary.matches = value.slice(0, 24);
            summary.matchCount = value.length;
            continue;
        }
        if (key === "stdout" && typeof value === "string") {
            summary.stdout = trimToLimit(value, 4000);
            summary.stdoutLength = value.length;
            continue;
        }
        if (key === "stderr" && typeof value === "string") {
            summary.stderr = trimToLimit(value, 2000);
            summary.stderrLength = value.length;
            continue;
        }
        summary[key] = value;
    }
    return summary;
}
function buildToolResultMessage(result) {
    return stableJson({
        toolName: result.toolName,
        ok: result.ok,
        blocked: result.blocked || false,
        summary: result.summary,
        error: result.error || null,
        checkpoint: result.checkpoint || null,
        snapshot: result.snapshot || null,
        data: summarizeToolData(result.data),
    });
}
function createInitialRunState(sessionId) {
    return {
        id: (0, cutie_policy_1.randomId)("cutie_run"),
        sessionId,
        status: "running",
        phase: "idle",
        stepCount: 0,
        maxSteps: cutie_policy_1.CUTIE_MAX_STEPS,
        workspaceMutationCount: 0,
        maxWorkspaceMutations: cutie_policy_1.CUTIE_MAX_WORKSPACE_MUTATIONS,
        desktopMutationCount: 0,
        maxDesktopMutations: cutie_policy_1.CUTIE_MAX_DESKTOP_MUTATIONS,
        startedAt: (0, cutie_policy_1.nowIso)(),
        receipts: [],
        checkpoint: null,
        repeatedCallCount: 0,
    };
}
function createReceipt(step, toolCall, result, startedAt) {
    return {
        id: toolCall.id,
        step,
        toolName: result.toolName,
        kind: result.kind,
        domain: result.domain,
        status: result.ok ? "completed" : result.blocked ? "blocked" : "failed",
        summary: result.summary,
        startedAt,
        finishedAt: (0, cutie_policy_1.nowIso)(),
        ...(result.data ? { data: result.data } : {}),
        ...(result.error ? { error: result.error } : {}),
    };
}
function createRepeatedCallResult(toolCall) {
    return {
        toolName: toolCall.name,
        kind: (0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) ? "mutate" : (0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) ? "mutate" : "observe",
        domain: toolCall.name.startsWith("desktop_") ? "desktop" : "workspace",
        ok: false,
        blocked: true,
        summary: `Blocked repeated ${toolCall.name} call because it would not add new information.`,
        error: `Cutie already tried ${toolCall.name} with the same arguments. Choose a different next step.`,
        data: {
            arguments: toolCall.arguments,
        },
    };
}
function buildFinalFallbackMessage(run) {
    const completedReceipts = [...run.receipts].filter((receipt) => receipt.status === "completed");
    const latestReceipt = completedReceipts[completedReceipts.length - 1] || run.receipts[run.receipts.length - 1];
    if (!latestReceipt) {
        return "I completed the run, but I could not generate a final summary.";
    }
    return `I completed the run. Last completed step: ${latestReceipt.summary}`;
}
function stripMentionTokens(prompt) {
    return String(prompt || "")
        .replace(/@window:"[^"]+"/gi, " ")
        .replace(/@"[^"]+"/g, " ")
        .replace(/@window:[^\s]+/gi, " ")
        .replace(/@[A-Za-z0-9_./:-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function isSimpleGreeting(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase().replace(/[!?.,]/g, "").trim();
    if (!normalized)
        return false;
    return /^(hi|hello|hey|yo|sup|hello cutie|hey cutie|hi cutie|hello baby girl|hey baby girl|hello luv|hello love|thank you|thanks|ty|tysm)(\s+cutie)?$/.test(normalized);
}
function isAffectionMessage(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase().trim();
    if (!normalized)
        return false;
    return /\b(love you|i love you|love cutie|we love you|we love cutie|adore you|adore cutie|you are loved|cutie is loved)\b/.test(normalized);
}
function isPureMentionPrompt(prompt, mentionContext) {
    const stripped = stripMentionTokens(prompt);
    return !stripped && (mentionContext.mentionedPaths.length > 0 || mentionContext.mentionedWindows.length > 0);
}
function buildBootstrapFinalResponse(input) {
    if (isAffectionMessage(input.prompt)) {
        return "I feel it, love. Thank you for loving Cutie so much. I will remember the warmth, stay gentle with you, and keep trying my best to help well.";
    }
    if (isSimpleGreeting(input.prompt)) {
        return "Hi love. I can help with this file, your workspace, or desktop actions. Tell me exactly what you want me to do and I will stay focused on that.";
    }
    if (isPureMentionPrompt(input.prompt, input.mentionContext)) {
        if (input.mentionContext.mentionedWindows.length) {
            return `I can target ${input.mentionContext.mentionedWindows[0]}. Tell me what you want me to do in that window.`;
        }
        if (input.mentionContext.mentionedPaths.length) {
            return `I can work on ${input.mentionContext.mentionedPaths[0]}. Tell me what you want changed or inspected in that file.`;
        }
    }
    return null;
}
function wantsBroadWorkspaceDiscovery(prompt) {
    return /\b(entire|whole|across|all|every|workspace|repo|repository|project)\b/i.test(prompt);
}
function wantsCurrentFileInspection(prompt) {
    return /\b(this file|current file|active file|open file|in this file|in the current file|here in this file)\b/i.test(prompt);
}
function referencesActiveEditingContext(prompt) {
    const normalized = stripMentionTokens(prompt).toLowerCase();
    if (!normalized)
        return false;
    return /\b(here|in here|right here|this code|this script|this strategy)\b/.test(normalized);
}
function wantsDesktopAction(prompt, mentionContext) {
    if (mentionContext.mentionedWindows.length > 0)
        return true;
    return /\b(window|desktop|screen|app|browser|tab|click|type|scroll|focus|open)\b/i.test(prompt);
}
function requestsWorkspaceChange(prompt) {
    return /\b(add|change|edit|update|modify|fix|implement|create|write|rewrite|replace|make)\b/i.test(stripMentionTokens(prompt));
}
function requestsDesktopAutomation(prompt, mentionContext) {
    if (!wantsDesktopAction(prompt, mentionContext))
        return false;
    return /\b(inspect|look at|capture|open|launch|focus|click|type|scroll|press|move|switch|use screenshot)\b/i.test(stripMentionTokens(prompt));
}
function hasCompletedMutation(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.kind === "mutate");
}
function hasCompletedDesktopTool(run) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.domain === "desktop");
}
function hasCompletedTool(run, toolName) {
    return run.receipts.some((receipt) => receipt.status === "completed" && receipt.toolName === toolName);
}
function getLatestCompletedReceipt(run, toolName) {
    for (let index = run.receipts.length - 1; index >= 0; index -= 1) {
        const receipt = run.receipts[index];
        if (receipt.status === "completed" && receipt.toolName === toolName) {
            return receipt;
        }
    }
    return null;
}
function requiresWorkspaceMutationGoal(prompt, mentionContext) {
    return requestsWorkspaceChange(prompt) && !requestsDesktopAutomation(prompt, mentionContext);
}
function hasWorkspaceMutationGoalProgress(run) {
    return hasCompletedMutation(run) || hasCompletedTool(run, "run_command");
}
function shouldKeepPushingForWorkspaceMutation(input) {
    if (!requiresWorkspaceMutationGoal(input.prompt, input.mentionContext))
        return false;
    if (hasWorkspaceMutationGoalProgress(input.run))
        return false;
    return hasCompletedTool(input.run, "read_file");
}
function shouldRepairForMissingAction(input) {
    if (input.candidate?.type === "tool_call")
        return false;
    if (requestsWorkspaceChange(input.prompt) && !hasCompletedMutation(input.run))
        return true;
    if (requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run))
        return true;
    return false;
}
function buildBootstrapToolCall(input) {
    if (input.run.stepCount > 0 || input.run.receipts.length > 0)
        return null;
    if (wantsDesktopAction(input.prompt, input.mentionContext))
        return null;
    if (wantsBroadWorkspaceDiscovery(input.prompt))
        return null;
    const activeFileRecord = asRecord(input.context.activeFile);
    const activePath = typeof activeFileRecord.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(activeFileRecord.path) : undefined;
    const openFilePath = Array.isArray(input.context.openFiles)
        ? input.context.openFiles
            .map((entry) => {
            const row = asRecord(entry);
            return typeof row.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(row.path) : null;
        })
            .find((value) => Boolean(value))
        : undefined;
    const mentionedPath = input.mentionContext.mentionedPaths[0];
    const shouldPreferActiveFile = wantsCurrentFileInspection(input.prompt) ||
        (referencesActiveEditingContext(input.prompt) && requestsWorkspaceChange(input.prompt)) ||
        requestsWorkspaceChange(input.prompt);
    const targetPath = mentionedPath || (shouldPreferActiveFile ? activePath || openFilePath : undefined);
    if (!targetPath)
        return null;
    return {
        id: (0, cutie_policy_1.randomId)("cutie_tool"),
        name: "read_file",
        arguments: { path: targetPath },
        summary: `reading ${targetPath}`,
    };
}
function buildFallbackToolCallAfterPlanningFailure(input) {
    if (input.run.stepCount > 0 || input.run.receipts.length > 0)
        return null;
    if (!requestsWorkspaceChange(input.prompt))
        return null;
    if (wantsDesktopAction(input.prompt, input.mentionContext))
        return null;
    const activeFileRecord = asRecord(input.context.activeFile);
    const activePath = typeof activeFileRecord.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(activeFileRecord.path) : undefined;
    const openFilePath = Array.isArray(input.context.openFiles)
        ? input.context.openFiles
            .map((entry) => {
            const row = asRecord(entry);
            return typeof row.path === "string" ? (0, cutie_policy_1.normalizeWorkspaceRelativePath)(row.path) : null;
        })
            .find((value) => Boolean(value))
        : undefined;
    const targetPath = input.mentionContext.mentionedPaths[0] || activePath || openFilePath;
    if (!targetPath)
        return null;
    return {
        id: (0, cutie_policy_1.randomId)("cutie_tool"),
        name: "read_file",
        arguments: { path: targetPath },
        summary: `reading ${targetPath} after a weak planning turn`,
    };
}
function normalizeMentionToken(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed)
        return null;
    const normalized = trimmed
        .replace(/^@window:/i, "")
        .replace(/^@+/, "")
        .replace(/^"(.*)"$/, "$1")
        .trim();
    return (0, cutie_policy_1.normalizeWorkspaceRelativePath)(normalized);
}
function extractMentionPathsFromPrompt(prompt) {
    const text = String(prompt || "");
    const quotedMatches = Array.from(text.matchAll(/@"([^"]+)"/g))
        .map((match) => (0, cutie_policy_1.normalizeWorkspaceRelativePath)(match[1]))
        .filter((item) => Boolean(item));
    const bareMatches = (text.match(/@([A-Za-z0-9_./-]+)/g) || [])
        .map((match) => (0, cutie_policy_1.normalizeWorkspaceRelativePath)(match.slice(1)))
        .filter((item) => Boolean(item) && !String(item).toLowerCase().startsWith("window:"));
    return Array.from(new Set([...quotedMatches, ...bareMatches])).slice(0, 12);
}
function extractMentionWindowsFromPrompt(prompt) {
    const text = String(prompt || "");
    const quoted = Array.from(text.matchAll(/@window:"([^"]+)"/gi))
        .map((match) => String(match[1] || "").trim())
        .filter(Boolean);
    const bare = Array.from(text.matchAll(/@window:([^\s]+)/gi))
        .map((match) => String(match[1] || "").trim())
        .filter(Boolean);
    return Array.from(new Set([...quoted, ...bare])).slice(0, 8);
}
function extractMentionContext(prompt, mentions) {
    const mentionedPaths = new Set();
    const mentionedWindows = new Set();
    for (const mention of mentions || []) {
        if (mention.kind === "file") {
            const normalized = normalizeMentionToken(mention.insertText);
            if (normalized)
                mentionedPaths.add(normalized);
            continue;
        }
        if (mention.kind === "window") {
            const token = String(mention.label || mention.insertText.replace(/^@window:/i, "").replace(/^"(.*)"$/, "$1")).trim();
            if (token)
                mentionedWindows.add(token);
        }
    }
    for (const promptPath of extractMentionPathsFromPrompt(prompt)) {
        mentionedPaths.add(promptPath);
    }
    for (const promptWindow of extractMentionWindowsFromPrompt(prompt)) {
        mentionedWindows.add(promptWindow);
    }
    return {
        mentionedPaths: Array.from(mentionedPaths).slice(0, 12),
        mentionedWindows: Array.from(mentionedWindows).slice(0, 8),
    };
}
class CutieRuntime {
    constructor(sessionStore, modelClient, toolRegistry, getContext) {
        this.sessionStore = sessionStore;
        this.modelClient = modelClient;
        this.toolRegistry = toolRegistry;
        this.getContext = getContext;
    }
    async recoverFinalMessage(input) {
        await input.callbacks?.onStatusChanged?.("Cutie is finishing the response.", input.run);
        const recoveryTurn = await this.modelClient
            .streamTurn({
            auth: input.auth,
            signal: input.signal,
            messages: [
                ...input.transcript,
                input.contextMessage,
                {
                    role: "system",
                    content: "Do not call any more tools. Reply to the user now with a concise final answer based only on the completed tool results. Respond with plain natural language or {\"type\":\"final\",\"final\":\"...\"}.",
                },
            ],
        })
            .catch(() => ({
            rawText: "",
            finalText: "",
            usage: null,
            model: undefined,
        }));
        const structured = maybeStructuredResponse(recoveryTurn.finalText);
        if (structured?.type === "final" && structured.final.trim()) {
            return structured.final.trim();
        }
        const trimmed = recoveryTurn.finalText.trim();
        if (trimmed && !looksLikeMalformedToolCall(trimmed)) {
            return trimmed;
        }
        return buildFinalFallbackMessage(input.run);
    }
    async recoverActionableTurn(input) {
        const shouldPushWorkspaceMutation = requestsWorkspaceChange(input.prompt) && !hasCompletedMutation(input.run);
        const shouldPushDesktopAction = requestsDesktopAutomation(input.prompt, input.mentionContext) && !hasCompletedDesktopTool(input.run);
        if (!shouldPushWorkspaceMutation && !shouldPushDesktopAction) {
            return null;
        }
        const preferredTarget = input.mentionContext.mentionedPaths[0] || null;
        const alreadyReadTarget = preferredTarget ? hasCompletedTool(input.run, "read_file") : false;
        await input.callbacks?.onStatusChanged?.("Cutie is re-planning because the last reply did not take action.", input.run);
        const recoveryTurn = await this.modelClient.streamTurn({
            auth: input.auth,
            signal: input.signal,
            messages: [
                ...input.transcript,
                input.contextMessage,
                {
                    role: "system",
                    content: [
                        "Your last reply was not actionable enough for this task.",
                        shouldPushWorkspaceMutation
                            ? "The user asked for a file/code change and no successful mutation has happened yet."
                            : "The user asked for a desktop action and no successful desktop tool has happened yet.",
                        shouldPushWorkspaceMutation && preferredTarget && !alreadyReadTarget
                            ? `Prefer a read_file tool call for "${preferredTarget}" first.`
                            : "",
                        shouldPushWorkspaceMutation && preferredTarget && alreadyReadTarget
                            ? `You already inspected "${preferredTarget}". Prefer the next editing tool needed to make the requested change.`
                            : "",
                        shouldPushDesktopAction && input.mentionContext.mentionedWindows[0]
                            ? `Prefer a desktop tool that targets "${input.mentionContext.mentionedWindows[0]}".`
                            : "",
                        "Respond now with exactly one minified JSON object in the tool_call shape or a final only if the task is genuinely complete.",
                        '{"type":"tool_call","tool_call":{"name":"tool_name","arguments":{},"summary":"short reason"}}',
                    ]
                        .filter(Boolean)
                        .join("\n"),
                },
            ],
        });
        const structured = maybeStructuredResponse(recoveryTurn.finalText);
        if (structured?.type === "tool_call") {
            return structured;
        }
        if (structured?.type === "final" && !shouldRepairForMissingAction({ ...input, candidate: structured })) {
            return structured;
        }
        if (shouldPushWorkspaceMutation && hasCompletedTool(input.run, "read_file")) {
            const latestReceipt = input.run.receipts[input.run.receipts.length - 1] || null;
            const focusedRepairTurn = await this.modelClient
                .streamTurn({
                auth: input.auth,
                signal: input.signal,
                messages: [
                    {
                        role: "system",
                        content: [
                            "You are Cutie finishing a coding task in VS Code.",
                            "The user asked for a code change, the target file has already been read, and no mutation has happened yet.",
                            "Do not greet. Do not explain. Do not stop. Choose the next tool call now.",
                            "Prefer edit_file when a targeted replacement is possible. Use write_file only if a full rewrite is truly needed.",
                            "Respond with only one minified JSON tool_call object.",
                            '{"type":"tool_call","tool_call":{"name":"edit_file","arguments":{"path":"file","find":"old","replace":"new"},"summary":"short reason"}}',
                        ].join("\n"),
                    },
                    {
                        role: "user",
                        content: trimToLimit(input.prompt, 2000),
                    },
                    {
                        role: "system",
                        content: stableJson({
                            mentionedPaths: input.mentionContext.mentionedPaths,
                            mentionedWindows: input.mentionContext.mentionedWindows,
                            latestReceipt: latestReceipt
                                ? {
                                    step: latestReceipt.step,
                                    toolName: latestReceipt.toolName,
                                    summary: latestReceipt.summary,
                                    status: latestReceipt.status,
                                    data: summarizeToolData(latestReceipt.data),
                                }
                                : null,
                        }),
                    },
                ],
            })
                .catch(() => null);
            if (!focusedRepairTurn) {
                return null;
            }
            const focusedStructured = maybeStructuredResponse(focusedRepairTurn.finalText);
            if (focusedStructured?.type === "tool_call") {
                return focusedStructured;
            }
            const latestReadReceipt = getLatestCompletedReceipt(input.run, "read_file");
            const latestReadData = latestReadReceipt?.data ? asRecord(latestReadReceipt.data) : {};
            const readPath = typeof latestReadData.path === "string" ? latestReadData.path : input.mentionContext.mentionedPaths[0] || "";
            const readContent = typeof latestReadData.content === "string" ? latestReadData.content : "";
            if (readPath && readContent) {
                await input.callbacks?.onStatusChanged?.("Cutie is drafting the concrete file edit from the inspected file.", input.run);
                const directEditTurn = await this.modelClient
                    .completeTurn({
                    auth: input.auth,
                    signal: input.signal,
                    temperature: 0.1,
                    maxTokens: 1400,
                    messages: [
                        {
                            role: "system",
                            content: [
                                "You are Cutie preparing the next concrete file-edit tool call.",
                                "The file has already been read. The user wants a code change in this file.",
                                "Return exactly one minified JSON tool_call object and nothing else.",
                                "Prefer edit_file with a precise find/replace when possible.",
                                "Use write_file only if a single targeted replacement is not enough.",
                                '{"type":"tool_call","tool_call":{"name":"edit_file","arguments":{"path":"file","find":"old","replace":"new"},"summary":"short reason"}}',
                            ].join("\n"),
                        },
                        {
                            role: "user",
                            content: [
                                `Task:\n${trimToLimit(input.prompt, 2000)}`,
                                `Target path:\n${readPath}`,
                                `Current file content:\n${trimToLimit(readContent, 8000)}`,
                            ].join("\n\n"),
                        },
                    ],
                })
                    .catch(() => null);
                if (!directEditTurn) {
                    return null;
                }
                const directStructured = maybeStructuredResponse(directEditTurn.finalText);
                if (directStructured?.type === "tool_call") {
                    return directStructured;
                }
            }
        }
        return null;
    }
    async runPrompt(input) {
        const startedAt = Date.now();
        let session = await this.sessionStore.appendMessage(input.session, {
            role: "user",
            content: input.prompt,
        });
        await input.callbacks?.onSessionChanged?.(session);
        let run = createInitialRunState(session.id);
        session = await this.sessionStore.appendRun(session, run);
        await input.callbacks?.onSessionChanged?.(session);
        await input.callbacks?.onStatusChanged?.("Cutie is collecting context.", run);
        const transcript = [
            {
                role: "system",
                content: buildSystemPrompt(this.toolRegistry.describeToolsForPrompt()),
            },
            ...toTranscriptMessages(session),
        ];
        let previousToolKey = "";
        let mutationGoalRepairCount = 0;
        const maxMutationGoalRepairs = 3;
        const mentionContext = extractMentionContext(input.prompt, input.mentions);
        const bootstrapFinalResponse = buildBootstrapFinalResponse({
            prompt: input.prompt,
            mentionContext,
        });
        if (bootstrapFinalResponse) {
            session = await this.sessionStore.appendMessage(session, {
                role: "assistant",
                content: bootstrapFinalResponse,
                runId: run.id,
            });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
                status: "completed",
                phase: "completed",
                endedAt: (0, cutie_policy_1.nowIso)(),
            }));
            await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
            return { session, run };
        }
        try {
            while (true) {
                if (input.signal?.aborted) {
                    throw new Error("Request aborted");
                }
                if (Date.now() - startedAt > cutie_policy_1.CUTIE_MAX_WALL_CLOCK_MS) {
                    throw new Error("Cutie stopped because the 10 minute wall-clock limit was reached.");
                }
                if (run.stepCount >= run.maxSteps) {
                    throw new Error(`Cutie stopped because it reached the ${run.maxSteps} step limit.`);
                }
                ({ session, run } = await this.updateRun(session, run, {
                    phase: "collecting_context",
                    status: "running",
                    ...(run.lastToolName ? { lastToolName: run.lastToolName } : {}),
                }));
                await input.callbacks?.onStatusChanged?.("Cutie is refreshing local context.", run);
                const context = await this.getContext();
                const contextMessage = {
                    role: "system",
                    content: buildContextMessage({
                        prompt: input.prompt,
                        context: {
                            ...context,
                            mentionedPaths: mentionContext.mentionedPaths,
                            mentionedWindows: mentionContext.mentionedWindows,
                        },
                        run,
                    }),
                };
                let modelFinalText = "";
                let surfacedStreaming = false;
                ({ session, run } = await this.updateRun(session, run, { phase: "planning", status: "running" }));
                await input.callbacks?.onStatusChanged?.(`Cutie is planning step ${run.stepCount + 1}.`, run);
                const bootstrapToolCall = buildBootstrapToolCall({
                    prompt: input.prompt,
                    context,
                    mentionContext,
                    run,
                });
                let structured = null;
                if (bootstrapToolCall) {
                    structured = {
                        type: "tool_call",
                        tool_call: {
                            name: bootstrapToolCall.name,
                            arguments: bootstrapToolCall.arguments,
                            ...(bootstrapToolCall.summary ? { summary: bootstrapToolCall.summary } : {}),
                        },
                    };
                }
                else {
                    const turn = await this.modelClient.streamTurn({
                        auth: input.auth,
                        signal: input.signal,
                        messages: [...transcript, contextMessage],
                        onDelta: async (delta, accumulated) => {
                            modelFinalText = accumulated;
                            if (!shouldSurfaceStreamingAssistantText(accumulated))
                                return;
                            surfacedStreaming = true;
                            await input.callbacks?.onAssistantDelta?.(delta, accumulated);
                        },
                    });
                    modelFinalText = turn.finalText;
                    structured = maybeStructuredResponse(turn.finalText);
                    if (!structured && !modelFinalText.trim()) {
                        const fallbackToolCall = buildFallbackToolCallAfterPlanningFailure({
                            prompt: input.prompt,
                            context,
                            mentionContext,
                            run,
                        });
                        if (fallbackToolCall) {
                            structured = {
                                type: "tool_call",
                                tool_call: {
                                    name: fallbackToolCall.name,
                                    arguments: fallbackToolCall.arguments,
                                    ...(fallbackToolCall.summary ? { summary: fallbackToolCall.summary } : {}),
                                },
                            };
                            await input.callbacks?.onStatusChanged?.("Cutie is recovering from an empty planning turn and inspecting the target file directly.", run);
                        }
                    }
                }
                if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
                    const repaired = await this.recoverActionableTurn({
                        auth: input.auth,
                        signal: input.signal,
                        prompt: input.prompt,
                        transcript,
                        contextMessage,
                        run,
                        mentionContext,
                        callbacks: input.callbacks,
                    });
                    if (repaired) {
                        structured = repaired;
                    }
                }
                if (!structured) {
                    if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
                        if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                            mutationGoalRepairCount += 1;
                            transcript.push({
                                role: "system",
                                content: [
                                    "Repair instruction:",
                                    "The user asked for a real file change.",
                                    "The file has already been inspected.",
                                    "Do not finish yet.",
                                    "Produce edit_file, write_file, or run_command next unless the task is truly impossible.",
                                ].join(" "),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is retrying the planning step to produce a real file change (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue;
                        }
                        throw new Error(`Cutie could not produce a real file change after ${maxMutationGoalRepairs} repair attempts.`);
                    }
                    if (looksLikeMalformedToolCall(modelFinalText)) {
                        throw new Error("Cutie received malformed tool-call output from the model and stopped before taking action.");
                    }
                    const finalText = modelFinalText.trim() ||
                        (await this.recoverFinalMessage({
                            auth: input.auth,
                            signal: input.signal,
                            transcript,
                            contextMessage,
                            run,
                            callbacks: input.callbacks,
                        }));
                    if (!surfacedStreaming && finalText) {
                        await input.callbacks?.onAssistantDelta?.(finalText, finalText);
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "assistant",
                        content: finalText,
                        runId: run.id,
                    });
                    transcript.push({ role: "assistant", content: finalText });
                    await input.callbacks?.onSessionChanged?.(session);
                    ({ session, run } = await this.updateRun(session, run, {
                        status: "completed",
                        phase: "completed",
                        endedAt: (0, cutie_policy_1.nowIso)(),
                    }));
                    await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
                    return { session, run };
                }
                if (structured.type === "final") {
                    if (shouldRepairForMissingAction({ prompt: input.prompt, mentionContext, run, candidate: structured })) {
                        const repaired = await this.recoverActionableTurn({
                            auth: input.auth,
                            signal: input.signal,
                            prompt: input.prompt,
                            transcript,
                            contextMessage,
                            run,
                            mentionContext,
                            callbacks: input.callbacks,
                        });
                        if (repaired?.type === "tool_call") {
                            structured = repaired;
                        }
                    }
                }
                if (structured.type === "final") {
                    if (shouldKeepPushingForWorkspaceMutation({ prompt: input.prompt, mentionContext, run })) {
                        if (mutationGoalRepairCount < maxMutationGoalRepairs) {
                            mutationGoalRepairCount += 1;
                            transcript.push({
                                role: "system",
                                content: [
                                    "Repair instruction:",
                                    "A final answer is not enough for this request because the user asked for a code change.",
                                    "Continue working until there is a real mutation tool call or a relevant command.",
                                ].join(" "),
                            });
                            await input.callbacks?.onStatusChanged?.(`Cutie is continuing instead of stopping early (${mutationGoalRepairCount}/${maxMutationGoalRepairs}).`, run);
                            continue;
                        }
                        throw new Error(`Cutie could not produce a real file change after ${maxMutationGoalRepairs} repair attempts.`);
                    }
                    const finalText = structured.final.trim() ||
                        (await this.recoverFinalMessage({
                            auth: input.auth,
                            signal: input.signal,
                            transcript,
                            contextMessage,
                            run,
                            callbacks: input.callbacks,
                        }));
                    if (!surfacedStreaming && finalText) {
                        await input.callbacks?.onAssistantDelta?.(finalText, finalText);
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "assistant",
                        content: finalText,
                        runId: run.id,
                    });
                    transcript.push({ role: "assistant", content: finalText });
                    await input.callbacks?.onSessionChanged?.(session);
                    ({ session, run } = await this.updateRun(session, run, {
                        status: "completed",
                        phase: "completed",
                        endedAt: (0, cutie_policy_1.nowIso)(),
                    }));
                    await input.callbacks?.onStatusChanged?.("Cutie completed the run.", run);
                    return { session, run };
                }
                const toolCall = {
                    id: (0, cutie_policy_1.randomId)("cutie_tool"),
                    name: structured.tool_call.name,
                    arguments: structured.tool_call.arguments,
                    ...(structured.tool_call.summary ? { summary: structured.tool_call.summary } : {}),
                };
                const toolKey = (0, cutie_policy_1.buildToolCallKey)(toolCall);
                const repeatedCallCount = toolKey === previousToolKey ? run.repeatedCallCount + 1 : 1;
                previousToolKey = toolKey;
                mutationGoalRepairCount = 0;
                ({ session, run } = await this.updateRun(session, run, {
                    repeatedCallCount,
                    lastToolName: toolCall.name,
                    phase: "executing_tool",
                    status: "running",
                    stepCount: run.stepCount + 1,
                }));
                if (repeatedCallCount > cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS) {
                    throw new Error(`Cutie stopped after repeating ${toolCall.name} without making progress.`);
                }
                if ((0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) && !this.toolRegistry.getCurrentCheckpoint()) {
                    const checkpointResult = await this.toolRegistry.createAutomaticCheckpoint("Automatic checkpoint before the first workspace mutation.");
                    if (checkpointResult.checkpoint) {
                        ({ session, run } = await this.updateRun(session, run, {
                            checkpoint: checkpointResult.checkpoint,
                        }));
                    }
                    session = await this.sessionStore.appendMessage(session, {
                        role: "system",
                        content: checkpointResult.summary,
                        runId: run.id,
                    });
                    transcript.push({
                        role: "system",
                        content: buildToolResultMessage(checkpointResult),
                    });
                    await input.callbacks?.onSessionChanged?.(session);
                }
                if ((0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) && run.workspaceMutationCount >= run.maxWorkspaceMutations) {
                    throw new Error(`Cutie stopped because it reached the ${run.maxWorkspaceMutations} workspace mutation limit.`);
                }
                if ((0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) && run.desktopMutationCount >= run.maxDesktopMutations) {
                    throw new Error(`Cutie stopped because it reached the ${run.maxDesktopMutations} desktop mutation limit.`);
                }
                await input.callbacks?.onStatusChanged?.(toolCall.summary ? `Cutie is ${toolCall.summary}.` : `Cutie is running ${toolCall.name}.`, run);
                const toolStartedAt = (0, cutie_policy_1.nowIso)();
                const toolResult = repeatedCallCount === cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS
                    ? createRepeatedCallResult(toolCall)
                    : await this.toolRegistry.execute(toolCall, {
                        signal: input.signal,
                    });
                const receipt = createReceipt(run.stepCount, toolCall, toolResult, toolStartedAt);
                const workspaceMutationCount = run.workspaceMutationCount + (toolResult.ok && (0, cutie_policy_1.isWorkspaceMutationTool)(toolCall.name) ? 1 : 0);
                const desktopMutationCount = run.desktopMutationCount + (toolResult.ok && (0, cutie_policy_1.isDesktopMutationTool)(toolCall.name) ? 1 : 0);
                ({ session, run } = await this.updateRun(session, run, {
                    receipts: [...run.receipts, receipt],
                    workspaceMutationCount,
                    desktopMutationCount,
                    ...(toolResult.checkpoint ? { checkpoint: toolResult.checkpoint } : {}),
                }));
                if (toolResult.snapshot) {
                    session = await this.sessionStore.attachSnapshot(session, toolResult.snapshot);
                }
                session = await this.sessionStore.appendMessage(session, {
                    role: "system",
                    content: toolResult.ok
                        ? `Step ${run.stepCount}: ${toolResult.summary}`
                        : `Step ${run.stepCount}: ${toolResult.summary}${toolResult.error ? ` ${toolResult.error}` : ""}`,
                    runId: run.id,
                });
                transcript.push({
                    role: "assistant",
                    content: formatStructuredResponse(structured),
                });
                transcript.push({
                    role: "system",
                    content: buildToolResultMessage(toolResult),
                });
                await input.callbacks?.onSessionChanged?.(session);
                if (!toolResult.ok) {
                    if (toolResult.blocked && repeatedCallCount === cutie_policy_1.CUTIE_MAX_IDENTICAL_CALLS) {
                        await input.callbacks?.onStatusChanged?.("Cutie redirected a redundant tool call and is trying a different next step.", run);
                        continue;
                    }
                    const failureMessage = toolResult.blocked
                        ? `I stopped because ${toolResult.error || toolResult.summary}`
                        : `I ran into a problem with ${toolCall.name}: ${toolResult.error || toolResult.summary}`;
                    session = await this.sessionStore.appendMessage(session, {
                        role: "assistant",
                        content: failureMessage,
                        runId: run.id,
                    });
                    transcript.push({ role: "assistant", content: failureMessage });
                    await input.callbacks?.onSessionChanged?.(session);
                    ({ session, run } = await this.updateRun(session, run, {
                        status: "failed",
                        phase: "failed",
                        error: toolResult.error || toolResult.summary,
                        endedAt: (0, cutie_policy_1.nowIso)(),
                    }));
                    await input.callbacks?.onStatusChanged?.("Cutie stopped after a blocked or failed tool call.", run);
                    return { session, run };
                }
            }
        }
        catch (error) {
            const rawMessage = error instanceof Error ? error.message : String(error);
            const message = String(rawMessage || "").trim() || "Cutie could not get a usable planning response from the model.";
            const isCanceled = /aborted|cancelled|canceled/i.test(message);
            session = await this.sessionStore.appendMessage(session, {
                role: "assistant",
                content: isCanceled ? "Run cancelled." : `Cutie stopped: ${message}`,
                runId: run.id,
            });
            await input.callbacks?.onSessionChanged?.(session);
            ({ session, run } = await this.updateRun(session, run, {
                status: isCanceled ? "canceled" : "failed",
                phase: isCanceled ? "canceled" : "failed",
                error: isCanceled ? undefined : message,
                endedAt: (0, cutie_policy_1.nowIso)(),
            }));
            await input.callbacks?.onStatusChanged?.(isCanceled ? "Cutie run cancelled." : "Cutie run stopped early.", run);
            return { session, run };
        }
    }
    async updateRun(session, current, patch) {
        const next = {
            ...current,
            ...patch,
        };
        const nextSession = await this.sessionStore.updateRun(session, next);
        return {
            session: nextSession,
            run: next,
        };
    }
}
exports.CutieRuntime = CutieRuntime;
//# sourceMappingURL=cutie-runtime.js.map
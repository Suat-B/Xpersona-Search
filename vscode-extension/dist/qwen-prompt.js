"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildQwenPrompt = buildQwenPrompt;
const qwen_runtime_noise_1 = require("./qwen-runtime-noise");
const intelligence_utils_1 = require("./intelligence-utils");
const qwen_loop_guard_1 = require("./qwen-loop-guard");
function trimBlock(value, limit) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .trim()
        .slice(0, limit);
}
function renderContextFile(input) {
    const parts = [
        input.path ? `Path: ${input.path}` : "",
        input.language ? `Language: ${input.language}` : "",
    ].filter(Boolean);
    const body = trimBlock(input.selection, 4000) ||
        trimBlock(input.content, 4000) ||
        trimBlock(input.excerpt, 1600);
    return [parts.join(" | "), body].filter(Boolean).join("\n");
}
function renderSnippet(path, reason, content) {
    const header = [
        path ? `Path: ${path}` : "Path: workspace",
        reason ? `Reason: ${reason}` : "",
    ]
        .filter(Boolean)
        .join(" | ");
    return [header, trimBlock(content, 2400)].filter(Boolean).join("\n");
}
function normalizePathLike(value) {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .toLowerCase();
}
function refersToCurrentWorkspaceContext(task) {
    const normalized = normalizePathLike(task);
    if (!normalized)
        return false;
    return (/\b(current|existing|open)\s+(file|files|plan|doc|document|tab|tabs|integration plan)\b/.test(normalized) ||
        /\b(this|these)\s+(file|files|plan|doc|document|tab|tabs)\b/.test(normalized) ||
        /\b(continue|keep working|expand on|elaborate on|build on)\b/.test(normalized));
}
function buildConversationLane(input) {
    const explicitRuntimeTask = (0, qwen_runtime_noise_1.isExplicitRuntimeTask)(input.task);
    const filtered = (input.history || [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .filter((message) => {
        if (message.role === "assistant" && (0, qwen_loop_guard_1.containsGenericProjectClarification)(message.content)) {
            return false;
        }
        if (explicitRuntimeTask) {
            return true;
        }
        return !(0, qwen_runtime_noise_1.containsRuntimeNoiseForContext)({
            text: message.content,
            task: input.task,
            workspaceRoot: input.workspaceRoot,
            executablePath: input.qwenExecutablePath,
            workspaceTargets: input.workspaceTargets,
        });
    });
    if (filtered.length &&
        filtered[filtered.length - 1]?.role === "user" &&
        filtered[filtered.length - 1]?.content.trim() === input.task.trim()) {
        filtered.pop();
    }
    const recent = filtered.slice(-6);
    if (!recent.length)
        return "";
    return [
        "Recent conversation lane:",
        ...recent.map((message, index) => {
            const label = message.role === "user" ? "User" : "Assistant";
            return `${index + 1}. ${label}:\n${trimBlock(message.content, 1200)}`;
        }),
    ].join("\n\n");
}
function buildIntentLane(preview) {
    const base = `Intent lane:\n- Intent: ${preview.intent}\n- Confidence: ${preview.confidence} (${preview.rationale})`;
    if (preview.intent === "change") {
        return [
            base,
            "- This is an edit request. Resolve the target files first, keep the patch focused, and prefer the smallest correct change.",
            "- If you still lack a clear target, ask a narrow clarification instead of guessing.",
        ].join("\n");
    }
    if (preview.intent === "find") {
        return [
            base,
            "- This is a discovery request. Prefer fast workspace search, exact file hits, and line-oriented guidance.",
            "- Stop once you have the relevant files and evidence; do not over-search.",
        ].join("\n");
    }
    if (preview.intent === "explain") {
        return [
            base,
            "- This is an explanation request. Prefer concise, file-backed explanations tied to the current workspace.",
            "- Explain behavior and tradeoffs without long generic reasoning.",
        ].join("\n");
    }
    return [
        base,
        "- This is a direct ask. Answer concisely, grounded in workspace evidence, and suggest the next useful action when appropriate.",
    ].join("\n");
}
function buildTargetLane(preview, workspaceRoot) {
    return [
        "Target lane:",
        workspaceRoot ? `- Workspace root: ${workspaceRoot}` : "",
        preview.resolvedFiles.length ? `- Likely target files: ${preview.resolvedFiles.join(", ")}` : "",
        preview.candidateFiles.length ? `- Candidate files: ${preview.candidateFiles.join(", ")}` : "",
        preview.attachedFiles.length ? `- Attached files: ${preview.attachedFiles.join(", ")}` : "",
        preview.attachedSelection
            ? `- Attached selection: ${preview.attachedSelection.path} | ${preview.attachedSelection.summary}`
            : "",
        preview.memoryFiles.length ? `- Session memory hints: ${preview.memoryFiles.join(", ")}` : "",
        preview.activeFile ? `- Active file: ${preview.activeFile}` : "",
        preview.openFiles.length ? `- Open files: ${preview.openFiles.join(", ")}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
function buildSnippetLane(input) {
    const sections = ["Relevant snippets lane:"];
    if (input.context.activeFile?.path) {
        sections.push(`Active editor context:\n${renderContextFile(input.context.activeFile)}`);
    }
    const allSnippets = [
        ...(input.injectedSnippets || []),
        ...(input.context.indexedSnippets || []),
    ];
    if (allSnippets.length) {
        sections.push(`Relevant workspace snippets:\n${allSnippets
            .slice(0, 5)
            .map((snippet) => renderSnippet(snippet.path, snippet.reason, snippet.content))
            .join("\n\n")}`);
    }
    else if (input.context.openFiles?.length) {
        sections.push(`Open editor excerpts:\n${input.context.openFiles
            .slice(0, 3)
            .map((file) => renderContextFile(file))
            .filter(Boolean)
            .join("\n\n")}`);
    }
    if (input.preview.diagnostics.length) {
        sections.push(`Diagnostics:\n${input.preview.diagnostics.slice(0, 4).join("\n")}`);
    }
    return sections.join("\n\n");
}
function buildExecutionLane(input) {
    const lines = [
        "Execution policy lane:",
        input.workspaceRoot
            ? `- Treat ${input.workspaceRoot} as the user's active project root. Never assume the extension install directory or SDK bundle path is the project unless explicitly asked.`
            : "- Use the current VS Code workspace as the project root.",
        input.searchDepth === "deep"
            ? "- Search depth: deep. Broaden the workspace scan before settling on an answer."
            : "- Search depth: fast. Prefer the smallest confident context set first.",
        "- Prefer file paths, symbols, and concrete next actions over abstract prose.",
        "- Suppress long generic reasoning unless the user explicitly asked for explanation.",
        "- Ignore stale extension-bundle or SDK CLI paths unless the user explicitly asks about the extension internals.",
        "- Never begin your answer by discussing the Qwen SDK, CLI executable, extension runtime, auth setup, or local install paths unless the user explicitly asked about those internals.",
        "- Do not ask broad project-scope clarification questions when you already have a likely target file or grounded workspace context. Either act on the likely file or ask a narrow file-specific clarification.",
        "- Do not emit literal <tool_call>, <function=...>, or <parameter=...> markup in your answer. Either use the SDK's real tool mechanism or respond in normal prose.",
        "- All file operations (read_file, edit, etc.) must use paths from the Target lane or workspace root only. Never use extension install paths, bundled SDK paths, or node_modules inside the extension. The workspace root is the only valid base for file paths.",
        "- If the user quotes prior assistant chatter about SDK locations, installation checks, CLI executables, or runtime folders, treat that as a context-loss bug report and pivot back to the active workspace files.",
        "- When in doubt, explain the likely target file or active editor content instead of speculating about SDK installation state.",
    ];
    if (refersToCurrentWorkspaceContext(input.task) &&
        (input.preview.activeFile || input.preview.resolvedFiles.length || input.preview.selectedFiles.length)) {
        lines.push("- The user is referring to the current workspace context. Default to the active file and attached workspace snippets instead of asking whether they meant a different path.");
    }
    if (input.preview.intent === "change") {
        lines.push("- For code changes, show a brief patch plan before making edits.");
        lines.push("- Inspect the likely target file with workspace tools before answering. If confidence is high, make the smallest correct edit instead of replying with prose only.");
        lines.push("- After inspecting a trusted target file, either make a concrete mutation or state the exact blocker. Do not stop at read-only analysis.");
    }
    if (input.preview.intent === "find") {
        lines.push("- Use workspace search/read tools to verify at least one real file or symbol before answering. Do not answer from prompt text alone.");
    }
    if (input.requireToolUse) {
        lines.push("- Tool-first override: you must use at least one workspace tool before your final answer. A prose-only response is not acceptable for this request.");
        lines.push("- Use read_file or other tools with paths from the Target lane (e.g. the resolved/active file paths above). Never use paths outside the workspace.");
    }
    if (input.forceActionable) {
        lines.push("- Retry override: the previous answer was not actionable. Do not ask generic clarification questions.");
        lines.push("- Produce a direct, concrete answer tied to the resolved/active file context in this prompt.");
    }
    if (input.mode === "plan") {
        lines.push("- Stay in plan mode. Explain the approach without making edits.");
        lines.push("- If the intent is change and a target file is already resolved/selected/active, provide a concrete implementation plan now.");
        lines.push("- Include exact target file path(s), step-by-step code changes, and quick verification checks.");
        lines.push("- Do not respond with a generic clarification request unless no concrete target file context exists.");
    }
    else {
        lines.push("- You may inspect and edit files in the workspace when needed, but ask before risky command execution.");
    }
    return lines.join("\n");
}
const RUNTIME_PATH_REDACTED = "[runtime-path-redacted]";
/** Redacts extension/SDK paths that can confuse the model into thinking the user asked about them. */
function sanitizeRuntimePaths(text) {
    if (!text || !text.trim())
        return text;
    return text
        .replace(/[A-Za-z]:\\Users\\[^ \n\r\t]+\\\.trae\\extensions\\playgroundai\.xpersona-playground-[^ \n\r\t]*/gi, RUNTIME_PATH_REDACTED)
        .replace(/[A-Za-z]:\\[^ \n\r\t]*\\node_modules\\@qwen-code\\sdk\\dist\\cli\\cli\.js/gi, RUNTIME_PATH_REDACTED)
        .replace(/[A-Za-z]:\\[^ \n\r\t]*@qwen-code\\sdk\\dist\\cli\\cli\.js/gi, RUNTIME_PATH_REDACTED)
        .replace(/\/\.trae\/extensions\/playgroundai\.xpersona-playground-[^\s)]*/gi, RUNTIME_PATH_REDACTED)
        .replace(/\/node_modules\/@qwen-code\/sdk\/dist\/cli\/cli\.js/gi, RUNTIME_PATH_REDACTED)
        .replace(/[A-Za-z]:\/[^ \n\r\t]*\/\.trae\/extensions\/[^\s)]*/gi, RUNTIME_PATH_REDACTED)
        .replace(/[A-Za-z]:\/[^ \n\r\t]*\/node_modules\/@qwen-code\/sdk\/dist\/cli\/cli\.js/gi, RUNTIME_PATH_REDACTED);
}
function sanitizeTaskForPrompt(task) {
    const raw = String(task || "");
    if (!raw.trim())
        return "";
    if ((0, qwen_runtime_noise_1.isExplicitRuntimeTask)(raw))
        return raw;
    const cleaned = sanitizeRuntimePaths(raw);
    if ((0, intelligence_utils_1.isRuntimePathLeak)(cleaned)) {
        return cleaned.replace(/@qwen-code\/sdk\/dist\/cli\/cli\.js/gi, RUNTIME_PATH_REDACTED);
    }
    return cleaned;
}
function buildQwenPrompt(input) {
    const workspaceTargets = Array.from(new Set([
        input.preview.activeFile || "",
        ...input.preview.resolvedFiles,
        ...input.preview.selectedFiles,
        ...input.preview.openFiles,
        ...input.preview.attachedFiles,
    ]
        .map((target) => String(target || "").trim())
        .filter(Boolean)));
    const rawPrompt = [
        `User request:\n${sanitizeTaskForPrompt(input.task)}`,
        buildConversationLane({
            task: input.task,
            history: input.history,
            workspaceRoot: input.workspaceRoot,
            qwenExecutablePath: input.qwenExecutablePath,
            workspaceTargets,
        }),
        buildIntentLane(input.preview),
        buildTargetLane(input.preview, input.workspaceRoot),
        buildSnippetLane({
            preview: input.preview,
            context: input.context,
            injectedSnippets: input.injectedSnippets,
        }),
        buildExecutionLane({
            preview: input.preview,
            mode: input.mode,
            workspaceRoot: input.workspaceRoot,
            searchDepth: input.searchDepth || "fast",
            task: input.task,
            requireToolUse: input.requireToolUse,
            forceActionable: input.forceActionable,
        }),
    ]
        .filter(Boolean)
        .join("\n\n");
    return sanitizeRuntimePaths(rawPrompt);
}
//# sourceMappingURL=qwen-prompt.js.map
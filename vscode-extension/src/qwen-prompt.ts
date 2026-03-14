import type { AssistContext, ChatMessage, ContextPreview, Mode } from "./shared";

function trimBlock(value: string | undefined, limit: number): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, limit);
}

function renderContextFile(input: {
  path?: string;
  language?: string;
  selection?: string;
  content?: string;
  excerpt?: string;
}): string {
  const parts = [
    input.path ? `Path: ${input.path}` : "",
    input.language ? `Language: ${input.language}` : "",
  ].filter(Boolean);
  const body =
    trimBlock(input.selection, 4_000) ||
    trimBlock(input.content, 4_000) ||
    trimBlock(input.excerpt, 1_600);

  return [parts.join(" | "), body].filter(Boolean).join("\n");
}

function renderSnippet(path: string | undefined, reason: string | undefined, content: string): string {
  const header = [
    path ? `Path: ${path}` : "Path: workspace",
    reason ? `Reason: ${reason}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  return [header, trimBlock(content, 2_400)].filter(Boolean).join("\n");
}

function normalizePathLike(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function looksLikePath(value: string | undefined | null): boolean {
  return /[\\/]/.test(String(value || "")) || /^[a-z]:/i.test(String(value || ""));
}

function isPathInsideWorkspace(pathValue: string, workspaceRoot?: string | null): boolean {
  const normalizedPath = trimTrailingSlashes(normalizePathLike(pathValue));
  const normalizedWorkspaceRoot = trimTrailingSlashes(normalizePathLike(workspaceRoot));
  if (!normalizedPath || !normalizedWorkspaceRoot) return false;
  return (
    normalizedPath === normalizedWorkspaceRoot ||
    normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`)
  );
}

function looksLikeRuntimeNarrativeNoise(content: string): boolean {
  const normalized = normalizePathLike(content);
  if (!normalized) return false;

  const tokens = [
    "qwen code sdk",
    "qwen sdk",
    "sdk cli executable",
    "cli executable",
    ".trae",
    "trae/extensions",
    "extension directory",
    "extension runtime",
    "local installation",
    "windows file path",
    "cli interface",
    "confirm the installation",
    "sdk's location",
    "sdk location",
    "check where this file is located",
    "troubleshoot an issue related to the sdk",
  ];
  const tokenHits = tokens.reduce((count, token) => (normalized.includes(token) ? count + 1 : count), 0);
  if (tokenHits >= 2) return true;

  if (normalized.includes(".trae") && normalized.includes("qwen")) return true;
  if (normalized.includes("extension directory") && normalized.includes("qwen")) return true;
  if (normalized.includes("windows file path") && normalized.includes("qwen")) return true;
  if (
    normalized.includes("this appears to be the location of") &&
    /\b(qwen|sdk|cli)\b/.test(normalized)
  ) {
    return true;
  }
  if (
    /\bthe user (might|may|could|seems to|appears to)\b/.test(normalized) &&
    /\b(path|sdk|cli|installation|environment)\b/.test(normalized)
  ) {
    return true;
  }
  if (normalized.includes("since they included this path")) return true;
  if (normalized.includes("check if the sdk is properly installed")) return true;
  if (normalized.includes("checking the sdk's location") || normalized.includes("checking the sdk location")) {
    return true;
  }

  return false;
}

function looksLikeRuntimeNoise(input: {
  content: string;
  workspaceRoot?: string | null;
  qwenExecutablePath?: string | null;
}): boolean {
  const normalized = normalizePathLike(input.content);
  if (!normalized) return false;

  const executablePathRaw = String(input.qwenExecutablePath || "").trim();
  const executablePath = normalizePathLike(input.qwenExecutablePath);
  if (
    executablePath &&
    looksLikePath(executablePathRaw) &&
    normalized.includes(executablePath) &&
    !isPathInsideWorkspace(executablePathRaw, input.workspaceRoot)
  ) {
    return true;
  }

  return (
    looksLikeRuntimeNarrativeNoise(input.content) ||
    normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
    normalized.includes("playgroundai.xpersona-playground") ||
    normalized.includes("/.trae/extensions/")
  );
}

function buildConversationLane(input: {
  task: string;
  history?: ChatMessage[];
  workspaceRoot?: string | null;
  qwenExecutablePath?: string | null;
}): string {
  const filtered = (input.history || [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter(
      (message) =>
        !looksLikeRuntimeNoise({
          content: message.content,
          workspaceRoot: input.workspaceRoot,
          qwenExecutablePath: input.qwenExecutablePath,
        })
    );

  if (
    filtered.length &&
    filtered[filtered.length - 1]?.role === "user" &&
    filtered[filtered.length - 1]?.content.trim() === input.task.trim()
  ) {
    filtered.pop();
  }

  const recent = filtered.slice(-6);
  if (!recent.length) return "";

  return [
    "Recent conversation lane:",
    ...recent.map((message, index) => {
      const label = message.role === "user" ? "User" : "Assistant";
      return `${index + 1}. ${label}:\n${trimBlock(message.content, 1_200)}`;
    }),
  ].join("\n\n");
}

function buildIntentLane(preview: ContextPreview): string {
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

function buildTargetLane(preview: ContextPreview, workspaceRoot?: string | null): string {
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

function buildSnippetLane(input: {
  preview: ContextPreview;
  context: AssistContext;
}): string {
  const sections: string[] = ["Relevant snippets lane:"];

  if (input.context.activeFile?.path) {
    sections.push(`Active editor context:\n${renderContextFile(input.context.activeFile)}`);
  }

  if (input.context.indexedSnippets?.length) {
    sections.push(
      `Relevant workspace snippets:\n${input.context.indexedSnippets
        .slice(0, 4)
        .map((snippet) => renderSnippet(snippet.path, snippet.reason, snippet.content))
        .join("\n\n")}`
    );
  } else if (input.context.openFiles?.length) {
    sections.push(
      `Open editor excerpts:\n${input.context.openFiles
        .slice(0, 3)
        .map((file) => renderContextFile(file))
        .filter(Boolean)
        .join("\n\n")}`
    );
  }

  if (input.preview.diagnostics.length) {
    sections.push(`Diagnostics:\n${input.preview.diagnostics.slice(0, 4).join("\n")}`);
  }

  return sections.join("\n\n");
}

function buildExecutionLane(input: {
  preview: ContextPreview;
  mode: Mode;
  workspaceRoot?: string | null;
  searchDepth: "fast" | "deep";
}): string {
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
    "- If the user quotes prior assistant chatter about SDK locations, installation checks, CLI executables, or runtime folders, treat that as a context-loss bug report and pivot back to the active workspace files.",
    "- When in doubt, explain the likely target file or active editor content instead of speculating about SDK installation state.",
  ];

  if (input.preview.intent === "change") {
    lines.push("- For code changes, show a brief patch plan before making edits.");
  }

  if (input.mode === "plan") {
    lines.push("- Stay in plan mode. Explain the approach without making edits.");
  } else {
    lines.push("- You may inspect and edit files in the workspace when needed, but ask before risky command execution.");
  }

  return lines.join("\n");
}

export function buildQwenPrompt(input: {
  task: string;
  mode: Mode;
  preview: ContextPreview;
  context: AssistContext;
  workspaceRoot?: string | null;
  searchDepth?: "fast" | "deep";
  history?: ChatMessage[];
  qwenExecutablePath?: string | null;
}): string {
  return [
    `User request:\n${input.task}`,
    buildConversationLane({
      task: input.task,
      history: input.history,
      workspaceRoot: input.workspaceRoot,
      qwenExecutablePath: input.qwenExecutablePath,
    }),
    buildIntentLane(input.preview),
    buildTargetLane(input.preview, input.workspaceRoot),
    buildSnippetLane({
      preview: input.preview,
      context: input.context,
    }),
    buildExecutionLane({
      preview: input.preview,
      mode: input.mode,
      workspaceRoot: input.workspaceRoot,
      searchDepth: input.searchDepth || "fast",
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

import type { AssistContext, ContextPreview, Mode } from "./shared";

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

export function buildQwenPrompt(input: {
  task: string;
  mode: Mode;
  preview: ContextPreview;
  context: AssistContext;
  workspaceRoot?: string | null;
}): string {
  const summaryLines: string[] = [];
  if (input.workspaceRoot) summaryLines.push(`- Workspace root: ${input.workspaceRoot}`);
  if (input.preview.resolvedFiles.length) {
    summaryLines.push(`- Likely target files: ${input.preview.resolvedFiles.join(", ")}`);
  }
  if (input.preview.activeFile) summaryLines.push(`- Active file: ${input.preview.activeFile}`);
  if (input.preview.openFiles.length) summaryLines.push(`- Open files: ${input.preview.openFiles.join(", ")}`);
  if (input.preview.selectedFiles.length) {
    summaryLines.push(`- Relevant retrieval hits: ${input.preview.selectedFiles.join(", ")}`);
  }
  if (input.preview.diagnostics.length) {
    summaryLines.push(`- Diagnostics: ${input.preview.diagnostics.slice(0, 4).join(" | ")}`);
  }

  const sections = [`User request:\n${input.task}`];

  if (summaryLines.length) {
    sections.push(`Workspace summary from Playground:\n${summaryLines.join("\n")}`);
  }

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

  sections.push(
    input.workspaceRoot
      ? `Treat ${input.workspaceRoot} as the user's active project root. Never assume the extension install directory or SDK bundle path is the project unless the user explicitly asks about it.`
      : "Use the current VS Code workspace as the project root."
  );

  sections.push(
    "When the user refers to a file by name, start with the matched files listed above. If you still need context, inspect the workspace with read-only tools or safe inspection commands before answering."
  );

  sections.push(
    input.mode === "plan"
      ? "Stay in plan mode. Explain the approach without making edits."
      : "You may inspect and edit files in the workspace when needed, but understand the target files first and ask before risky command execution."
  );

  return sections.filter(Boolean).join("\n\n");
}

import * as path from "path";
import { existsSync } from "fs";

export type ResolvedOperatingPromptPath = {
  configuredPath: string;
  resolvedPath: string | null;
  error?: string;
};

export function normalizeOperatingPromptMarkdown(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

export function resolveOperatingPromptMarkdownPath(
  configuredPath: string | null | undefined,
  workspaceRootPath?: string | null
): ResolvedOperatingPromptPath {
  const trimmed = String(configuredPath || "").trim();
  if (!trimmed) {
    return {
      configuredPath: "",
      resolvedPath: null,
    };
  }
  if (path.isAbsolute(trimmed)) {
    return {
      configuredPath: trimmed,
      resolvedPath: path.normalize(trimmed),
    };
  }
  if (!workspaceRootPath) {
    return {
      configuredPath: trimmed,
      resolvedPath: null,
      error: "Prompt markdown path is workspace-relative, but no workspace root is open.",
    };
  }
  return {
    configuredPath: trimmed,
    resolvedPath: path.resolve(workspaceRootPath, trimmed),
  };
}

export function resolveBundledOperatingPromptMarkdownPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "..", "resources", "cutie-agent-operating-prompt.md"),
    path.resolve(__dirname, "..", "..", "docs", "cutie-agent-operating-prompt.md"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export function buildComposedCutieSystemPrompt(input: {
  coreContract: string;
  operatingPromptMarkdown?: string | null;
  promptMarkdownPath?: string | null;
}): string {
  const core = normalizeOperatingPromptMarkdown(input.coreContract);
  const operatingPromptMarkdown = normalizeOperatingPromptMarkdown(input.operatingPromptMarkdown);
  if (!operatingPromptMarkdown) {
    return core;
  }
  const section = [
    "Workspace operating prompt (style layer):",
    "Follow the observable working style below unless it conflicts with the hard runtime/tool/safety contract above.",
    input.promptMarkdownPath ? `Prompt markdown path: ${input.promptMarkdownPath}` : "",
    operatingPromptMarkdown,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [core, section].filter(Boolean).join("\n\n");
}

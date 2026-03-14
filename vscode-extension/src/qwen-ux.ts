import * as fs from "fs/promises";
import { URL } from "url";

function looksLikePath(value: string): boolean {
  return /[\\/]/.test(value) || /^[a-z]:/i.test(value);
}

function normalizeRuntimeText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\/g, "/")
    .toLowerCase();
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function isPathInsideWorkspace(pathValue: string, workspaceRoot?: string | null): boolean {
  const normalizedPath = trimTrailingSlashes(normalizeRuntimeText(pathValue));
  const normalizedWorkspaceRoot = trimTrailingSlashes(normalizeRuntimeText(workspaceRoot));
  if (!normalizedPath || !normalizedWorkspaceRoot) return false;
  return (
    normalizedPath === normalizedWorkspaceRoot ||
    normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`)
  );
}

function containsRuntimeNarrativeNoise(text: string): boolean {
  const normalized = normalizeRuntimeText(text);
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

function containsRuntimeNoise(
  text: string,
  input?: {
    workspaceRoot?: string | null;
    executablePath?: string | null;
  }
): boolean {
  const normalized = normalizeRuntimeText(text);
  if (!normalized) return false;

  const executablePathRaw = String(input?.executablePath || "").trim();
  const executablePath = normalizeRuntimeText(executablePathRaw);
  if (
    executablePath &&
    looksLikePath(executablePathRaw) &&
    normalized.includes(executablePath) &&
    !isPathInsideWorkspace(executablePathRaw, input?.workspaceRoot)
  ) {
    return true;
  }

  return (
    containsRuntimeNarrativeNoise(text) ||
    normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
    normalized.includes("/.trae/extensions/playgroundai.xpersona-playground") ||
    normalized.includes("playgroundai.xpersona-playground-") ||
    normalized.includes("/node_modules/@qwen-code/sdk/dist/cli/cli.js")
  );
}

function explicitlyAskedAboutRuntime(task: string): boolean {
  const normalized = normalizeRuntimeText(task);
  const hasRuntimeToken =
    normalized.includes("@qwen-code") ||
    normalized.includes("cli.js") ||
    normalized.includes("qwen code sdk") ||
    normalized.includes("qwen sdk") ||
    normalized.includes("extension runtime") ||
    normalized.includes("extension folder") ||
    normalized.includes("extension directory") ||
    normalized.includes("node_modules") ||
    normalized.includes("trae/extensions") ||
    normalized.includes(".trae") ||
    normalized.includes("sdk/dist/cli");

  if (!hasRuntimeToken) return false;
  if (normalized.includes("?")) return true;
  return /\b(why|what|where|how|explain|debug|investigate|used for|is this)\b/.test(normalized);
}

function stripMetaPreamble(text: string): string {
  return String(text || "")
    .replace(/^\s*(okay|alright|got it|sure)[,.\s-]*/i, "")
    .replace(/^\s*let me[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*this appears to be the location of[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*the user (?:is|has|wants|provided)[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*the user (?:might|may|could|seems to|appears to)[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*since (?:they|the user) included (?:this )?path[^.!?]*[.!?]\s*/i, "")
    .trim();
}

function formatWorkspaceTargets(targets: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (targets || [])
        .map((target) => String(target || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 2);
}

function buildWorkspaceFocusMessage(input: {
  workspaceRoot?: string | null;
  workspaceTargets?: string[];
}): string {
  const targets = formatWorkspaceTargets(input.workspaceTargets);
  if (targets.length === 1) {
    return `I'm focused on the user's workspace code, especially ${targets[0]}. Ask about that file, a symbol, or the current bug and I'll stay grounded in the codebase.`;
  }

  if (targets.length > 1) {
    return `I'm focused on the user's workspace code, especially ${targets.join(" and ")}. Ask about those files, a symbol, or the current bug and I'll stay grounded in the codebase.`;
  }

  const workspaceHint = String(input.workspaceRoot || "").trim();
  return workspaceHint
    ? `I'm focused on the user's workspace code at ${workspaceHint}, not the extension runtime bundle. Ask about a file, symbol, or bug in the open project and I'll use that context.`
    : "I'm focused on the user's workspace code, not the extension runtime bundle. Ask about a file, symbol, or bug in the open project and I'll use that context.";
}

export async function validateQwenPreflight(input: {
  workspaceRoot?: string | null;
  apiKey?: string | null;
  qwenBaseUrl: string;
  playgroundBaseUrl: string;
  executablePath?: string | undefined;
}): Promise<string | null> {
  if (!String(input.workspaceRoot || "").trim()) {
    return "Open a workspace folder before using Qwen Code.";
  }

  if (!String(input.apiKey || "").trim()) {
    return "Set a Playground API key before using the Qwen Code runtime.";
  }

  try {
    new URL(String(input.qwenBaseUrl || "").trim());
  } catch {
    return "The configured Qwen base URL is invalid. Update xpersona.playground.qwen.baseUrl and try again.";
  }

  try {
    new URL(String(input.playgroundBaseUrl || "").trim());
  } catch {
    return "The configured Playground base URL is invalid. Update xpersona.playground.baseApiUrl and try again.";
  }

  const executablePath = String(input.executablePath || "").trim();
  if (executablePath && looksLikePath(executablePath)) {
    try {
      await fs.access(executablePath);
    } catch {
      return `The configured Qwen executable could not be found at ${executablePath}.`;
    }
  }

  return null;
}

export function explainQwenFailure(
  error: unknown,
  input: {
    qwenBaseUrl: string;
    executablePath?: string | undefined;
  }
): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim();

  if (!normalized) {
    return "Qwen Code failed without returning an error message.";
  }

  if (/open a workspace folder/i.test(normalized)) {
    return "Open a workspace folder before using Qwen Code.";
  }

  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(normalized)) {
    return `Could not reach the Qwen endpoint at ${input.qwenBaseUrl}. Start the local Playground server or update xpersona.playground.qwen.baseUrl.`;
  }

  if (/\b401\b|\b403\b|unauthorized|forbidden/i.test(normalized)) {
    return "The Qwen endpoint rejected the current Playground API key. Save a fresh key and try again.";
  }

  if (/ENOENT|not found/i.test(normalized) && String(input.executablePath || "").trim()) {
    return `The configured Qwen executable could not be found at ${String(input.executablePath).trim()}.`;
  }

  if (/model/i.test(normalized) && /(unknown|not found|does not exist)/i.test(normalized)) {
    return "The configured Qwen model could not be loaded. Check xpersona.playground.qwen.model and try again.";
  }

  return normalized;
}

export function sanitizeQwenAssistantOutput(input: {
  text: string;
  task: string;
  workspaceRoot?: string | null;
  executablePath?: string | null;
  workspaceTargets?: string[];
}): string {
  const raw = String(input.text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (explicitlyAskedAboutRuntime(input.task)) {
    return raw;
  }

  const stripped = stripMetaPreamble(raw);
  const paragraphs = stripped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const filtered = paragraphs.filter(
    (paragraph) =>
      !containsRuntimeNoise(paragraph, {
        workspaceRoot: input.workspaceRoot,
        executablePath: input.executablePath,
      })
  );

  const cleaned = (filtered.length ? filtered : [stripped])
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (
    !cleaned ||
    containsRuntimeNoise(cleaned, {
      workspaceRoot: input.workspaceRoot,
      executablePath: input.executablePath,
    })
  ) {
    return buildWorkspaceFocusMessage({
      workspaceRoot: input.workspaceRoot,
      workspaceTargets: input.workspaceTargets,
    });
  }

  return cleaned;
}

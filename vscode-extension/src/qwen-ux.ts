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

function containsRuntimeNoise(text: string, input?: {
  workspaceRoot?: string | null;
  executablePath?: string | null;
}): boolean {
  const normalized = normalizeRuntimeText(text);
  if (!normalized) return false;

  const workspaceRoot = normalizeRuntimeText(input?.workspaceRoot);
  if (workspaceRoot && normalized.includes(workspaceRoot)) {
    return false;
  }

  const executablePath = normalizeRuntimeText(input?.executablePath);
  if (executablePath && normalized.includes(executablePath)) {
    return true;
  }

  return (
    normalized.includes("@qwen-code/sdk/dist/cli/cli.js") ||
    normalized.includes("/.trae/extensions/playgroundai.xpersona-playground") ||
    normalized.includes("playgroundai.xpersona-playground-") ||
    normalized.includes("/node_modules/@qwen-code/sdk/dist/cli/cli.js")
  );
}

function explicitlyAskedAboutRuntime(task: string): boolean {
  const normalized = normalizeRuntimeText(task);
  return (
    normalized.includes("@qwen-code") ||
    normalized.includes("cli.js") ||
    normalized.includes("qwen code sdk") ||
    normalized.includes("extension folder") ||
    normalized.includes("node_modules") ||
    normalized.includes("trae/extensions") ||
    normalized.includes("sdk/dist/cli")
  );
}

function stripMetaPreamble(text: string): string {
  return String(text || "")
    .replace(/^\s*(okay|alright|got it|sure)[,.\s-]*/i, "")
    .replace(/^\s*let me[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*the user (?:is|has|wants|provided)[^.!?]*[.!?]\s*/i, "")
    .trim();
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

export function explainQwenFailure(error: unknown, input: {
  qwenBaseUrl: string;
  executablePath?: string | undefined;
}): string {
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
    return "I’m focused on your current workspace, not the extension runtime bundle. Ask about a file, symbol, or bug in the open project and I’ll use that context.";
  }

  return cleaned;
}

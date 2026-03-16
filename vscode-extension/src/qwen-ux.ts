import * as fs from "fs/promises";
import { URL } from "url";
import {
  containsRuntimeNoiseForContext,
  isExplicitRuntimeTask,
} from "./qwen-runtime-noise";

function looksLikePath(value: string): boolean {
  return /[\\/]/.test(value) || /^[a-z]:/i.test(value);
}

function stripMetaPreamble(text: string): string {
  return String(text || "")
    .replace(/^\s*(okay|alright|got it|sure)[,.\s-]*/i, "")
    .replace(/^\s*let me[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*this appears to be the location of[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*i notice you've shared[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*the user (?:is|has|wants|provided)[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*the user (?:might|may|could|seems to|appears to)[^.!?]*[.!?]\s*/i, "")
    .replace(/^\s*since (?:they|the user) included (?:this )?path[^.!?]*[.!?]\s*/i, "")
    .trim();
}

function stripPseudoToolMarkup(text: string): string {
  return String(text || "")
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<function=[^>]+>/gi, "")
    .replace(/<\/function>/gi, "")
    .replace(/<parameter=[^>]+>/gi, "")
    .replace(/<\/parameter>/gi, "")
    .replace(/\bfunction=[A-Za-z0-9_.:-]+\b/gi, "")
    .replace(/\bparameter=[A-Za-z0-9_.:-]+\b/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsPseudoToolMarkup(text: string): boolean {
  return /<tool_call>[\s\S]*?<\/tool_call>/i.test(String(text || "")) || /<function=[^>]+>|<parameter=[^>]+>/i.test(String(text || ""));
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
    return "Set a Binary IDE API key before using the Qwen Code runtime.";
  }

  try {
    new URL(String(input.qwenBaseUrl || "").trim());
  } catch {
    return "The configured Qwen base URL is invalid. Update xpersona.binary.qwen.baseUrl and try again.";
  }

  try {
    new URL(String(input.playgroundBaseUrl || "").trim());
  } catch {
    return "The configured Binary IDE base URL is invalid. Update xpersona.binary.baseApiUrl and try again.";
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
    return `Could not reach the Qwen endpoint at ${input.qwenBaseUrl}. Check the endpoint and update xpersona.binary.qwen.baseUrl if needed.`;
  }

  if (/\b401\b|\b403\b|unauthorized|forbidden/i.test(normalized)) {
    return "The Qwen endpoint rejected the current Binary IDE API key. Save a fresh key and try again.";
  }

  if (/ENOENT|not found/i.test(normalized) && String(input.executablePath || "").trim()) {
    return `The configured Qwen executable could not be found at ${String(input.executablePath).trim()}.`;
  }

  if (/model/i.test(normalized) && /(unknown|not found|does not exist)/i.test(normalized)) {
    return "The configured Qwen model could not be loaded. Check xpersona.binary.qwen.model and try again.";
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
  if (isExplicitRuntimeTask(input.task)) {
    return stripPseudoToolMarkup(raw) || raw;
  }

  const rawWithoutToolMarkup = stripPseudoToolMarkup(raw);
  if (!rawWithoutToolMarkup) {
    return buildWorkspaceFocusMessage({
      workspaceRoot: input.workspaceRoot,
      workspaceTargets: input.workspaceTargets,
    });
  }

  const paragraphs = rawWithoutToolMarkup
    .split(/\n{2,}/)
    .map((paragraph) => ({
      original: paragraph.trim(),
      stripped: stripMetaPreamble(paragraph).trim(),
    }))
    .filter((paragraph) => paragraph.original)
    .map((paragraph) => ({
      ...paragraph,
      value: paragraph.stripped || paragraph.original,
    }))
    .filter(Boolean);

  const filtered = paragraphs.filter(
    (paragraph) =>
      !containsRuntimeNoiseForContext({
        text: paragraph.original,
        task: input.task,
        workspaceRoot: input.workspaceRoot,
        executablePath: input.executablePath,
        workspaceTargets: input.workspaceTargets,
      }) &&
      !containsRuntimeNoiseForContext({
        text: paragraph.value,
        task: input.task,
        workspaceRoot: input.workspaceRoot,
        executablePath: input.executablePath,
        workspaceTargets: input.workspaceTargets,
      })
  );

  if (paragraphs.length && !filtered.length) {
    return buildWorkspaceFocusMessage({
      workspaceRoot: input.workspaceRoot,
      workspaceTargets: input.workspaceTargets,
    });
  }

  const fallback = stripMetaPreamble(rawWithoutToolMarkup).trim() || rawWithoutToolMarkup;
  const cleaned = (filtered.length ? filtered.map((paragraph) => paragraph.value) : [fallback])
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (
    !cleaned ||
    containsRuntimeNoiseForContext({
      text: cleaned,
      task: input.task,
      workspaceRoot: input.workspaceRoot,
      executablePath: input.executablePath,
      workspaceTargets: input.workspaceTargets,
    })
  ) {
    return buildWorkspaceFocusMessage({
      workspaceRoot: input.workspaceRoot,
      workspaceTargets: input.workspaceTargets,
    });
  }

  return cleaned;
}

export function shouldSuppressQwenPartialOutput(input: {
  text: string;
  task: string;
  workspaceRoot?: string | null;
  executablePath?: string | null;
  workspaceTargets?: string[];
}): boolean {
  const raw = String(input.text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return true;
  if (isExplicitRuntimeTask(input.task)) return false;

  if (containsPseudoToolMarkup(raw)) {
    return true;
  }

  return containsRuntimeNoiseForContext({
    text: raw,
    task: input.task,
    workspaceRoot: input.workspaceRoot,
    executablePath: input.executablePath,
    workspaceTargets: input.workspaceTargets,
  });
}

import * as vscode from "vscode";
import { createHash } from "crypto";
import * as path from "path";
import { existsSync } from "fs";

export const EXTENSION_NAMESPACE = "cutie-product";
export const VIEW_ID = "cutie-product.chat";
export const API_KEY_SECRET = "cutie-product.apiKey";
export const REFRESH_TOKEN_SECRET = "cutie-product.refreshToken";
export const PENDING_PKCE_KEY = "cutie-product.pendingPkce";

export function getBaseApiUrl(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("baseApiUrl", "http://localhost:3000");
  return String(configured || "http://localhost:3000").trim().replace(/\/+$/, "");
}

/** Base URL for portable bundle (binary) API; defaults to `getBaseApiUrl()` when unset. */
export function getBinaryApiBaseUrl(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("binary.baseApiUrl", "");
  const trimmed = String(configured || "").trim().replace(/\/+$/, "");
  return trimmed || getBaseApiUrl();
}

export function getBinaryStreamGatewayUrl(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("binary.streamGatewayUrl", "");
  return String(configured || "").trim().replace(/\/+$/, "");
}

/** Composer backend: Cutie agent (default) or Binary IDE–compatible hosted / Qwen runtimes. */
export type BinaryIdeChatRuntime = "cutie" | "playgroundApi" | "qwenCode";

export function getBinaryIdeChatRuntime(): BinaryIdeChatRuntime {
  const raw = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("binary.runtime", "cutie");
  if (raw === "playgroundApi") return "playgroundApi";
  if (raw === "qwenCode") return "qwenCode";
  return "cutie";
}

export function getQwenModel(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("binary.qwen.model", "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest");
  return String(configured || "Qwen/Qwen3-Next-80B-A3B-Thinking:fastest").trim();
}

export function getQwenOpenAiBaseUrl(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("binary.qwen.baseUrl", `${getBaseApiUrl()}/api/v1/hf`);
  const value = String(configured || `${getBaseApiUrl()}/api/v1/hf`).trim();
  return value.replace(/\/+$/, "");
}

export function getQwenExecutablePath(): string | undefined {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("binary.qwen.executable", "");
  const value = String(configured || "").trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (
    lower.includes(".trae/extensions/") ||
    lower.includes("cutie-product.cutie-product-") ||
    lower.includes("@qwen-code/sdk/dist/cli/cli.js")
  ) {
    return undefined;
  }
  return value;
}

export function getQwenCliWrapperEnabled(): boolean {
  return vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<boolean>("binary.qwen.cliWrapper", false) === true;
}

export function getQwenCliWrapperPath(): string | undefined {
  const wrapperPath = path.join(__dirname, "..", "scripts", "qwen-cli-wrapper.js");
  return existsSync(wrapperPath) ? path.resolve(wrapperPath) : undefined;
}

export function normalizeWorkspaceRelativePath(input: string | null | undefined): string | null {
  const normalized = String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^@+/, "")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || /^[a-z]:\//i.test(normalized)) return null;
  return normalized;
}

export function toAbsoluteWorkspacePath(relativePath: string): string | null {
  const root = getWorkspaceRootPath();
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!root || !normalized) return null;
  return path.join(root, normalized);
}

export function getProjectKey(): string | null {
  const folder = getWorkspaceFolder();
  if (!folder) return null;
  return `${folder.name}:${getWorkspaceHash()}`;
}

export function getModelHint(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("model", "openai/gpt-oss-120b:fastest");
  return String(configured || "openai/gpt-oss-120b:fastest").trim();
}

export function getPromptMarkdownPath(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("promptMarkdownPath", "docs/cutie-agent-operating-prompt.md");
  return String(configured || "").trim();
}

/** Presets for the chat model dropdown; the configured workspace model is always included. Add ids here as you ship more. */
const MODEL_PICKER_PRESETS: string[] = ["openai/gpt-oss-120b:fastest"];

export function getModelPickerOptions(): string[] {
  return Array.from(new Set([getModelHint(), ...MODEL_PICKER_PRESETS])).sort((a, b) => a.localeCompare(b));
}

export const CUTIE_REASONING_LEVELS = ["Low", "Medium", "High", "Extra High"] as const;
export type CutieReasoningLevel = (typeof CUTIE_REASONING_LEVELS)[number];

export function getReasoningLevel(): CutieReasoningLevel {
  const raw = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("reasoningLevel", "Medium");
  const s = String(raw || "").trim();
  return (CUTIE_REASONING_LEVELS as readonly string[]).includes(s) ? (s as CutieReasoningLevel) : "Medium";
}

export function getExperimentalDesktopAdaptersEnabled(): boolean {
  return vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<boolean>("experimentalDesktopAdapters", false) === true;
}

export function getWorkspaceFolder(): vscode.WorkspaceFolder | null {
  return vscode.workspace.workspaceFolders?.[0] ?? null;
}

export function getWorkspaceRootPath(): string | null {
  return getWorkspaceFolder()?.uri.fsPath ?? null;
}

export function getWorkspaceHash(): string {
  const root = getWorkspaceRootPath();
  if (!root) return "no-workspace";
  return createHash("sha1").update(root, "utf8").digest("hex");
}

export function toWorkspaceRelativePath(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return null;
  return path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
}

export function getExtensionVersion(context: vscode.ExtensionContext): string {
  return String(context.extension.packageJSON.version || "0.0.0");
}

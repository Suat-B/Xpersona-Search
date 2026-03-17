import * as vscode from "vscode";
import * as path from "path";
import { createHash } from "crypto";
import type { RuntimeBackend } from "./shared";

export const EXTENSION_NAMESPACE = "xpersona.binary";
export const LEGACY_EXTENSION_NAMESPACE = "xpersona.playground";
export const WEBVIEW_VIEW_ID = "xpersona.playgroundView";

export const API_KEY_SECRET = "xpersona.apiKey";
export const API_KEY_LEGACY_SECRET = "xpersona.playground.apiKey";
export const REFRESH_TOKEN_SECRET = "xpersona.playground.vscodeRefreshToken";
export const MODE_KEY = "xpersona.playground.mode";
export const INDEX_STATE_KEY = "xpersona.playground.indexState";
export const INDEX_FILE_STATE_KEY = "xpersona.playground.indexFileState";
export const PENDING_PKCE_KEY = "xpersona.playground.pendingPkce";

const MIGRATABLE_CONFIGURATION_KEYS = [
  "baseApiUrl",
  "runtime",
  "qwen.model",
  "qwen.baseUrl",
  "qwen.executable",
] as const;

function getExplicitConfigurationValue<T>(namespace: string, key: string): T | undefined {
  const inspection = vscode.workspace.getConfiguration(namespace).inspect<T>(key);
  return (
    inspection?.workspaceFolderValue ??
    inspection?.workspaceValue ??
    inspection?.globalValue ??
    undefined
  );
}

function getConfigurationValue<T>(key: string, fallback: T): T {
  const currentExplicit = getExplicitConfigurationValue<T>(EXTENSION_NAMESPACE, key);
  if (currentExplicit !== undefined) return currentExplicit;

  const legacyExplicit = getExplicitConfigurationValue<T>(LEGACY_EXTENSION_NAMESPACE, key);
  if (legacyExplicit !== undefined) return legacyExplicit;

  const currentValue = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<T>(key);
  if (currentValue !== undefined) return currentValue;

  const legacyValue = vscode.workspace.getConfiguration(LEGACY_EXTENSION_NAMESPACE).get<T>(key);
  if (legacyValue !== undefined) return legacyValue;

  return fallback;
}

export async function migrateLegacyConfiguration(): Promise<void> {
  const current = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE);
  const legacy = vscode.workspace.getConfiguration(LEGACY_EXTENSION_NAMESPACE);

  for (const key of MIGRATABLE_CONFIGURATION_KEYS) {
    const currentInspect = current.inspect(key);
    const legacyInspect = legacy.inspect(key);

    if (currentInspect?.globalValue === undefined && legacyInspect?.globalValue !== undefined) {
      await current.update(key, legacyInspect.globalValue, vscode.ConfigurationTarget.Global);
    }
    if (currentInspect?.workspaceValue === undefined && legacyInspect?.workspaceValue !== undefined) {
      await current.update(key, legacyInspect.workspaceValue, vscode.ConfigurationTarget.Workspace);
    }
    if (
      currentInspect?.workspaceFolderValue === undefined &&
      legacyInspect?.workspaceFolderValue !== undefined
    ) {
      await current.update(key, legacyInspect.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
}

export function getBaseApiUrl(): string {
  const configured = getConfigurationValue<string>("baseApiUrl", "http://localhost:3000");
  const value = String(configured || "http://localhost:3000").trim();
  return value.replace(/\/+$/, "");
}

export function getRuntimeBackend(): RuntimeBackend {
  const configured = getConfigurationValue<string>("runtime", "qwenCode");
  return configured === "playgroundApi" ? "playgroundApi" : "qwenCode";
}

export function getQwenModel(): string {
  const configured = getConfigurationValue<string>(
    "qwen.model",
    "Qwen/Qwen3-Coder-30B-A3B-Instruct:featherless-ai"
  );
  return String(configured || "Qwen/Qwen3-Coder-30B-A3B-Instruct:featherless-ai").trim();
}

export function getQwenOpenAiBaseUrl(): string {
  const configured = getConfigurationValue<string>("qwen.baseUrl", `${getBaseApiUrl()}/api/v1/hf`);
  const value = String(configured || `${getBaseApiUrl()}/api/v1/hf`).trim();
  return value.replace(/\/+$/, "");
}

export function getQwenExecutablePath(): string | undefined {
  const configured = getConfigurationValue<string>("qwen.executable", "");
  const value = String(configured || "").trim();
  return value || undefined;
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

export function getProjectKey(): string | null {
  const folder = getWorkspaceFolder();
  if (!folder) return null;
  return `${folder.name}:${getWorkspaceHash()}`;
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

export function toWorkspaceRelativePath(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return null;
  return normalizeWorkspaceRelativePath(path.relative(folder.uri.fsPath, uri.fsPath));
}

export function toAbsoluteWorkspacePath(relativePath: string): string | null {
  const root = getWorkspaceRootPath();
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  if (!root || !normalized) return null;
  return path.join(root, normalized);
}

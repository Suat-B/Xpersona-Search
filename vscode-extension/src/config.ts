import * as vscode from "vscode";
import * as path from "path";
import { createHash } from "crypto";
import type { RuntimeBackend } from "./shared";

export const EXTENSION_NAMESPACE = "xpersona.playground";
export const WEBVIEW_VIEW_ID = "xpersona.playgroundView";

export const API_KEY_SECRET = "xpersona.apiKey";
export const API_KEY_LEGACY_SECRET = "xpersona.playground.apiKey";
export const REFRESH_TOKEN_SECRET = "xpersona.playground.vscodeRefreshToken";
export const MODE_KEY = "xpersona.playground.mode";
export const INDEX_STATE_KEY = "xpersona.playground.indexState";
export const PENDING_PKCE_KEY = "xpersona.playground.pendingPkce";

export function getBaseApiUrl(): string {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("baseApiUrl");
  const value = String(configured || "http://localhost:3000").trim();
  return value.replace(/\/+$/, "");
}

export function getRuntimeBackend(): RuntimeBackend {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("runtime");
  return configured === "playgroundApi" ? "playgroundApi" : "qwenCode";
}

export function getQwenModel(): string {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("qwen.model");
  return String(configured || "Qwen/Qwen3-4B-Thinking-2507:nscale").trim();
}

export function getQwenOpenAiBaseUrl(): string {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("qwen.baseUrl");
  const value = String(configured || `${getBaseApiUrl()}/api/v1/hf`).trim();
  return value.replace(/\/+$/, "");
}

export function getQwenExecutablePath(): string | undefined {
  const configured = vscode.workspace.getConfiguration(EXTENSION_NAMESPACE).get<string>("qwen.executable");
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

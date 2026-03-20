import * as vscode from "vscode";
import { createHash } from "crypto";
import * as path from "path";

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

export function getModelHint(): string {
  const configured = vscode.workspace
    .getConfiguration(EXTENSION_NAMESPACE)
    .get<string>("model", "MiniMaxAI/MiniMax-M2.5:fastest");
  return String(configured || "MiniMaxAI/MiniMax-M2.5:fastest").trim();
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

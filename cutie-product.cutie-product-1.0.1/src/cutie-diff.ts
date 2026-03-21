import * as vscode from "vscode";
import { randomBytes } from "crypto";

export const CUTIE_DIFF_BEFORE_SCHEME = "cutie-diff-before";

const virtualStash = new Map<string, string>();
const MAX_VIRTUAL_STASH = 40;

/** Last "before" snapshot per relative path for reopening diff from the chat card. */
const lastBeforeByPath = new Map<string, string>();
const MAX_PATH_MEMORY = 48;

function trimPathKey(relativePath: string): string {
  return String(relativePath || "")
    .trim()
    .replace(/\\/g, "/");
}

function pruneVirtualStash(): void {
  while (virtualStash.size > MAX_VIRTUAL_STASH) {
    const first = virtualStash.keys().next().value;
    if (!first) break;
    virtualStash.delete(first);
  }
}

function prunePathMemory(): void {
  while (lastBeforeByPath.size > MAX_PATH_MEMORY) {
    const first = lastBeforeByPath.keys().next().value;
    if (!first) break;
    lastBeforeByPath.delete(first);
  }
}

/**
 * Virtual URI whose text is served from memory (classic diff left pane).
 */
export function createCutieBeforeUri(previousContent: string): vscode.Uri {
  pruneVirtualStash();
  const id = randomBytes(14).toString("hex");
  virtualStash.set(id, previousContent);
  return vscode.Uri.from({ scheme: CUTIE_DIFF_BEFORE_SCHEME, path: `/${id}` });
}

export function rememberMutationBefore(relativePath: string, previousContent: string): void {
  const key = trimPathKey(relativePath);
  if (!key) return;
  lastBeforeByPath.set(key, previousContent);
  prunePathMemory();
}

export function takeLastMutationBefore(relativePath: string): string | undefined {
  const key = trimPathKey(relativePath);
  if (!key) return undefined;
  return lastBeforeByPath.get(key);
}

export function registerCutieDiffBeforeProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent(uri: vscode.Uri): string {
      const id = uri.path.replace(/^\//, "");
      return virtualStash.get(id) ?? "";
    },
  };
  const registration = vscode.workspace.registerTextDocumentContentProvider(CUTIE_DIFF_BEFORE_SCHEME, provider);
  context.subscriptions.push(registration);
  return registration;
}

import type * as vscode from "vscode";
import type { RuntimeBackend } from "./shared";

const DRAFT_STORE_KEY = "xpersona.playground.drafts";

type DraftMap = Record<string, string>;

function normalizeDraftText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n");
}

function readDraftMap(raw: unknown): DraftMap {
  if (!raw || typeof raw !== "object") return {};
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [String(key || "").trim(), normalizeDraftText(String(value || ""))] as const)
    .filter(([key, value]) => Boolean(key) && Boolean(value.trim()));
  return Object.fromEntries(entries);
}

export function buildDraftKey(runtime: RuntimeBackend, sessionId?: string | null): string {
  const bucket = String(sessionId || "").trim() || "__new__";
  return `${runtime}:${bucket}`;
}

export class DraftStore {
  constructor(private readonly storage: vscode.Memento) {}

  async get(runtime: RuntimeBackend, sessionId?: string | null): Promise<string> {
    const drafts = readDraftMap(this.storage.get<unknown>(DRAFT_STORE_KEY));
    return drafts[buildDraftKey(runtime, sessionId)] || "";
  }

  async set(runtime: RuntimeBackend, sessionId: string | null | undefined, text: string): Promise<void> {
    const drafts = readDraftMap(this.storage.get<unknown>(DRAFT_STORE_KEY));
    const key = buildDraftKey(runtime, sessionId);
    const normalized = normalizeDraftText(text);

    if (!normalized.trim()) {
      delete drafts[key];
    } else {
      drafts[key] = normalized;
    }

    await this.storage.update(DRAFT_STORE_KEY, drafts);
  }
}

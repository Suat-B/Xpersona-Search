import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { getWorkspaceHash } from "./config";
import type { ChatMessage, HistoryItem, IntentKind, Mode } from "./shared";

const CUTIE_HISTORY_KEY_PREFIX = "xpersona.playground.cutie.sessions";
const MAX_SESSIONS = 30;

type StoredCutieMode = "auto" | "plan";

type CutieSessionRecord = {
  id: string;
  title: string;
  mode: StoredCutieMode;
  updatedAt: string;
  messages: ChatMessage[];
  lastTargets?: string[];
  lastIntent?: IntentKind;
};

function normalizeTimestamp(value: string | undefined): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function basename(pathValue: string): string {
  const normalized = String(pathValue || "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

function normalizeTask(text: string): string {
  return String(text || "")
    .replace(/@[A-Za-z0-9_./-]+/g, "")
    .replace(/[<3]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveTitle(input: {
  text: string;
  intent?: IntentKind;
  targets?: string[];
}): string {
  const task = normalizeTask(input.text);
  const primaryTarget = basename((input.targets || []).find((target) => String(target || "").trim()) || "");

  let prefix = "";
  if (input.intent === "change") {
    prefix = primaryTarget ? `Change ${primaryTarget}` : "Change request";
  } else if (input.intent === "find") {
    prefix = primaryTarget ? `Find in ${primaryTarget}` : "Find request";
  } else if (input.intent === "explain") {
    prefix = primaryTarget ? `Explain ${primaryTarget}` : "Explain request";
  }

  if (prefix && task) {
    return `${prefix}: ${task}`.slice(0, 96);
  }
  if (prefix) return prefix.slice(0, 96);
  if (task) return task.slice(0, 96);
  return primaryTarget ? `Cutie on ${primaryTarget}` : "Cutie chat";
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: String(message.id || randomUUID()),
    role: message.role,
    content: String(message.content || ""),
  }));
}

function toStoredMode(mode: Mode): StoredCutieMode {
  return mode === "plan" ? "plan" : "auto";
}

export class CutieHistoryService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getWorkspaceHints(): Promise<{
    recentTargets: string[];
    recentIntents: IntentKind[];
  }> {
    const sessions = this.readSessions()
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 8);
    const targetSet = new Set<string>();
    const recentTargets: string[] = [];
    const recentIntents: IntentKind[] = [];

    for (const session of sessions) {
      if (session.lastIntent) {
        recentIntents.push(session.lastIntent);
      }
      for (const target of session.lastTargets || []) {
        const normalized = String(target || "").trim();
        const key = normalized.toLowerCase();
        if (!normalized || targetSet.has(key)) continue;
        targetSet.add(key);
        recentTargets.push(normalized);
        if (recentTargets.length >= 8) break;
      }
      if (recentTargets.length >= 8) break;
    }

    return {
      recentTargets,
      recentIntents,
    };
  }

  async list(): Promise<HistoryItem[]> {
    const sessions = this.readSessions();
    return sessions
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((session) => ({
        id: session.id,
        title: session.title,
        mode: session.mode,
        updatedAt: session.updatedAt,
      }));
  }

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    const session = this.readSessions().find((item) => item.id === sessionId);
    return cloneMessages(session?.messages || []);
  }

  async hasSession(sessionId: string): Promise<boolean> {
    return this.readSessions().some((item) => item.id === sessionId);
  }

  async saveConversation(input: {
    sessionId: string;
    mode: Mode;
    title?: string;
    messages: ChatMessage[];
    targets?: string[];
    intent?: IntentKind;
  }): Promise<void> {
    const sessions = this.readSessions();
    const nextSession: CutieSessionRecord = {
      id: input.sessionId,
      title: deriveTitle({
        text:
          input.title ||
          input.messages.find((message) => message.role === "user")?.content ||
          input.messages[0]?.content ||
          "",
        intent: input.intent,
        targets: input.targets,
      }),
      mode: toStoredMode(input.mode),
      updatedAt: new Date().toISOString(),
      messages: cloneMessages(input.messages),
      ...(input.targets?.length ? { lastTargets: input.targets.slice(0, 6) } : {}),
      ...(input.intent ? { lastIntent: input.intent } : {}),
    };

    const updated = sessions.filter((item) => item.id !== input.sessionId);
    updated.unshift(nextSession);
    await this.context.globalState.update(this.getStorageKey(), updated.slice(0, MAX_SESSIONS));
  }

  private readSessions(): CutieSessionRecord[] {
    const raw = this.context.globalState.get<unknown[]>(this.getStorageKey()) || [];
    return raw
      .map((value) => {
        const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        if (!record || typeof record.id !== "string") return null;
        const messages = Array.isArray(record.messages)
          ? record.messages
              .map((message) => {
                const row = message && typeof message === "object" ? (message as Record<string, unknown>) : null;
                if (!row || typeof row.content !== "string") return null;
                const role =
                  row.role === "assistant" || row.role === "system" || row.role === "user"
                    ? row.role
                    : "assistant";
                return {
                  id: typeof row.id === "string" ? row.id : randomUUID(),
                  role,
                  content: row.content,
                } as ChatMessage;
              })
              .filter((message): message is ChatMessage => Boolean(message))
          : [];

        const session: CutieSessionRecord = {
          id: record.id,
          title:
            typeof record.title === "string" && record.title.trim()
              ? record.title.trim()
              : deriveTitle({
                  text: messages.find((message) => message.role === "user")?.content || "",
                }),
          mode: record.mode === "plan" ? "plan" : "auto",
          updatedAt: normalizeTimestamp(typeof record.updatedAt === "string" ? record.updatedAt : undefined),
          messages,
          lastTargets: Array.isArray(record.lastTargets)
            ? record.lastTargets.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 6)
            : [],
          lastIntent:
            record.lastIntent === "ask" ||
            record.lastIntent === "change" ||
            record.lastIntent === "find" ||
            record.lastIntent === "explain"
              ? record.lastIntent
              : undefined,
        };
        return session;
      })
      .filter((session): session is CutieSessionRecord => Boolean(session));
  }

  private getStorageKey(): string {
    return `${CUTIE_HISTORY_KEY_PREFIX}.${getWorkspaceHash()}`;
  }
}

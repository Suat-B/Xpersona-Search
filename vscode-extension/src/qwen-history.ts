import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { getWorkspaceHash } from "./config";
import type { ChatMessage, HistoryItem, Mode } from "./shared";

const QWEN_HISTORY_KEY_PREFIX = "xpersona.playground.qwen.sessions";
const MAX_SESSIONS = 30;

type StoredQwenMode = "auto" | "plan";

type QwenSessionRecord = {
  id: string;
  title: string;
  mode: StoredQwenMode;
  updatedAt: string;
  messages: ChatMessage[];
};

function normalizeTimestamp(value: string | undefined): string {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function deriveTitle(text: string): string {
  return (
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Qwen Code chat"
  );
}

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    id: String(message.id || randomUUID()),
    role: message.role,
    content: String(message.content || ""),
  }));
}

function toStoredMode(mode: Mode): StoredQwenMode {
  return mode === "plan" ? "plan" : "auto";
}

export class QwenHistoryService {
  constructor(private readonly context: vscode.ExtensionContext) {}

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
  }): Promise<void> {
    const sessions = this.readSessions();
    const nextSession: QwenSessionRecord = {
      id: input.sessionId,
      title: deriveTitle(
        input.title ||
          input.messages.find((message) => message.role === "user")?.content ||
          input.messages[0]?.content ||
          ""
      ),
      mode: toStoredMode(input.mode),
      updatedAt: new Date().toISOString(),
      messages: cloneMessages(input.messages),
    };

    const updated = sessions.filter((item) => item.id !== input.sessionId);
    updated.unshift(nextSession);
    await this.context.globalState.update(this.getStorageKey(), updated.slice(0, MAX_SESSIONS));
  }

  private readSessions(): QwenSessionRecord[] {
    const raw = this.context.globalState.get<unknown[]>(this.getStorageKey()) || [];
    return raw
      .map((value) => {
        const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
        if (!record || typeof record.id !== "string") return null;
        const messages = Array.isArray(record.messages)
          ? record.messages
              .map((message) => {
                const row =
                  message && typeof message === "object" ? (message as Record<string, unknown>) : null;
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

        return {
          id: record.id,
          title: deriveTitle(typeof record.title === "string" ? record.title : ""),
          mode: record.mode === "plan" ? "plan" : "auto",
          updatedAt: normalizeTimestamp(typeof record.updatedAt === "string" ? record.updatedAt : undefined),
          messages,
        } satisfies QwenSessionRecord;
      })
      .filter((session): session is QwenSessionRecord => Boolean(session));
  }

  private getStorageKey(): string {
    return `${QWEN_HISTORY_KEY_PREFIX}:${getWorkspaceHash()}`;
  }
}

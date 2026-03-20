import { randomUUID } from "crypto";
import { requestJson } from "./http";
import type { HostedChatMessage, HostedHistoryItem, RequestAuth } from "./types";

type SessionsResponse<Mode extends string> = {
  data?: Array<{
    id?: string;
    title?: string | null;
    mode?: Mode;
    updatedAt?: string | null;
    updated_at?: string | null;
  }>;
};

type SessionMessageRow = {
  id?: string;
  role?: string;
  content?: string;
};

export class HostedSessionHistoryService<Mode extends string = string> {
  constructor(
    private readonly getBaseApiUrl: () => string,
    private readonly fallbackMode: Mode
  ) {}

  async list(auth: RequestAuth, limit = 30): Promise<HostedHistoryItem<Mode>[]> {
    const response = await requestJson<SessionsResponse<Mode>>(
      "GET",
      `${this.getBaseApiUrl()}/api/v1/playground/sessions?limit=${Math.max(1, Math.min(limit, 100))}`,
      auth
    );
    return (response?.data || [])
      .filter((item) => Boolean(item?.id))
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || "Untitled chat"),
        mode: (item.mode || this.fallbackMode) as Mode,
        updatedAt: item.updatedAt || item.updated_at || null,
      }));
  }

  async loadMessages(auth: RequestAuth, sessionId: string): Promise<HostedChatMessage[]> {
    const rows = await requestJson<SessionMessageRow[]>(
      "GET",
      `${this.getBaseApiUrl()}/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=false`,
      auth
    );
    return (rows || [])
      .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
      .reverse()
      .map((row) => ({
        id: String(row.id || randomUUID()),
        role: row.role as "user" | "assistant",
        content: String(row.content || ""),
      }));
  }
}

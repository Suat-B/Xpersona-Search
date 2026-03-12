import { randomUUID } from "crypto";
import { getBaseApiUrl } from "./config";
import { requestJson } from "./api-client";
import type { ChatMessage, HistoryItem, RequestAuth } from "./shared";

type SessionsResponse = {
  data?: Array<{
    id?: string;
    title?: string | null;
    mode?: "auto" | "plan" | "yolo";
    updatedAt?: string | null;
    updated_at?: string | null;
  }>;
};

type SessionMessageRow = {
  id?: string;
  role?: string;
  content?: string;
};

export class SessionHistoryService {
  async list(auth: RequestAuth): Promise<HistoryItem[]> {
    const response = await requestJson<SessionsResponse>(
      "GET",
      `${getBaseApiUrl()}/api/v1/playground/sessions?limit=30`,
      auth
    );
    return (response?.data || [])
      .filter((item) => Boolean(item?.id))
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || "Untitled chat"),
        mode: (item.mode || "auto") as HistoryItem["mode"],
        updatedAt: item.updatedAt || item.updated_at || null,
      }));
  }

  async loadMessages(auth: RequestAuth, sessionId: string): Promise<ChatMessage[]> {
    const rows = await requestJson<SessionMessageRow[]>(
      "GET",
      `${getBaseApiUrl()}/api/v1/playground/sessions/${encodeURIComponent(sessionId)}/messages?includeAgentEvents=false`,
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

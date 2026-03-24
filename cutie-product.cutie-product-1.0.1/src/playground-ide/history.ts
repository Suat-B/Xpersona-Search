import { HostedSessionHistoryService } from "@xpersona/vscode-core";
import { getBaseApiUrl } from "./pg-config";
import type { ChatMessage, HistoryItem, RequestAuth } from "./shared";

export class SessionHistoryService {
  private readonly hosted = new HostedSessionHistoryService<HistoryItem["mode"]>(getBaseApiUrl, "auto");

  async list(auth: RequestAuth): Promise<HistoryItem[]> {
    return this.hosted.list(auth);
  }

  async loadMessages(auth: RequestAuth, sessionId: string): Promise<ChatMessage[]> {
    return this.hosted.loadMessages(auth, sessionId);
  }
}

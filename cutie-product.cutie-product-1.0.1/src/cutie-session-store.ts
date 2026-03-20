import * as vscode from "vscode";
import { nowIso, randomId } from "./cutie-policy";
import type {
  CutieChatMessage,
  CutieRunState,
  CutieSessionRecord,
  CutieSessionSummary,
  DesktopSnapshotRef,
} from "./types";

const SESSION_STORE_KEY = "cutie-product.sessionStore.v1";
const MAX_SESSIONS_PER_WORKSPACE = 20;

type PersistedStore = {
  version: 1;
  sessionsByWorkspace: Record<string, CutieSessionRecord[]>;
};

function emptyStore(): PersistedStore {
  return {
    version: 1,
    sessionsByWorkspace: {},
  };
}

function cloneSession(session: CutieSessionRecord): CutieSessionRecord {
  return JSON.parse(JSON.stringify(session)) as CutieSessionRecord;
}

function deriveTitle(prompt: string): string {
  return (
    String(prompt || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Cutie Session"
  );
}

export class CutieSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private getStore(): PersistedStore {
    return this.context.globalState.get<PersistedStore>(SESSION_STORE_KEY) || emptyStore();
  }

  private async saveStore(store: PersistedStore): Promise<void> {
    await this.context.globalState.update(SESSION_STORE_KEY, store);
  }

  listSessions(workspaceHash: string): CutieSessionSummary[] {
    const sessions = this.getStore().sessionsByWorkspace[workspaceHash] || [];
    return sessions
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
        lastStatus: session.runs[session.runs.length - 1]?.status || "idle",
      }));
  }

  getSession(workspaceHash: string, sessionId: string): CutieSessionRecord | null {
    const sessions = this.getStore().sessionsByWorkspace[workspaceHash] || [];
    const session = sessions.find((item) => item.id === sessionId);
    return session ? cloneSession(session) : null;
  }

  async createSession(workspaceHash: string, initialPrompt?: string): Promise<CutieSessionRecord> {
    const timestamp = nowIso();
    const session: CutieSessionRecord = {
      id: randomId("cutie_session"),
      workspaceHash,
      title: deriveTitle(initialPrompt || ""),
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
      runs: [],
      snapshots: [],
    };
    await this.saveSession(session);
    return session;
  }

  async saveSession(session: CutieSessionRecord): Promise<void> {
    const store = this.getStore();
    const existing = store.sessionsByWorkspace[session.workspaceHash] || [];
    const next = [cloneSession(session), ...existing.filter((item) => item.id !== session.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_SESSIONS_PER_WORKSPACE);
    store.sessionsByWorkspace[session.workspaceHash] = next;
    await this.saveStore(store);
  }

  async appendMessage(
    session: CutieSessionRecord,
    message: Omit<CutieChatMessage, "id" | "createdAt">
  ): Promise<CutieSessionRecord> {
    const next: CutieSessionRecord = {
      ...session,
      messages: [
        ...session.messages,
        {
          id: randomId("cutie_msg"),
          createdAt: nowIso(),
          ...message,
        },
      ],
      updatedAt: nowIso(),
    };
    if (message.role === "user" && session.messages.length === 0) {
      next.title = deriveTitle(message.content);
    }
    await this.saveSession(next);
    return next;
  }

  async replaceMessages(session: CutieSessionRecord, messages: CutieChatMessage[]): Promise<CutieSessionRecord> {
    const next: CutieSessionRecord = {
      ...session,
      messages,
      updatedAt: nowIso(),
    };
    await this.saveSession(next);
    return next;
  }

  async appendRun(session: CutieSessionRecord, run: CutieRunState): Promise<CutieSessionRecord> {
    const next: CutieSessionRecord = {
      ...session,
      runs: [...session.runs, run],
      updatedAt: nowIso(),
    };
    await this.saveSession(next);
    return next;
  }

  async updateRun(session: CutieSessionRecord, run: CutieRunState): Promise<CutieSessionRecord> {
    const next: CutieSessionRecord = {
      ...session,
      runs: [...session.runs.filter((item) => item.id !== run.id), run].sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt)
      ),
      updatedAt: nowIso(),
    };
    await this.saveSession(next);
    return next;
  }

  async attachSnapshot(session: CutieSessionRecord, snapshot: DesktopSnapshotRef): Promise<CutieSessionRecord> {
    const next: CutieSessionRecord = {
      ...session,
      snapshots: [snapshot, ...session.snapshots.filter((item) => item.snapshotId !== snapshot.snapshotId)].slice(0, 12),
      updatedAt: nowIso(),
    };
    await this.saveSession(next);
    return next;
  }

  getLatestRun(session: CutieSessionRecord): CutieRunState | null {
    return session.runs[session.runs.length - 1] || null;
  }
}

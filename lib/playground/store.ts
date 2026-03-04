import { db } from "@/lib/db";
import {
  playgroundActionLogs,
  playgroundAgentRuns,
  playgroundIndexChunks,
  playgroundIndexSyncState,
  playgroundMessages,
  playgroundReplayRuns,
  playgroundSessions,
  playgroundUserProfiles,
} from "@/lib/db/playground-schema";
import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";

type SessionRecord = {
  id: string;
  userId: string;
  title: string | null;
  mode: string;
  workspaceFingerprint: string | null;
  metadata: unknown;
  traceId: string | null;
  lastError: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type MessageRecord = {
  id: string;
  sessionId: string;
  role: string;
  kind: string;
  content: string;
  payload: unknown;
  tokenCount: number | null;
  latencyMs: number | null;
  createdAt: Date | null;
};

export type PlaygroundUserProfileRecord = {
  id: string;
  userId: string;
  preferredTone: string;
  autonomyMode: string;
  responseStyle: string;
  reasoningPreference: string;
  preferredModelAlias: string | null;
  sessionSummary: string | null;
  stablePreferences: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const memory = {
  sessions: new Map<string, SessionRecord[]>(),
  messages: new Map<string, MessageRecord[]>(),
  userProfiles: new Map<string, PlaygroundUserProfileRecord>(),
};

export async function listSessions(input: {
  userId: string;
  cursor?: string;
  limit?: number;
  mode?: string;
  search?: string;
}): Promise<{ data: SessionRecord[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const where = [
    eq(playgroundSessions.userId, input.userId),
    input.mode ? eq(playgroundSessions.mode, input.mode as any) : undefined,
    input.search ? ilike(playgroundSessions.title, `%${input.search}%`) : undefined,
    input.cursor ? lte(playgroundSessions.updatedAt, new Date(input.cursor)) : undefined,
  ].filter(Boolean) as any[];

  try {
    const rows = await db
      .select({
        id: playgroundSessions.id,
        userId: playgroundSessions.userId,
        title: playgroundSessions.title,
        mode: playgroundSessions.mode,
        workspaceFingerprint: playgroundSessions.workspaceFingerprint,
        metadata: playgroundSessions.metadata,
        traceId: playgroundSessions.traceId,
        lastError: playgroundSessions.lastError,
        createdAt: playgroundSessions.createdAt,
        updatedAt: playgroundSessions.updatedAt,
      })
      .from(playgroundSessions)
      .where(where.length > 1 ? and(...where) : where[0])
      .orderBy(desc(playgroundSessions.updatedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor = hasMore && data.length ? data[data.length - 1].updatedAt?.toISOString() ?? null : null;
    return { data, nextCursor };
  } catch {
    const data = memory.sessions.get(input.userId) ?? [];
    return { data: data.slice(0, limit), nextCursor: null };
  }
}

export async function createSession(input: {
  userId: string;
  title?: string;
  mode?: string;
  workspaceFingerprint?: string;
  metadata?: unknown;
  traceId?: string;
}): Promise<SessionRecord> {
  try {
    const [row] = await db
      .insert(playgroundSessions)
      .values({
        userId: input.userId,
        title: input.title ?? null,
        mode: (input.mode as any) ?? "auto",
        workspaceFingerprint: input.workspaceFingerprint ?? null,
        metadata: (input.metadata as any) ?? null,
        traceId: input.traceId ?? null,
      })
      .returning({
        id: playgroundSessions.id,
        userId: playgroundSessions.userId,
        title: playgroundSessions.title,
        mode: playgroundSessions.mode,
        workspaceFingerprint: playgroundSessions.workspaceFingerprint,
        metadata: playgroundSessions.metadata,
        traceId: playgroundSessions.traceId,
        lastError: playgroundSessions.lastError,
        createdAt: playgroundSessions.createdAt,
        updatedAt: playgroundSessions.updatedAt,
      });
    return row;
  } catch {
    const row: SessionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      title: input.title ?? null,
      mode: input.mode ?? "auto",
      workspaceFingerprint: input.workspaceFingerprint ?? null,
      metadata: input.metadata ?? null,
      traceId: input.traceId ?? null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const existing = memory.sessions.get(input.userId) ?? [];
    memory.sessions.set(input.userId, [row, ...existing]);
    return row;
  }
}

export async function listSessionMessages(input: {
  userId: string;
  sessionId: string;
  includeAgentEvents?: boolean;
  fromTimestamp?: string;
}) {
  const where = [
    eq(playgroundMessages.userId, input.userId),
    eq(playgroundMessages.sessionId, input.sessionId),
    input.includeAgentEvents ? undefined : sql`${playgroundMessages.role} != 'agent'`,
    input.fromTimestamp ? gte(playgroundMessages.createdAt, new Date(input.fromTimestamp)) : undefined,
  ].filter(Boolean) as any[];

  try {
    return await db
      .select({
        id: playgroundMessages.id,
        sessionId: playgroundMessages.sessionId,
        role: playgroundMessages.role,
        kind: playgroundMessages.kind,
        content: playgroundMessages.content,
        payload: playgroundMessages.payload,
        tokenCount: playgroundMessages.tokenCount,
        latencyMs: playgroundMessages.latencyMs,
        createdAt: playgroundMessages.createdAt,
      })
      .from(playgroundMessages)
      .where(where.length > 1 ? and(...where) : where[0])
      .orderBy(desc(playgroundMessages.createdAt))
      .limit(500);
  } catch {
    return (memory.messages.get(input.sessionId) ?? []).slice(-500).reverse();
  }
}

export async function appendSessionMessage(input: {
  userId: string;
  sessionId: string;
  role: "system" | "user" | "assistant" | "agent";
  kind?: string;
  content: string;
  payload?: unknown;
  tokenCount?: number;
  latencyMs?: number;
}) {
  try {
    const [row] = await db
      .insert(playgroundMessages)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        role: input.role,
        kind: input.kind ?? "message",
        content: input.content,
        payload: (input.payload as any) ?? null,
        tokenCount: input.tokenCount ?? null,
        latencyMs: input.latencyMs ?? null,
      })
      .returning({
        id: playgroundMessages.id,
        sessionId: playgroundMessages.sessionId,
        role: playgroundMessages.role,
        kind: playgroundMessages.kind,
        content: playgroundMessages.content,
        payload: playgroundMessages.payload,
        tokenCount: playgroundMessages.tokenCount,
        latencyMs: playgroundMessages.latencyMs,
        createdAt: playgroundMessages.createdAt,
      });
    return row;
  } catch {
    const row: MessageRecord = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      kind: input.kind ?? "message",
      content: input.content,
      payload: input.payload ?? null,
      tokenCount: input.tokenCount ?? null,
      latencyMs: input.latencyMs ?? null,
      createdAt: new Date(),
    };
    const existing = memory.messages.get(input.sessionId) ?? [];
    existing.push(row);
    memory.messages.set(input.sessionId, existing);
    return row;
  }
}

export async function getUserPlaygroundProfile(input: { userId: string }): Promise<PlaygroundUserProfileRecord | null> {
  try {
    const rows = await db
      .select({
        id: playgroundUserProfiles.id,
        userId: playgroundUserProfiles.userId,
        preferredTone: playgroundUserProfiles.preferredTone,
        autonomyMode: playgroundUserProfiles.autonomyMode,
        responseStyle: playgroundUserProfiles.responseStyle,
        reasoningPreference: playgroundUserProfiles.reasoningPreference,
        preferredModelAlias: playgroundUserProfiles.preferredModelAlias,
        sessionSummary: playgroundUserProfiles.sessionSummary,
        stablePreferences: playgroundUserProfiles.stablePreferences,
        createdAt: playgroundUserProfiles.createdAt,
        updatedAt: playgroundUserProfiles.updatedAt,
      })
      .from(playgroundUserProfiles)
      .where(eq(playgroundUserProfiles.userId, input.userId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return memory.userProfiles.get(input.userId) ?? null;
  }
}

export async function upsertUserPlaygroundProfile(input: {
  userId: string;
  preferredTone?: string | null;
  autonomyMode?: string | null;
  responseStyle?: string | null;
  reasoningPreference?: string | null;
  preferredModelAlias?: string | null;
  sessionSummary?: string | null;
  stablePreferences?: Record<string, unknown> | null;
}): Promise<PlaygroundUserProfileRecord> {
  try {
    const [row] = await db
      .insert(playgroundUserProfiles)
      .values({
        userId: input.userId,
        preferredTone: input.preferredTone ?? "warm_teammate",
        autonomyMode: input.autonomyMode ?? "full_auto",
        responseStyle: input.responseStyle ?? "balanced",
        reasoningPreference: input.reasoningPreference ?? "medium",
        preferredModelAlias: input.preferredModelAlias ?? null,
        sessionSummary: input.sessionSummary ?? null,
        stablePreferences: (input.stablePreferences as any) ?? null,
      })
      .onConflictDoUpdate({
        target: [playgroundUserProfiles.userId],
        set: {
          preferredTone: input.preferredTone ?? sql`COALESCE(${playgroundUserProfiles.preferredTone}, 'warm_teammate')`,
          autonomyMode: input.autonomyMode ?? sql`COALESCE(${playgroundUserProfiles.autonomyMode}, 'full_auto')`,
          responseStyle: input.responseStyle ?? sql`COALESCE(${playgroundUserProfiles.responseStyle}, 'balanced')`,
          reasoningPreference: input.reasoningPreference ?? sql`COALESCE(${playgroundUserProfiles.reasoningPreference}, 'medium')`,
          preferredModelAlias:
            input.preferredModelAlias !== undefined
              ? input.preferredModelAlias
              : playgroundUserProfiles.preferredModelAlias,
          sessionSummary:
            input.sessionSummary !== undefined
              ? input.sessionSummary
              : playgroundUserProfiles.sessionSummary,
          stablePreferences:
            input.stablePreferences !== undefined
              ? (input.stablePreferences as any)
              : playgroundUserProfiles.stablePreferences,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: playgroundUserProfiles.id,
        userId: playgroundUserProfiles.userId,
        preferredTone: playgroundUserProfiles.preferredTone,
        autonomyMode: playgroundUserProfiles.autonomyMode,
        responseStyle: playgroundUserProfiles.responseStyle,
        reasoningPreference: playgroundUserProfiles.reasoningPreference,
        preferredModelAlias: playgroundUserProfiles.preferredModelAlias,
        sessionSummary: playgroundUserProfiles.sessionSummary,
        stablePreferences: playgroundUserProfiles.stablePreferences,
        createdAt: playgroundUserProfiles.createdAt,
        updatedAt: playgroundUserProfiles.updatedAt,
      });
    memory.userProfiles.set(input.userId, row);
    return row;
  } catch {
    const existing = memory.userProfiles.get(input.userId);
    const row: PlaygroundUserProfileRecord = {
      id: existing?.id || crypto.randomUUID(),
      userId: input.userId,
      preferredTone: input.preferredTone ?? existing?.preferredTone ?? "warm_teammate",
      autonomyMode: input.autonomyMode ?? existing?.autonomyMode ?? "full_auto",
      responseStyle: input.responseStyle ?? existing?.responseStyle ?? "balanced",
      reasoningPreference: input.reasoningPreference ?? existing?.reasoningPreference ?? "medium",
      preferredModelAlias:
        input.preferredModelAlias !== undefined
          ? input.preferredModelAlias
          : existing?.preferredModelAlias ?? null,
      sessionSummary:
        input.sessionSummary !== undefined
          ? input.sessionSummary
          : existing?.sessionSummary ?? null,
      stablePreferences:
        input.stablePreferences !== undefined
          ? input.stablePreferences
          : existing?.stablePreferences ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    memory.userProfiles.set(input.userId, row);
    return row;
  }
}

export async function upsertIndexChunks(input: {
  userId: string;
  projectKey: string;
  chunks: Array<{
    pathHash: string;
    chunkHash: string;
    pathDisplay?: string;
    content: string;
    embedding?: number[];
    metadata?: unknown;
  }>;
  cursor?: string;
  stats?: Record<string, unknown>;
}) {
  try {
    for (const c of input.chunks) {
      await db
        .insert(playgroundIndexChunks)
        .values({
          userId: input.userId,
          projectKey: input.projectKey,
          pathHash: c.pathHash,
          chunkHash: c.chunkHash,
          pathDisplay: c.pathDisplay ?? null,
          content: c.content,
          embedding: c.embedding ?? null,
          tokenEstimate: Math.ceil(c.content.length / 4),
          metadata: (c.metadata as any) ?? null,
        })
        .onConflictDoUpdate({
          target: [
            playgroundIndexChunks.userId,
            playgroundIndexChunks.projectKey,
            playgroundIndexChunks.pathHash,
            playgroundIndexChunks.chunkHash,
          ],
          set: {
            pathDisplay: c.pathDisplay ?? null,
            content: c.content,
            embedding: c.embedding ?? null,
            tokenEstimate: Math.ceil(c.content.length / 4),
            metadata: (c.metadata as any) ?? null,
            updatedAt: new Date(),
          },
        });
    }

    await db
      .insert(playgroundIndexSyncState)
      .values({
        userId: input.userId,
        projectKey: input.projectKey,
        lastCursor: input.cursor ?? null,
        stats: (input.stats as any) ?? null,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [playgroundIndexSyncState.userId, playgroundIndexSyncState.projectKey],
        set: {
          lastCursor: input.cursor ?? null,
          stats: (input.stats as any) ?? null,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        },
      });
  } catch {
    // Best-effort; keep request successful for local-first sync.
  }
}

export async function queryIndex(input: {
  userId: string;
  projectKey: string;
  query: string;
  limit: number;
}) {
  const terms = input.query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 12);

  try {
    const rows = await db
      .select({
        id: playgroundIndexChunks.id,
        pathHash: playgroundIndexChunks.pathHash,
        pathDisplay: playgroundIndexChunks.pathDisplay,
        chunkHash: playgroundIndexChunks.chunkHash,
        content: playgroundIndexChunks.content,
        metadata: playgroundIndexChunks.metadata,
        updatedAt: playgroundIndexChunks.updatedAt,
      })
      .from(playgroundIndexChunks)
      .where(
        and(
          eq(playgroundIndexChunks.userId, input.userId),
          eq(playgroundIndexChunks.projectKey, input.projectKey),
          ilike(playgroundIndexChunks.content, `%${terms[0] ?? input.query}%`)
        )
      )
      .orderBy(desc(playgroundIndexChunks.updatedAt))
      .limit(Math.max(1, Math.min(input.limit * 4, 120)));

    return rows
      .map((row) => {
        const content = row.content.toLowerCase();
        const matchedTerms = terms.filter((term) => content.includes(term));
        const score = matchedTerms.length / Math.max(1, terms.length);
        return {
          ...row,
          score,
          source: "cloud" as const,
          matchedTerms,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(input.limit, 50)));
  } catch {
    return [];
  }
}

export async function logAgentRun(input: {
  userId: string;
  sessionId: string;
  role: "planner" | "implementer" | "reviewer" | "single";
  status: "queued" | "running" | "completed" | "failed";
  payload: Record<string, unknown>;
  confidence?: number;
  riskLevel?: "low" | "medium" | "high";
}) {
  try {
    const [row] = await db
      .insert(playgroundAgentRuns)
      .values({
        userId: input.userId,
        sessionId: input.sessionId,
        role: input.role,
        status: input.status,
        confidence: input.confidence ?? null,
        riskLevel: input.riskLevel ?? null,
        input: input.payload as any,
        output: null,
      })
      .returning({ id: playgroundAgentRuns.id });
    return row.id;
  } catch {
    return crypto.randomUUID();
  }
}

export async function logAction(input: {
  userId: string;
  sessionId?: string;
  actionType: "edit" | "command" | "index" | "sync" | "rollback";
  status: "approved" | "blocked" | "executed" | "failed";
  payload: Record<string, unknown>;
  reason?: string;
  durationMs?: number;
  exitCode?: number;
  stdoutExcerpt?: string;
  stderrExcerpt?: string;
}) {
  try {
    await db.insert(playgroundActionLogs).values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      actionType: input.actionType as any,
      status: input.status,
      payload: input.payload as any,
      reason: input.reason ?? null,
      durationMs: input.durationMs ?? null,
      exitCode: input.exitCode ?? null,
      stdoutExcerpt: input.stdoutExcerpt ?? null,
      stderrExcerpt: input.stderrExcerpt ?? null,
    });
  } catch {
    // best effort
  }
}

export async function createReplayRun(input: {
  userId: string;
  sourceSessionId: string;
  workspaceFingerprint: string;
  driftSummary: string;
  status: "queued" | "running" | "completed" | "failed";
  metadata?: Record<string, unknown>;
}) {
  try {
    const [row] = await db
      .insert(playgroundReplayRuns)
      .values({
        userId: input.userId,
        sourceSessionId: input.sourceSessionId,
        workspaceFingerprint: input.workspaceFingerprint,
        driftSummary: input.driftSummary,
        status: input.status,
        metadata: input.metadata ?? null,
      })
      .returning({
        id: playgroundReplayRuns.id,
      });
    return row.id;
  } catch {
    return crypto.randomUUID();
  }
}

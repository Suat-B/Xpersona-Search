import { db } from "@/lib/db";
import {
  playgroundActionLogs,
  playgroundAgentRuns,
  playgroundIndexChunks,
  playgroundIndexSyncState,
  playgroundMessages,
  playgroundProviderConnections,
  playgroundReplayRuns,
  playgroundSessions,
  playgroundUserProfiles,
} from "@/lib/db/playground-schema";
import { rankPlaygroundIndexRows, type PlaygroundIndexRetrievalHints } from "@/lib/playground/index-ranking";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

/** Python gateway uses 16-byte hex; Node gateway (`server.ts`) uses `randomUUID()` dashed UUIDs. */
function isLikelyOpenHandsGatewayRunId(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

function isUuidShape(value: string): boolean {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** Value could be persisted `output.orchestratorRunId` (gateway) vs playground row `id` (also UUID). */
function couldBeOrchestratorRunKey(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && (isLikelyOpenHandsGatewayRunId(v) || isUuidShape(v));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mitigate read-replica / transaction visibility lag right after assist. */
async function getAgentRunByIdWithLagRetry(input: { userId: string; runId: string }): Promise<AgentRunRecord | null> {
  const delays = [0, 120, 240, 360] as const;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleepMs(delays[i]);
    const row = await getAgentRunById(input);
    if (row) return row;
  }
  return null;
}

function upsertMemoryAgentRunCache(row: AgentRunRecord): void {
  const existing = memory.runs.get(row.userId) ?? [];
  const filtered = existing.filter((r) => r.id !== row.id);
  memory.runs.set(row.userId, [row, ...filtered]);
}

function findAgentRunByOrchestratorRunIdFromMemory(
  userId: string,
  orchestratorRunId: string
): AgentRunRecord | null {
  const needle = orchestratorRunId.trim().toLowerCase();
  const existing = memory.runs.get(userId) ?? [];
  return (
    existing.find((row) => {
      const o = row.output;
      if (!o || typeof o !== "object" || Array.isArray(o)) return false;
      const rid = (o as Record<string, unknown>).orchestratorRunId;
      return typeof rid === "string" && rid.trim().toLowerCase() === needle;
    }) ?? null
  );
}

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

export type PlaygroundProviderConnectionRecord = {
  id: string;
  userId: string;
  provider: string;
  alias: string;
  displayName: string | null;
  authMode: string;
  secretEncrypted: string;
  baseUrl: string | null;
  defaultModel: string | null;
  status: string;
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  metadata: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type AgentRunRecord = {
  id: string;
  sessionId: string;
  userId: string;
  role: "planner" | "implementer" | "reviewer" | "single";
  status: "queued" | "running" | "completed" | "failed";
  confidence: number | null;
  riskLevel: string | null;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const memory = {
  sessions: new Map<string, SessionRecord[]>(),
  messages: new Map<string, MessageRecord[]>(),
  userProfiles: new Map<string, PlaygroundUserProfileRecord>(),
  providerConnections: new Map<string, PlaygroundProviderConnectionRecord[]>(),
  runs: new Map<string, AgentRunRecord[]>(),
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

    // If DB read succeeds but returns nothing while in-memory fallback has rows
    // (e.g., DB write path failed earlier), prefer memory so recents still work.
    if (rows.length === 0) {
      const memoryRows = memory.sessions.get(input.userId) ?? [];
      if (memoryRows.length > 0) {
        return { data: memoryRows.slice(0, limit), nextCursor: null };
      }
    }

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

export async function getSessionById(input: {
  userId: string;
  sessionId: string;
}): Promise<SessionRecord | null> {
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
      .where(and(eq(playgroundSessions.userId, input.userId), eq(playgroundSessions.id, input.sessionId)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    const data = memory.sessions.get(input.userId) ?? [];
    return data.find((row) => row.id === input.sessionId) ?? null;
  }
}

export async function listSessionMessages(input: {
  userId: string;
  sessionId: string;
  includeAgentEvents?: boolean;
  fromTimestamp?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? 500, 500));
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
      .limit(limit);
  } catch {
    return (memory.messages.get(input.sessionId) ?? []).slice(-limit).reverse();
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

export async function listPlaygroundProviderConnections(input: {
  userId: string;
}): Promise<PlaygroundProviderConnectionRecord[]> {
  try {
    return await db
      .select({
        id: playgroundProviderConnections.id,
        userId: playgroundProviderConnections.userId,
        provider: playgroundProviderConnections.provider,
        alias: playgroundProviderConnections.alias,
        displayName: playgroundProviderConnections.displayName,
        authMode: playgroundProviderConnections.authMode,
        secretEncrypted: playgroundProviderConnections.secretEncrypted,
        baseUrl: playgroundProviderConnections.baseUrl,
        defaultModel: playgroundProviderConnections.defaultModel,
        status: playgroundProviderConnections.status,
        lastValidatedAt: playgroundProviderConnections.lastValidatedAt,
        lastValidationError: playgroundProviderConnections.lastValidationError,
        metadata: playgroundProviderConnections.metadata,
        createdAt: playgroundProviderConnections.createdAt,
        updatedAt: playgroundProviderConnections.updatedAt,
      })
      .from(playgroundProviderConnections)
      .where(eq(playgroundProviderConnections.userId, input.userId))
      .orderBy(desc(playgroundProviderConnections.updatedAt));
  } catch {
    return memory.providerConnections.get(input.userId) ?? [];
  }
}

export async function getPlaygroundProviderConnectionByAlias(input: {
  userId: string;
  alias: string;
}): Promise<PlaygroundProviderConnectionRecord | null> {
  const alias = input.alias.trim();
  if (!alias) return null;
  try {
    const rows = await db
      .select({
        id: playgroundProviderConnections.id,
        userId: playgroundProviderConnections.userId,
        provider: playgroundProviderConnections.provider,
        alias: playgroundProviderConnections.alias,
        displayName: playgroundProviderConnections.displayName,
        authMode: playgroundProviderConnections.authMode,
        secretEncrypted: playgroundProviderConnections.secretEncrypted,
        baseUrl: playgroundProviderConnections.baseUrl,
        defaultModel: playgroundProviderConnections.defaultModel,
        status: playgroundProviderConnections.status,
        lastValidatedAt: playgroundProviderConnections.lastValidatedAt,
        lastValidationError: playgroundProviderConnections.lastValidationError,
        metadata: playgroundProviderConnections.metadata,
        createdAt: playgroundProviderConnections.createdAt,
        updatedAt: playgroundProviderConnections.updatedAt,
      })
      .from(playgroundProviderConnections)
      .where(and(eq(playgroundProviderConnections.userId, input.userId), eq(playgroundProviderConnections.alias, alias)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    const rows = memory.providerConnections.get(input.userId) ?? [];
    return rows.find((row) => row.alias === alias) ?? null;
  }
}

export async function upsertPlaygroundProviderConnection(input: {
  userId: string;
  provider: string;
  alias: string;
  displayName?: string | null;
  authMode: string;
  secretEncrypted: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
  status?: string;
  lastValidatedAt?: Date | null;
  lastValidationError?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<PlaygroundProviderConnectionRecord> {
  try {
    const [row] = await db
      .insert(playgroundProviderConnections)
      .values({
        userId: input.userId,
        provider: input.provider as any,
        alias: input.alias,
        displayName: input.displayName ?? null,
        authMode: input.authMode as any,
        secretEncrypted: input.secretEncrypted,
        baseUrl: input.baseUrl ?? null,
        defaultModel: input.defaultModel ?? null,
        status: (input.status || "active") as any,
        lastValidatedAt: input.lastValidatedAt ?? null,
        lastValidationError: input.lastValidationError ?? null,
        metadata: (input.metadata as any) ?? null,
      })
      .onConflictDoUpdate({
        target: [playgroundProviderConnections.userId, playgroundProviderConnections.provider],
        set: {
          alias: input.alias,
          displayName: input.displayName ?? null,
          authMode: input.authMode as any,
          secretEncrypted: input.secretEncrypted,
          baseUrl: input.baseUrl ?? null,
          defaultModel: input.defaultModel ?? null,
          status: (input.status || "active") as any,
          lastValidatedAt: input.lastValidatedAt ?? null,
          lastValidationError: input.lastValidationError ?? null,
          metadata: (input.metadata as any) ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: playgroundProviderConnections.id,
        userId: playgroundProviderConnections.userId,
        provider: playgroundProviderConnections.provider,
        alias: playgroundProviderConnections.alias,
        displayName: playgroundProviderConnections.displayName,
        authMode: playgroundProviderConnections.authMode,
        secretEncrypted: playgroundProviderConnections.secretEncrypted,
        baseUrl: playgroundProviderConnections.baseUrl,
        defaultModel: playgroundProviderConnections.defaultModel,
        status: playgroundProviderConnections.status,
        lastValidatedAt: playgroundProviderConnections.lastValidatedAt,
        lastValidationError: playgroundProviderConnections.lastValidationError,
        metadata: playgroundProviderConnections.metadata,
        createdAt: playgroundProviderConnections.createdAt,
        updatedAt: playgroundProviderConnections.updatedAt,
      });
    const existing = (memory.providerConnections.get(input.userId) ?? []).filter((item) => item.id !== row.id);
    memory.providerConnections.set(input.userId, [row, ...existing]);
    return row;
  } catch {
    const existing = memory.providerConnections.get(input.userId) ?? [];
    const prev = existing.find((row) => row.provider === input.provider);
    const row: PlaygroundProviderConnectionRecord = {
      id: prev?.id || crypto.randomUUID(),
      userId: input.userId,
      provider: input.provider,
      alias: input.alias,
      displayName: input.displayName ?? null,
      authMode: input.authMode,
      secretEncrypted: input.secretEncrypted,
      baseUrl: input.baseUrl ?? null,
      defaultModel: input.defaultModel ?? null,
      status: input.status || "active",
      lastValidatedAt: input.lastValidatedAt ?? null,
      lastValidationError: input.lastValidationError ?? null,
      metadata: input.metadata ?? null,
      createdAt: prev?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    memory.providerConnections.set(
      input.userId,
      [row, ...existing.filter((item) => item.id !== row.id && item.provider !== input.provider)]
    );
    return row;
  }
}

export async function deletePlaygroundProviderConnection(input: {
  userId: string;
  connectionId: string;
}): Promise<boolean> {
  try {
    const rows = await db
      .delete(playgroundProviderConnections)
      .where(and(eq(playgroundProviderConnections.userId, input.userId), eq(playgroundProviderConnections.id, input.connectionId)))
      .returning({ id: playgroundProviderConnections.id });
    if (rows.length) {
      const existing = memory.providerConnections.get(input.userId) ?? [];
      memory.providerConnections.set(
        input.userId,
        existing.filter((item) => item.id !== input.connectionId)
      );
    }
    return rows.length > 0;
  } catch {
    const existing = memory.providerConnections.get(input.userId) ?? [];
    const next = existing.filter((item) => item.id !== input.connectionId);
    memory.providerConnections.set(input.userId, next);
    return next.length !== existing.length;
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
  retrievalHints?: PlaygroundIndexRetrievalHints;
}) {
  const terms = Array.from(
    new Set(
      [
        ...String(input.query || "")
          .toLowerCase()
          .split(/\s+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2),
        ...((input.retrievalHints?.candidateSymbols || []).map((term) => String(term || "").trim().toLowerCase())),
        ...((input.retrievalHints?.candidateErrors || []).map((term) => String(term || "").trim().toLowerCase())),
      ].filter((term) => term.length >= 2)
    )
  ).slice(0, 12);

  try {
    const lexicalWhere = terms
      .slice(0, 8)
      .flatMap((term) => [
        ilike(playgroundIndexChunks.content, `%${term}%`),
        ilike(playgroundIndexChunks.pathDisplay, `%${term}%`),
      ]);
    const where = [
      eq(playgroundIndexChunks.userId, input.userId),
      eq(playgroundIndexChunks.projectKey, input.projectKey),
      lexicalWhere.length > 0 ? or(...lexicalWhere) : undefined,
    ].filter(Boolean) as any[];
    const rows = await db
      .select({
        id: playgroundIndexChunks.id,
        pathHash: playgroundIndexChunks.pathHash,
        pathDisplay: playgroundIndexChunks.pathDisplay,
        chunkHash: playgroundIndexChunks.chunkHash,
        content: playgroundIndexChunks.content,
        metadata: playgroundIndexChunks.metadata,
        embedding: playgroundIndexChunks.embedding,
        updatedAt: playgroundIndexChunks.updatedAt,
      })
      .from(playgroundIndexChunks)
      .where(where.length > 1 ? and(...where) : where[0])
      .orderBy(desc(playgroundIndexChunks.updatedAt))
      .limit(Math.max(80, Math.min(input.limit * 20, 240)));

    return rankPlaygroundIndexRows({
      rows,
      query: input.query,
      limit: Math.max(1, Math.min(input.limit, 50)),
      hints: input.retrievalHints,
    });
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
  const row = await createAgentRun({
    userId: input.userId,
    sessionId: input.sessionId,
    role: input.role,
    status: input.status,
    input: input.payload,
    confidence: input.confidence,
    riskLevel: input.riskLevel,
  });
  return row.id;
}

export async function createAgentRun(input: {
  userId: string;
  sessionId: string;
  role: "planner" | "implementer" | "reviewer" | "single";
  status: "queued" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  confidence?: number;
  riskLevel?: "low" | "medium" | "high";
}): Promise<AgentRunRecord> {
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
        input: input.input as any,
        output: null,
      })
      .returning({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      });
    upsertMemoryAgentRunCache(row);
    return row;
  } catch (err) {
    // In serverless / multi-instance deployments, a memory-only row is invisible to the next request → RUN_NOT_FOUND on continue.
    if (String(process.env.DATABASE_URL || "").trim()) {
      throw err instanceof Error ? err : new Error(String(err));
    }
    const row: AgentRunRecord = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      role: input.role,
      status: input.status,
      confidence: input.confidence ?? null,
      riskLevel: input.riskLevel ?? null,
      input: input.input,
      output: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const existing = memory.runs.get(input.userId) ?? [];
    memory.runs.set(input.userId, [row, ...existing]);
    return row;
  }
}

export async function updateAgentRun(input: {
  userId: string;
  runId: string;
  status?: "queued" | "running" | "completed" | "failed";
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  confidence?: number | null;
  riskLevel?: "low" | "medium" | "high" | null;
}): Promise<AgentRunRecord | null> {
  try {
    const [row] = await db
      .update(playgroundAgentRuns)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.output !== undefined ? { output: input.output as any } : {}),
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage ?? null } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(playgroundAgentRuns.userId, input.userId), eq(playgroundAgentRuns.id, input.runId)))
      .returning({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      });
    return row ?? null;
  } catch {
    const existing = memory.runs.get(input.userId) ?? [];
    const index = existing.findIndex((row) => row.id === input.runId);
    if (index < 0) return null;
    const row: AgentRunRecord = {
      ...existing[index],
      ...(input.status ? { status: input.status } : {}),
      ...(input.output !== undefined ? { output: input.output } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage ?? null } : {}),
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
      ...(input.riskLevel !== undefined ? { riskLevel: input.riskLevel } : {}),
      updatedAt: new Date(),
    };
    existing[index] = row;
    memory.runs.set(input.userId, existing);
    return row;
  }
}

export async function getAgentRunById(input: { userId: string; runId: string }): Promise<AgentRunRecord | null> {
  const fromMemory = () => {
    const existing = memory.runs.get(input.userId) ?? [];
    return existing.find((row) => row.id === input.runId) ?? null;
  };
  try {
    const rows = await db
      .select({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      })
      .from(playgroundAgentRuns)
      .where(and(eq(playgroundAgentRuns.userId, input.userId), eq(playgroundAgentRuns.id, input.runId)))
      .limit(1);
    const row = rows[0] ?? null;
    if (row) {
      upsertMemoryAgentRunCache(row);
      return row;
    }
    return fromMemory();
  } catch {
    return fromMemory();
  }
}

export async function findAgentRunByOrchestratorRunId(input: {
  userId: string;
  orchestratorRunId: string;
}): Promise<AgentRunRecord | null> {
  const orchestratorRunId = String(input.orchestratorRunId || "").trim();
  if (!orchestratorRunId) return null;
  const orchestratorKey = orchestratorRunId.toLowerCase();

  const fromMemory = () => findAgentRunByOrchestratorRunIdFromMemory(input.userId, orchestratorRunId);

  try {
    const rows = await db
      .select({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      })
      .from(playgroundAgentRuns)
      .where(
        and(
          eq(playgroundAgentRuns.userId, input.userId),
          sql`${playgroundAgentRuns.output} IS NOT NULL`,
          sql`LOWER((${playgroundAgentRuns.output}->>'orchestratorRunId')) = ${orchestratorKey}`
        )
      )
      .orderBy(desc(playgroundAgentRuns.updatedAt))
      .limit(1);
    const row = rows[0] ?? null;
    if (row) {
      upsertMemoryAgentRunCache(row);
      return row;
    }
    return fromMemory();
  } catch {
    return fromMemory();
  }
}

/**
 * Resolve a playground agent run by primary id, or by OpenHands gateway run id stored in output.orchestratorRunId
 * (32-char hex from the Python gateway, or dashed UUID from the Node gateway).
 */
export async function resolveAgentRunRecord(input: { userId: string; runId: string }): Promise<AgentRunRecord | null> {
  const runId = String(input.runId || "").trim();
  if (!runId) return null;
  const byId = await getAgentRunByIdWithLagRetry({ userId: input.userId, runId });
  if (byId) return byId;
  if (!couldBeOrchestratorRunKey(runId)) return null;
  const orchDelays = [0, 120, 240] as const;
  for (let i = 0; i < orchDelays.length; i++) {
    if (orchDelays[i] > 0) await sleepMs(orchDelays[i]);
    const byOrch = await findAgentRunByOrchestratorRunId({ userId: input.userId, orchestratorRunId: runId });
    if (byOrch) return byOrch;
  }
  return null;
}

function hasPendingToolOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const p = (output as Record<string, unknown>).pendingToolCall;
  return p !== null && p !== undefined && typeof p === "object" && !Array.isArray(p);
}

/** JS-side pending detection for continue fallback (avoids missing rows when SQL jsonb shape differs slightly). */
function outputShowsPendingClientTool(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const p = (output as Record<string, unknown>).pendingToolCall;
  if (p === null || p === undefined) return false;
  if (typeof p !== "object" || Array.isArray(p)) return false;
  const toolCall = (p as Record<string, unknown>).toolCall;
  return toolCall !== null && toolCall !== undefined && typeof toolCall === "object" && !Array.isArray(toolCall);
}

function orchestratorRunIdFromOutput(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const v = (output as Record<string, unknown>).orchestratorRunId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function listResumableRunsFromMemory(userId: string, sessionId: string): AgentRunRecord[] {
  return (memory.runs.get(userId) ?? [])
    .filter(
      (row) =>
        row.sessionId === sessionId &&
        row.status === "running" &&
        hasPendingToolOutput(row.output)
    )
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

function pickBestResumableRun(candidates: AgentRunRecord[], pathRunIdHint: string): AgentRunRecord | null {
  if (!candidates.length) return null;
  const hint = pathRunIdHint.trim();
  if (!hint) return candidates[0];
  const h = hint.toLowerCase();
  for (const row of candidates) {
    if (row.id.toLowerCase() === h) return row;
    const orch = orchestratorRunIdFromOutput(row.output);
    if (orch && orch.toLowerCase() === h) return row;
  }
  return candidates[0];
}

/**
 * Running agent runs for this session whose persisted output still has a pending client tool call.
 */
export async function findResumableAgentRunsForSession(input: {
  userId: string;
  sessionId: string;
  limit?: number;
}): Promise<AgentRunRecord[]> {
  const sessionId = String(input.sessionId || "").trim();
  if (!sessionId) return [];
  const limit = Math.min(12, Math.max(1, input.limit ?? 8));

  const fromMemory = () => listResumableRunsFromMemory(input.userId, sessionId).slice(0, limit);

  try {
    const rows = await db
      .select({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      })
      .from(playgroundAgentRuns)
      .where(
        and(
          eq(playgroundAgentRuns.userId, input.userId),
          eq(playgroundAgentRuns.sessionId, sessionId),
          eq(playgroundAgentRuns.status, "running"),
          sql`${playgroundAgentRuns.output} IS NOT NULL`,
          sql`(
            jsonb_typeof(${playgroundAgentRuns.output}->'pendingToolCall') = 'object'
            OR (${playgroundAgentRuns.output} #> '{pendingToolCall,toolCall}') IS NOT NULL
          )`
        )
      )
      .orderBy(desc(playgroundAgentRuns.updatedAt))
      .limit(limit);
    if (rows.length) {
      for (const row of rows) upsertMemoryAgentRunCache(row);
      return rows;
    }
    return fromMemory();
  } catch {
    return fromMemory();
  }
}

/**
 * Running rows for session with non-null output; pending tool is detected in JS (backup when strict SQL misses).
 */
async function findResumableAgentRunsForSessionRelaxed(input: {
  userId: string;
  sessionId: string;
  limit?: number;
}): Promise<AgentRunRecord[]> {
  const sessionId = String(input.sessionId || "").trim();
  if (!sessionId) return [];
  const fetchLimit = Math.min(48, Math.max(8, (input.limit ?? 12) * 3));

  try {
    const rows = await db
      .select({
        id: playgroundAgentRuns.id,
        sessionId: playgroundAgentRuns.sessionId,
        userId: playgroundAgentRuns.userId,
        role: playgroundAgentRuns.role,
        status: playgroundAgentRuns.status,
        confidence: playgroundAgentRuns.confidence,
        riskLevel: playgroundAgentRuns.riskLevel,
        input: playgroundAgentRuns.input,
        output: playgroundAgentRuns.output,
        errorMessage: playgroundAgentRuns.errorMessage,
        createdAt: playgroundAgentRuns.createdAt,
        updatedAt: playgroundAgentRuns.updatedAt,
      })
      .from(playgroundAgentRuns)
      .where(
        and(
          eq(playgroundAgentRuns.userId, input.userId),
          eq(playgroundAgentRuns.sessionId, sessionId),
          eq(playgroundAgentRuns.status, "running"),
          sql`${playgroundAgentRuns.output} IS NOT NULL`
        )
      )
      .orderBy(desc(playgroundAgentRuns.updatedAt))
      .limit(fetchLimit);

    const filtered = rows.filter((row) => outputShowsPendingClientTool(row.output));
    const limit = Math.min(12, Math.max(1, input.limit ?? 8));
    const slice = filtered.slice(0, limit);
    for (const row of slice) upsertMemoryAgentRunCache(row);
    return slice;
  } catch {
    return [];
  }
}

/**
 * Resolve run for POST .../runs/:runId/continue: primary id, gateway id, then latest resumable run in session.
 */
export async function resolveAgentRunForContinue(input: {
  userId: string;
  runIdFromPath: string;
  sessionId?: string | null;
}): Promise<AgentRunRecord | null> {
  const path = String(input.runIdFromPath || "").trim();
  const direct = await resolveAgentRunRecord({ userId: input.userId, runId: path });
  if (direct) return direct;
  const sid = String(input.sessionId || "").trim();
  if (!sid) return null;
  const sessionDelays = [0, 200, 450, 700] as const;
  for (let i = 0; i < sessionDelays.length; i++) {
    if (sessionDelays[i] > 0) await sleepMs(sessionDelays[i]);
    const candidates = await findResumableAgentRunsForSession({
      userId: input.userId,
      sessionId: sid,
      limit: 8,
    });
    const picked = pickBestResumableRun(candidates, path);
    if (picked) return picked;
    const relaxed = await findResumableAgentRunsForSessionRelaxed({
      userId: input.userId,
      sessionId: sid,
      limit: 8,
    });
    const relaxedPick = pickBestResumableRun(relaxed, path);
    if (relaxedPick) return relaxedPick;
  }
  return null;
}

export async function logAction(input: {
  userId: string;
  sessionId?: string;
  actionType:
    | "edit"
    | "command"
    | "mkdir"
    | "write_file"
    | "index"
    | "sync"
    | "rollback"
    | "desktop_open_app"
    | "desktop_open_url"
    | "desktop_focus_window"
    | "desktop_click"
    | "desktop_type"
    | "desktop_keypress"
    | "desktop_scroll"
    | "desktop_wait";
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

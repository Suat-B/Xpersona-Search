import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type BinaryProviderFailureReason =
  | "provider_credits_exhausted"
  | "router_blocked"
  | "tool_schema_incompatible"
  | "transient_api_failure"
  | "unknown_provider_failure";

export type BinaryModelCandidate = {
  alias?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
};

export type BinaryAgentProbeTurn = {
  id: string;
  userMessage: string;
  assistantMessage?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  error?: string;
  runId?: string;
  modelCandidate?: BinaryModelCandidate | null;
  fallbackAttempt?: number;
  failureReason?: BinaryProviderFailureReason | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
};

export type BinaryAgentProbeSession = {
  id: string;
  status: "active" | "paused" | "failed";
  createdAt: string;
  updatedAt: string;
  title: string;
  model?: string;
  workspaceRoot?: string;
  gatewayRunId?: string;
  conversationId?: string | null;
  persistenceDir?: string | null;
  currentModelCandidate?: BinaryModelCandidate | null;
  lastFailureReason?: BinaryProviderFailureReason | null;
  fallbackAvailable: boolean;
  lastFallbackRecovered: boolean;
  turnCount: number;
  turns: BinaryAgentProbeTurn[];
  events: BinaryAgentProbeEvent[];
};

export type BinaryAgentProbeEvent = {
  id: string;
  seq: number;
  capturedAt: string;
  event: Record<string, unknown>;
};

type StoredState = {
  sessions: BinaryAgentProbeSession[];
};

type ProbeExecutionResult = {
  runId: string;
  final: string;
  logs: string[];
  modelCandidate?: BinaryModelCandidate | null;
  fallbackAttempt?: number;
  failureReason?: string | null;
  persistenceDir?: string | null;
  conversationId?: string | null;
  fallbackTrail?: Array<Record<string, unknown>>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeFailureReason(value: string | null | undefined): BinaryProviderFailureReason | null {
  return value === "provider_credits_exhausted" ||
    value === "router_blocked" ||
    value === "tool_schema_incompatible" ||
    value === "transient_api_failure" ||
    value === "unknown_provider_failure"
    ? value
    : null;
}

export class AgentProbeManager {
  private state: StoredState = { sessions: [] };

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed && Array.isArray(parsed.sessions)) {
        this.state = parsed;
      }
    } catch {
      this.state = { sessions: [] };
    }
  }

  async createSession(input: { title?: string; model?: string; workspaceRoot?: string }): Promise<BinaryAgentProbeSession> {
    const createdAt = nowIso();
    const session: BinaryAgentProbeSession = {
      id: randomUUID(),
      status: "active",
      createdAt,
      updatedAt: createdAt,
      title: input.title?.trim() || "Agent probe",
      model: input.model,
      workspaceRoot: input.workspaceRoot,
      fallbackAvailable: false,
      lastFallbackRecovered: false,
      turnCount: 0,
      turns: [],
      events: [],
    };
    this.state.sessions = [session, ...this.state.sessions].slice(0, 100);
    this.appendEvent(session, {
      event: "agent_probe.started",
      data: {
        sessionId: session.id,
        title: session.title,
        workspaceRoot: session.workspaceRoot || null,
      },
      scope: "debug",
      source: "host",
      severity: "info",
    });
    await this.persist();
    return session;
  }

  async getSession(sessionId: string): Promise<BinaryAgentProbeSession | null> {
    return this.state.sessions.find((item) => item.id === sessionId) || null;
  }

  async getSessionEvents(sessionId: string, after = 0): Promise<{ session: BinaryAgentProbeSession | null; events: BinaryAgentProbeEvent[]; done: boolean }> {
    const session = await this.getSession(sessionId);
    if (!session) return { session: null, events: [], done: true };
    return {
      session,
      events: session.events.filter((event) => event.seq > after),
      done: session.status !== "active" || !session.turns.some((turn) => turn.status === "running"),
    };
  }

  async controlSession(sessionId: string, action: "pause" | "resume" | "close"): Promise<BinaryAgentProbeSession | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    session.status = action === "resume" ? "active" : action === "pause" ? "paused" : "failed";
    session.updatedAt = nowIso();
    this.appendEvent(session, {
      event: `agent_probe.${action === "close" ? "closed" : action}`,
      data: {
        sessionId: session.id,
        status: session.status,
      },
      scope: "debug",
      source: "host",
      severity: "info",
    });
    await this.persist();
    return session;
  }

  async submitMessage(
    sessionId: string,
    input: { message: string },
    executor: (input: {
      message: string;
      model?: string;
      gatewayRunId?: string;
      conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
      workspaceRoot?: string;
    }) => Promise<ProbeExecutionResult>
  ): Promise<BinaryAgentProbeSession | null> {
    const session = await this.getSession(sessionId);
    if (!session || session.status !== "active") return session;

    const turn: BinaryAgentProbeTurn = {
      id: randomUUID(),
      userMessage: input.message,
      status: "running",
      createdAt: nowIso(),
    };
    session.turns.push(turn);
    session.turnCount = session.turns.length;
    session.updatedAt = nowIso();
    this.appendEvent(session, {
      event: "agent_probe.turn_started",
      data: {
        sessionId: session.id,
        turnId: turn.id,
        message: input.message,
      },
      scope: "debug",
      source: "host",
      severity: "info",
    });
    await this.persist();

    try {
      const history = session.turns
        .filter((item) => item.id !== turn.id && item.assistantMessage)
        .flatMap((item) => [
          { role: "user" as const, content: item.userMessage },
          { role: "assistant" as const, content: item.assistantMessage as string },
        ])
        .slice(-10);
      const result = await executor({
        message: input.message,
        model: session.model,
        gatewayRunId: session.gatewayRunId,
        conversationHistory: history,
        workspaceRoot: session.workspaceRoot,
      });
      turn.status = "completed";
      turn.completedAt = nowIso();
      turn.assistantMessage = result.final;
      turn.runId = result.runId;
      turn.modelCandidate = result.modelCandidate || null;
      turn.fallbackAttempt = result.fallbackAttempt || 0;
      turn.failureReason = normalizeFailureReason(result.failureReason);
      turn.persistenceDir = result.persistenceDir || null;
      turn.conversationId = result.conversationId || null;
      session.gatewayRunId = result.runId;
      session.conversationId = result.conversationId || session.conversationId || null;
      session.persistenceDir = result.persistenceDir || session.persistenceDir || null;
      session.currentModelCandidate = result.modelCandidate || session.currentModelCandidate || null;
      session.lastFailureReason = normalizeFailureReason(result.failureReason);
      session.fallbackAvailable = Array.isArray(result.fallbackTrail) ? result.fallbackTrail.length > 1 : Boolean(result.fallbackAttempt);
      session.lastFallbackRecovered = Number(result.fallbackAttempt || 0) > 0;
      session.updatedAt = nowIso();
      if (Number(result.fallbackAttempt || 0) > 0) {
        this.appendEvent(session, {
          event: "agent_probe.fallback_attempted",
          data: {
            sessionId: session.id,
            turnId: turn.id,
            fallbackAttempt: result.fallbackAttempt || 0,
            failureReason: normalizeFailureReason(result.failureReason),
            modelCandidate: result.modelCandidate || null,
            fallbackTrail: result.fallbackTrail || [],
          },
          scope: "debug",
          source: "host",
          severity: "warn",
        });
      }
      this.appendEvent(session, {
        event: "agent_probe.turn_completed",
        data: {
          sessionId: session.id,
          turnId: turn.id,
          message: input.message,
          final: result.final,
          modelCandidate: result.modelCandidate || null,
          fallbackAttempt: result.fallbackAttempt || 0,
          failureReason: normalizeFailureReason(result.failureReason),
          persistenceDir: result.persistenceDir || null,
          conversationId: result.conversationId || null,
        },
        scope: "debug",
        source: "host",
        severity: "info",
      });
      await this.persist();
      return session;
    } catch (error) {
      turn.status = "failed";
      turn.completedAt = nowIso();
      turn.error = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      session.updatedAt = nowIso();
      this.appendEvent(session, {
        event: "agent_probe.failed",
        data: {
          sessionId: session.id,
          turnId: turn.id,
          error: turn.error,
        },
        scope: "debug",
        source: "host",
        severity: "error",
      });
      await this.persist();
      return session;
    }
  }

  private appendEvent(session: BinaryAgentProbeSession, event: Record<string, unknown>): void {
    const seq = (session.events[session.events.length - 1]?.seq || 0) + 1;
    session.events.push({
      id: `agent_probe_${session.id}_${seq}`,
      seq,
      capturedAt: nowIso(),
      event: {
        ...event,
        id: `agent_probe_${session.id}_${seq}`,
        seq,
        capturedAt: nowIso(),
        sessionId: session.id,
      },
    });
    session.events = session.events.slice(-500);
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}

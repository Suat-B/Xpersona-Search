import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
function nowIso() {
    return new Date().toISOString();
}
function normalizeFailureReason(value) {
    return value === "provider_credits_exhausted" ||
        value === "router_blocked" ||
        value === "tool_schema_incompatible" ||
        value === "transient_api_failure" ||
        value === "unknown_provider_failure"
        ? value
        : null;
}
export class AgentProbeManager {
    storagePath;
    state = { sessions: [] };
    constructor(storagePath) {
        this.storagePath = storagePath;
    }
    async initialize() {
        try {
            const raw = await fs.readFile(this.storagePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.sessions)) {
                this.state = parsed;
            }
        }
        catch {
            this.state = { sessions: [] };
        }
    }
    async createSession(input) {
        const createdAt = nowIso();
        const session = {
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
    async getSession(sessionId) {
        return this.state.sessions.find((item) => item.id === sessionId) || null;
    }
    async getSessionEvents(sessionId, after = 0) {
        const session = await this.getSession(sessionId);
        if (!session)
            return { session: null, events: [], done: true };
        return {
            session,
            events: session.events.filter((event) => event.seq > after),
            done: session.status !== "active" || !session.turns.some((turn) => turn.status === "running"),
        };
    }
    async controlSession(sessionId, action) {
        const session = await this.getSession(sessionId);
        if (!session)
            return null;
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
    async submitMessage(sessionId, input, executor) {
        const session = await this.getSession(sessionId);
        if (!session || session.status !== "active")
            return session;
        const turn = {
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
                { role: "user", content: item.userMessage },
                { role: "assistant", content: item.assistantMessage },
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
        }
        catch (error) {
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
    appendEvent(session, event) {
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
    async persist() {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(this.state, null, 2), "utf8");
    }
}

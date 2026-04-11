import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
function nowIso() {
    return new Date().toISOString();
}
export class AgentJobManager {
    storagePath;
    state = { jobs: [] };
    constructor(storagePath) {
        this.storagePath = storagePath;
    }
    async initialize() {
        try {
            const raw = await fs.readFile(this.storagePath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.jobs)) {
                this.state = parsed;
            }
        }
        catch {
            this.state = { jobs: [] };
        }
    }
    async listJobs(limit = 20) {
        return this.state.jobs.slice(0, Math.max(1, limit));
    }
    async createJob(input) {
        const createdAt = nowIso();
        const job = {
            id: randomUUID(),
            status: "queued",
            createdAt,
            updatedAt: createdAt,
            task: input.task,
            model: input.model,
            workspaceRoot: input.workspaceRoot,
            runId: input.runId,
            traceId: input.traceId,
            requestedExecutionLane: input.requestedExecutionLane,
            executionLane: input.executionLane,
            pluginPacks: input.pluginPacks,
            skillSources: input.skillSources,
            controlHistory: [],
            events: [],
        };
        this.appendEvent(job, {
            event: "agent_job.created",
            data: {
                jobId: job.id,
                runId: job.runId || null,
                executionLane: job.executionLane,
                requestedExecutionLane: job.requestedExecutionLane,
            },
            scope: "job",
            source: "host",
            severity: "info",
        });
        this.state.jobs = [job, ...this.state.jobs].slice(0, 200);
        await this.persist();
        return job;
    }
    async getJob(jobId) {
        return this.state.jobs.find((job) => job.id === jobId) || null;
    }
    async getJobByRunId(runId) {
        return this.state.jobs.find((job) => job.runId === runId) || null;
    }
    async getJobEvents(jobId, after = 0) {
        const job = await this.getJob(jobId);
        if (!job)
            return { job: null, events: [], done: true };
        return {
            job,
            events: job.events.filter((event) => event.seq > after),
            done: ["completed", "failed", "cancelled", "takeover_required"].includes(job.status),
        };
    }
    async recordControl(jobId, action, note) {
        const job = await this.getJob(jobId);
        if (!job)
            return null;
        job.controlHistory.push({ action, at: nowIso(), ...(note ? { note } : {}) });
        if (action === "pause")
            job.status = "paused";
        if (action === "resume" && job.status === "paused")
            job.status = "running";
        if (action === "cancel")
            job.status = "cancelled";
        job.updatedAt = nowIso();
        this.appendEvent(job, {
            event: `agent_job.${action}`,
            data: {
                jobId: job.id,
                runId: job.runId || null,
                ...(note ? { note } : {}),
            },
            scope: "job",
            source: "host",
            severity: action === "cancel" ? "warn" : "info",
        });
        await this.persist();
        return job;
    }
    async syncFromRun(run) {
        const job = await this.getJobByRunId(run.id);
        if (!job)
            return;
        const finalEnvelope = run.finalEnvelope && typeof run.finalEnvelope === "object" ? run.finalEnvelope : {};
        const nextStatus = run.status;
        const priorStatus = job.status;
        job.status = nextStatus;
        job.updatedAt = run.updatedAt || nowIso();
        job.traceId = run.traceId || job.traceId;
        job.sessionId = run.sessionId || job.sessionId;
        job.error = run.error || job.error;
        if (typeof finalEnvelope.conversationId === "string") {
            job.conversationId = finalEnvelope.conversationId;
        }
        if (typeof finalEnvelope.persistenceDir === "string") {
            job.persistenceDir = finalEnvelope.persistenceDir;
        }
        if (typeof finalEnvelope.jsonlPath === "string") {
            job.jsonlPath = finalEnvelope.jsonlPath;
        }
        else if (run.lastExecutionState && typeof run.lastExecutionState.jsonlPath === "string") {
            job.jsonlPath = String(run.lastExecutionState.jsonlPath);
        }
        if (typeof finalEnvelope.executionLane === "string") {
            job.executionLane = finalEnvelope.executionLane;
        }
        if (typeof finalEnvelope.runtimeTarget === "string") {
            if (finalEnvelope.runtimeTarget === "local_native" || finalEnvelope.runtimeTarget === "sandbox" || finalEnvelope.runtimeTarget === "remote") {
                job.runtimeTarget = finalEnvelope.runtimeTarget;
            }
        }
        else if (run.lastExecutionState && typeof run.lastExecutionState.runtimeTarget === "string") {
            const runtimeTarget = String(run.lastExecutionState.runtimeTarget);
            if (runtimeTarget === "local_native" || runtimeTarget === "sandbox" || runtimeTarget === "remote") {
                job.runtimeTarget = runtimeTarget;
            }
        }
        if (priorStatus !== nextStatus) {
            this.appendEvent(job, {
                event: `agent_job.${nextStatus}`,
                data: {
                    jobId: job.id,
                    runId: job.runId || null,
                    executionLane: job.executionLane,
                    ...(job.error ? { error: job.error } : {}),
                },
                scope: "job",
                source: "host",
                severity: nextStatus === "failed" ? "error" : nextStatus === "takeover_required" ? "warn" : "info",
            });
        }
        await this.persist();
    }
    appendEvent(job, event) {
        const seq = (job.events[job.events.length - 1]?.seq || 0) + 1;
        const capturedAt = nowIso();
        const id = `agent_job_${job.id}_${seq}`;
        job.events.push({
            id,
            seq,
            capturedAt,
            event: {
                ...event,
                id,
                seq,
                capturedAt,
                jobId: job.id,
            },
        });
        job.events = job.events.slice(-600);
    }
    async persist() {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(this.state, null, 2), "utf8");
    }
}

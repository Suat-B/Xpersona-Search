import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { describe, expect, it } from "vitest";

import { AgentJobManager } from "./agent-job-manager.js";

describe("agent-job-manager", () => {
  it("creates jobs and syncs run state metadata", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "binary-agent-job-test-"));
    const manager = new AgentJobManager(path.join(tempRoot, "jobs.json"));
    await manager.initialize();

    const job = await manager.createJob({
      task: "Repair failing tests",
      model: "Binary IDE",
      workspaceRoot: tempRoot,
      requestedExecutionLane: "openhands_headless",
      executionLane: "openhands_headless",
      pluginPacks: [],
      skillSources: [],
      runId: "run-1",
      traceId: "trace-1",
    });

    expect(job.status).toBe("queued");

    await manager.syncFromRun({
      id: "run-1",
      status: "running",
      updatedAt: "2026-04-02T00:00:00.000Z",
      traceId: "trace-1",
      sessionId: "session-1",
      finalEnvelope: {
        executionLane: "openhands_headless",
        conversationId: "conversation-1",
        persistenceDir: "C:/tmp/run-1",
      },
    });

    const updated = await manager.getJob(job.id);
    expect(updated?.status).toBe("running");
    expect(updated?.conversationId).toBe("conversation-1");
    expect(updated?.persistenceDir).toBe("C:/tmp/run-1");
  });

  it("records control actions and terminal state", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "binary-agent-job-test-"));
    const manager = new AgentJobManager(path.join(tempRoot, "jobs.json"));
    await manager.initialize();

    const job = await manager.createJob({
      task: "Background sweep",
      model: "Binary IDE",
      requestedExecutionLane: "openhands_headless",
      executionLane: "openhands_headless",
      pluginPacks: [],
      skillSources: [],
    });

    const paused = await manager.recordControl(job.id, "pause", "Operator paused the job.");
    expect(paused?.status).toBe("paused");

    const response = await manager.getJobEvents(job.id);
    expect(response.job).toBeTruthy();
    expect(response.events.length).toBeGreaterThan(0);
  });
});

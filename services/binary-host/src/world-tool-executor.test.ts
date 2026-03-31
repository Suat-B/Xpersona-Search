import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MachineWorldModelService } from "./machine-world-model.js";
import { WorldToolExecutor } from "./world-tool-executor.js";

const tempRoots: string[] = [];

async function createExecutor() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "binary-world-tool-"));
  tempRoots.push(root);
  const service = new MachineWorldModelService(path.join(root, "world-model.json"));
  await service.initialize();
  const executor = new WorldToolExecutor(service);
  return { service, executor };
}

function buildPendingToolCall(name: string, args: Record<string, unknown> = {}) {
  return {
    step: 1,
    adapter: "test",
    requiresClientExecution: true,
    createdAt: new Date("2026-03-31T00:00:00.000Z").toISOString(),
    toolCall: {
      id: `${name}_1`,
      name,
      arguments: args,
    },
  };
}

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("WorldToolExecutor", () => {
  it("returns summary and active context from the world model", async () => {
    const { service, executor } = await createExecutor();
    await service.ingestSnapshot({
      task: "Inspect the workspace",
      workspaceRoot: "c:\\repo",
      desktopContext: { platform: "win32-test" },
    });

    const summary = await executor.execute(buildPendingToolCall("world_get_summary"));
    const activeContext = await executor.execute(buildPendingToolCall("world_get_active_context"));

    expect(summary.ok).toBe(true);
    expect(summary.data?.nodeCount).toBeGreaterThan(0);
    expect(activeContext.ok).toBe(true);
    expect(String(activeContext.data?.sliceId || "")).toContain("world-slice-");
  });

  it("records memory and scores routes against affordances", async () => {
    const { executor } = await createExecutor();

    const committed = await executor.execute(
      buildPendingToolCall("world_commit_memory", {
        label: "Preferred repo validation",
        summary: "Prefer npm test inside the repo root.",
        scope: "workspace",
        tags: ["node", "validation"],
      })
    );
    const scored = await executor.execute(
      buildPendingToolCall("world_score_route", {
        routes: [
          { id: "terminal", kind: "terminal", confidence: 0.8, requiresVisibleInteraction: false },
          { id: "visible", kind: "visible_desktop", confidence: 0.9, requiresVisibleInteraction: true },
        ],
      })
    );

    expect(committed.ok).toBe(true);
    expect(committed.data?.scope).toBe("workspace");
    expect(scored.ok).toBe(true);
    const routes = Array.isArray((scored.data || {}).routes) ? ((scored.data || {}).routes as Array<{ id?: string }>) : [];
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]?.id).toBe("terminal");
  });
});

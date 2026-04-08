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

  it("exposes beliefs, goals, episodes, predictions, and explanations through world tools", async () => {
    const { service, executor } = await createExecutor();
    await service.ingestSnapshot({
      runId: "run_predict",
      task: "Inspect inbox workflow",
      workspaceRoot: "c:\\repo",
      desktopContext: {
        platform: "win32-test",
        activeWindow: { id: "win_1", title: "Binary IDE", app: "electron" },
      },
      browserContext: {
        mode: "attached",
        browserName: "Chrome",
        activePage: {
          id: "page_1",
          title: "Inbox",
          url: "https://mail.google.com/mail/u/0/#inbox",
          origin: "https://mail.google.com",
        },
      },
    });
    await service.recordToolReceipt({
      runId: "run_predict",
      task: "Inspect inbox workflow",
      pendingToolCall: {
        step: 2,
        toolCall: {
          id: "tc_browser",
          name: "browser_snapshot_dom",
          arguments: { pageId: "page_1" },
        },
      },
      toolResult: {
        name: "browser_snapshot_dom",
        ok: true,
        summary: "Captured Inbox DOM.",
        data: {
          pageId: "page_1",
          url: "https://mail.google.com/mail/u/0/#inbox",
          title: "Inbox",
          proof: { title: "Inbox proof" },
        },
      },
    });

    const goals = await executor.execute(buildPendingToolCall("world_get_goals"));
    const beliefs = await executor.execute(buildPendingToolCall("world_get_beliefs", { kind: "active_page" }));
    const episodes = await executor.execute(buildPendingToolCall("world_query_episodes", { kind: "browser_workflow" }));
    const predictions = await executor.execute(
      buildPendingToolCall("world_predict_outcomes", {
        candidates: [
          { id: "browser", kind: "browser_native", confidence: 0.8 },
          { id: "visible", kind: "visible_desktop", confidence: 0.8, requiresVisibleInteraction: true },
        ],
      })
    );
    const attention = await executor.execute(buildPendingToolCall("world_get_attention_queue"));
    const explanation = await executor.execute(buildPendingToolCall("world_explain_route", { kind: "browser_native" }));

    expect(goals.ok).toBe(true);
    expect(Array.isArray(goals.data?.goals)).toBe(true);
    expect((goals.data?.goals as Array<{ title?: string }>)[0]?.title).toContain("Inspect inbox workflow");
    expect(beliefs.ok).toBe(true);
    expect(Array.isArray(beliefs.data?.beliefs)).toBe(true);
    expect(episodes.ok).toBe(true);
    expect(Array.isArray(episodes.data?.episodes)).toBe(true);
    expect(predictions.ok).toBe(true);
    const predictedRoutes = Array.isArray(predictions.data?.predictions)
      ? (predictions.data?.predictions as Array<{ kind?: string; preferred?: boolean }>)
      : [];
    expect(predictedRoutes[0]?.kind).toBe("browser_native");
    expect(predictedRoutes[0]?.preferred).toBe(true);
    expect(attention.ok).toBe(true);
    expect(Array.isArray(attention.data?.items)).toBe(true);
    expect(explanation.ok).toBe(true);
    expect(Array.isArray(explanation.data?.supportingBeliefs)).toBe(true);
  });

  it("exposes learned route stats and explicit route outcomes through world tools", async () => {
    const { service, executor } = await createExecutor();
    await service.ingestSnapshot({
      runId: "run_route_stats",
      task: "Inspect the repo and choose the safest route",
      workspaceRoot: "c:\\repo",
      desktopContext: { platform: "win32-test" },
    });
    const decision = await service.recordRouteDecision({
      runId: "run_route_stats",
      task: "Inspect the repo and choose the safest route",
      kind: "terminal",
      taskSpeedClass: "tool_heavy",
      contextTier: "standard",
      heuristicScore: 0.72,
      finalScore: 0.78,
      confidence: 0.8,
    });

    const recorded = await executor.execute(
      buildPendingToolCall("world_record_route_outcome", {
        decisionId: decision.id,
        runId: "run_route_stats",
        routeKind: "terminal",
        outcome: "success",
        advancedGoal: true,
        summary: "Terminal route succeeded.",
      })
    );
    const stats = await executor.execute(buildPendingToolCall("world_get_route_stats", { kind: "terminal" }));

    expect(recorded.ok).toBe(true);
    expect(recorded.data?.routeKind).toBe("terminal");
    expect(stats.ok).toBe(true);
    expect(Array.isArray(stats.data?.stats)).toBe(true);
    expect((stats.data?.stats as Array<{ routeKind?: string; successRate?: number }>)[0]?.routeKind).toBe("terminal");
    expect(((stats.data?.stats as Array<{ successRate?: number }>)[0]?.successRate || 0)).toBeGreaterThan(0.5);
  });
});

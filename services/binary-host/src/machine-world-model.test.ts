import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { MachineWorldModelService } from "./machine-world-model.js";

const tempRoots: string[] = [];

async function createService(): Promise<{ service: MachineWorldModelService; filePath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "binary-world-model-"));
  tempRoots.push(root);
  const filePath = path.join(root, "world-model.json");
  const service = new MachineWorldModelService(filePath);
  await service.initialize();
  return { service, filePath };
}

afterEach(async () => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("MachineWorldModelService", () => {
  it("ingests desktop and browser snapshots into a persistent local graph", async () => {
    const { service } = await createService();

    await service.ingestSnapshot({
      runId: "run_1",
      task: "Open Gmail and inspect the compose flow",
      machineRootPath: "c:\\users\\tester",
      focusedWorkspaceRoot: "c:\\repo",
      focusedRepoRoot: "c:\\repo",
      workspaceRoot: "c:\\repo",
      desktopContext: {
        platform: "win32-test",
        activeWindow: {
          id: "101",
          title: "Binary IDE",
          app: "electron",
        },
        discoveredApps: [{ id: "steam", name: "Steam", aliases: ["steam"], source: "windows_shortcut" }],
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
      focusLease: {
        surface: "desktop",
        source: "typing",
      },
    });

    const summary = await service.getSummary();

    expect(summary.nodeCount).toBeGreaterThan(0);
    expect(summary.edgeCount).toBeGreaterThan(0);
    expect(summary.activeContext.machineRoot).toBeTruthy();
    expect(summary.activeContext.homeRootPath).toContain("tester");
    expect(summary.activeContext.focusedWorkspace).toContain("repo");
    expect(summary.activeContext.focusedRepo).toContain("repo");
    expect(summary.activeContext.activeWorkspace).toContain("repo");
    expect(summary.activeContext.activePage).toContain("Inbox");
    expect(Array.isArray(summary.knownDrives)).toBe(true);
    expect(summary.affordanceSummary.blocked).toContain("visible_foreground_activation");
    expect(summary.routeRecommendations[0]?.kind).toBe("browser_native");
    expect(summary.routeRecommendations.some((route) => route.kind === "visible_desktop")).toBe(true);
  });

  it("distills terminal and browser routines from successful tool receipts", async () => {
    const { service } = await createService();

    await service.recordToolReceipt({
      runId: "run_2",
      task: "Fix auth hook and verify it",
      workspaceRoot: "c:\\repo",
      pendingToolCall: {
        step: 2,
        toolCall: {
          id: "tc_1",
          name: "run_command",
          arguments: {
            command: "npm test",
          },
        },
      },
      toolResult: {
        name: "run_command",
        ok: true,
        summary: "npm test passed",
        data: {
          terminalState: {
            cwd: "c:\\repo",
            projectRoot: "c:\\repo",
            stack: "node_js_ts",
            lastCommand: "npm test",
            lastCommandOutcome: "succeeded",
          },
          proof: {
            title: "Validation passed",
          },
        },
      },
    });

    await service.recordToolReceipt({
      runId: "run_2",
      task: "Inspect dashboard export page",
      pendingToolCall: {
        step: 3,
        toolCall: {
          id: "tc_2",
          name: "browser_snapshot_dom",
          arguments: {
            pageId: "page_2",
          },
        },
      },
      toolResult: {
        name: "browser_snapshot_dom",
        ok: true,
        summary: "Captured DOM snapshot for Dashboard.",
        data: {
          pageId: "page_2",
          url: "https://app.example.com/dashboard",
          title: "Dashboard",
          proof: {
            title: "Dashboard",
          },
        },
      },
    });

    const routines = await service.findRoutine("", 10);
    const changes = await service.getRecentChanges(10);

    expect(routines.length).toBeGreaterThanOrEqual(2);
    expect(routines.some((routine) => routine.label.includes("Terminal flow"))).toBe(true);
    expect(routines.some((routine) => routine.label.includes("Browser flow"))).toBe(true);
    expect(changes.some((change) => change.kind === "proof_recorded")).toBe(true);
  });

  it("rebuilds materialized views from the event log and tracks contradictions", async () => {
    const { service, filePath } = await createService();

    await service.ingestSnapshot({
      runId: "run_replay",
      task: "Inspect repo A",
      workspaceRoot: "c:\\repo-a",
      desktopContext: { platform: "win32-test" },
    });
    await service.ingestSnapshot({
      runId: "run_replay",
      task: "Inspect repo B",
      workspaceRoot: "c:\\repo-b",
      desktopContext: { platform: "win32-test" },
    });
    const before = await service.getSummary();
    await service.rebuildViewsFromEvents();
    const after = await service.getSummary();
    const beliefs = await service.getBeliefs({ kind: "active_workspace", limit: 5 });

    expect(after.nodeCount).toBe(before.nodeCount);
    expect(after.edgeCount).toBe(before.edgeCount);
    expect(after.goalCount).toBe(before.goalCount);
    expect(beliefs[0]?.status).toBe("contradicted");
    expect(beliefs[0]?.confidence || 1).toBeLessThan(0.88);

    const persisted = JSON.parse(await fs.readFile(filePath, "utf8")) as { worldEvents?: unknown[]; worldBeliefs?: unknown[] };
    expect(Array.isArray(persisted.worldEvents)).toBe(true);
    expect(Array.isArray(persisted.worldBeliefs)).toBe(true);
  });

  it("tracks goals, attention, predictions, and explanations without exposing raw logs in the summary", async () => {
    const { service } = await createService();

    const goal = await service.registerGoal({
      title: "Validate desktop workflow",
      summary: "Validate a browser-first workflow with fallback reasoning.",
      runId: "run_goal",
    });
    await service.recordToolReceipt({
      runId: "run_goal",
      task: "Validate desktop workflow",
      pendingToolCall: {
        step: 1,
        toolCall: {
          id: "tc_fail",
          name: "browser_snapshot_dom",
          arguments: { pageId: "page_fail" },
        },
      },
      toolResult: {
        name: "browser_snapshot_dom",
        ok: false,
        summary: "Browser page was unavailable.",
        error: "Page not found",
        data: {},
      },
    });

    const goals = await service.getGoals({ runId: "run_goal" });
    const attention = await service.getAttentionQueue({ limit: 10 });
    const predictions = await service.predictOutcomes({
      candidates: [
        { id: "browser", kind: "browser_native", confidence: 0.8 },
        { id: "terminal", kind: "terminal", confidence: 0.7 },
      ],
    });
    const explanation = await service.explainRoute({ candidateId: predictions[0]?.candidateId });
    const summary = await service.getSummary();

    expect(goal.id).toContain("goal_");
    expect(goals[0]?.status).toBe("blocked");
    expect(attention.some((item) => item.kind === "blocked_goal")).toBe(true);
    expect(predictions.length).toBeGreaterThan(0);
    expect(explanation.supportingBeliefs.length).toBeGreaterThan(0);
    expect(summary.distilledBeliefs.length).toBeGreaterThan(0);
    expect(summary.activeGoals.length).toBeGreaterThan(0);
    expect((summary as unknown as Record<string, unknown>).worldEvents).toBeUndefined();
  });

  it("learns route preferences from repeated outcomes under similar context", async () => {
    const { service } = await createService();
    await service.ingestSnapshot({
      runId: "run_route_learning",
      task: "Inspect the repo and keep it background-safe",
      workspaceRoot: "c:\\repo",
      desktopContext: { platform: "win32-test" },
    });
    const decision = await service.recordRouteDecision({
      runId: "run_route_learning",
      task: "Inspect the repo and keep it background-safe",
      kind: "terminal",
      taskSpeedClass: "tool_heavy",
      contextTier: "standard",
      heuristicScore: 0.68,
      finalScore: 0.74,
      confidence: 0.78,
    });
    for (let index = 0; index < 3; index += 1) {
      await service.recordRouteOutcome({
        decisionId: decision.id,
        runId: "run_route_learning",
        routeKind: "terminal",
        outcome: "success",
        advancedGoal: true,
      });
    }
    await service.recordRouteOutcome({
      runId: "run_route_learning",
      routeKind: "visible_desktop",
      outcome: "focus_conflict",
    });

    const predictions = await service.predictOutcomes({
      task: "Inspect the repo and keep it background-safe",
      taskSpeedClass: "tool_heavy",
      contextTier: "standard",
      candidates: [
        { id: "terminal", kind: "terminal", confidence: 0.7 },
        { id: "visible", kind: "visible_desktop", confidence: 0.7, requiresVisibleInteraction: true },
      ],
    });

    expect(predictions[0]?.kind).toBe("terminal");
    expect((predictions[0]?.adaptiveScore || 0)).toBeGreaterThan(0);
    expect((predictions[0]?.historicalSuccessRate || 0)).toBeGreaterThan(0.7);
    expect((predictions[1]?.adaptiveScore || 0)).toBeLessThanOrEqual(0);
  });

  it("uses belief provenance and minimal context slices for cheaper but meaningful routing", async () => {
    const { service } = await createService();
    await service.ingestSnapshot({
      runId: "run_provenance",
      task: "Inspect dashboard export page",
      workspaceRoot: "c:\\repo",
      desktopContext: { platform: "win32-test" },
      browserContext: {
        mode: "attached",
        browserName: "Chrome",
        activePage: {
          id: "page_proof",
          title: "Dashboard",
          url: "https://app.example.com/dashboard",
          origin: "https://app.example.com",
        },
      },
    });
    await service.recordToolReceipt({
      runId: "run_provenance",
      task: "Inspect dashboard export page",
      pendingToolCall: {
        step: 1,
        toolCall: {
          id: "tc_proof",
          name: "browser_snapshot_dom",
          arguments: { pageId: "page_proof" },
        },
      },
      toolResult: {
        name: "browser_snapshot_dom",
        ok: true,
        summary: "Captured the dashboard DOM.",
        data: {
          pageId: "page_proof",
          url: "https://app.example.com/dashboard",
          title: "Dashboard",
          proof: { title: "Dashboard proof" },
        },
      },
    });

    const internal = service as unknown as {
      file: { worldBeliefs: Array<{ kind: string; updatedAt: string; status: string; proofBacked?: boolean; decayHours?: number; confidence: number }> };
      expireBeliefsIfNeeded: () => Promise<void>;
    };
    internal.file.worldBeliefs.push({
      id: "belief_derived_test",
      subjectId: "local-user-session",
      kind: "derived_hint",
      value: { route: "visible_desktop" },
      confidence: 0.62,
      evidenceIds: ["manual"],
      provenance: "derived",
      proofBacked: false,
      decayHours: 1,
      status: "active",
      createdAt: "2026-03-30T00:00:00.000Z",
      updatedAt: "2026-03-30T00:00:00.000Z",
    } as never);
    for (const belief of internal.file.worldBeliefs) {
      if (belief.kind === "route_confidence:browser_workflow") {
        belief.updatedAt = "2026-03-30T00:00:00.000Z";
      }
    }
    await internal.expireBeliefsIfNeeded();

    const beliefs = await service.getBeliefs({ limit: 20 });
    const proofBacked = beliefs.find((belief) => belief.kind === "route_confidence:browser_workflow");
    const derived = beliefs.find((belief) => belief.kind === "derived_hint");
    const explanation = await service.explainRoute({ kind: "browser_native" });
    const minimal = await service.getContextSlice({
      tier: "minimal",
      task: "Inspect dashboard export page",
      taskSpeedClass: "simple_action",
    });

    expect(proofBacked?.proofBacked).toBe(true);
    expect(proofBacked?.status).not.toBe("expired");
    expect(derived?.status).not.toBe("active");
    expect(explanation.supportingBeliefs.some((belief) => belief.kind === "active_page")).toBe(true);
    expect((minimal.selectedContextTier as string) || "").toBe("minimal");
    expect(Array.isArray(minimal.routeRecommendations)).toBe(true);
  });
});

import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AutomationRuntime,
  automationToLegacyAgent,
  interpretAutomationSchedule,
  legacyAgentToAutomation,
  type BinaryAutomationDefinition,
  type BinaryWebhookSubscription,
} from "./automation-runtime.js";

type RuntimeConfig = {
  automations: BinaryAutomationDefinition[];
  webhookSubscriptions: BinaryWebhookSubscription[];
  trustedWorkspaceRoots: string[];
};

function createAutomation(
  input: Partial<BinaryAutomationDefinition> & Pick<BinaryAutomationDefinition, "id" | "name" | "prompt" | "trigger">
): BinaryAutomationDefinition {
  return {
    status: "active",
    policy: "autonomous",
    createdAt: "2026-03-31T10:00:00.000Z",
    updatedAt: "2026-03-31T10:00:00.000Z",
    deliveryHealth: "idle",
    ...input,
  };
}

function cloneConfig(config: RuntimeConfig): RuntimeConfig {
  return JSON.parse(JSON.stringify(config)) as RuntimeConfig;
}

async function createRuntimeHarness(initialConfig: RuntimeConfig, fetchImpl?: typeof fetch) {
  let config = cloneConfig(initialConfig);
  const queuedRuns: Array<{
    automationId: string;
    triggerKind: string;
    triggerSummary: string;
    eventId: string;
    workspaceRoot?: string;
  }> = [];
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "binary-automation-test-"));
  const runtime = new AutomationRuntime({
    storagePath: path.join(tempRoot, "automation-state.json"),
    readConfig: async () => cloneConfig(config),
    writeConfig: async (next) => {
      config = cloneConfig(next);
    },
    queueAutomationRun: async (input) => {
      queuedRuns.push({
        automationId: input.automation.id,
        triggerKind: input.triggerKind,
        triggerSummary: input.triggerSummary,
        eventId: input.eventId,
        workspaceRoot: input.workspaceRoot,
      });
      return {
        id: `run-${queuedRuns.length}`,
        status: "queued",
        createdAt: "2026-03-31T10:00:00.000Z",
        updatedAt: "2026-03-31T10:00:00.000Z",
      };
    },
    getDesktopSnapshot: async () => ({
      activeWindow: {
        app: "Chrome",
        title: "Inbox",
      },
    }),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  await runtime.initialize();
  return {
    runtime,
    tempRoot,
    queuedRuns,
    getConfig: () => cloneConfig(config),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("automation-runtime", () => {
  it("interprets natural-language schedules", () => {
    const next = interpretAutomationSchedule("every weekday at 9am", new Date("2026-03-31T13:30:00.000Z"));
    expect(next).toBeTruthy();
    expect(new Date(String(next)).toISOString()).toBe("2026-03-31T14:00:00.000Z");
  });

  it("fires schedule automations once and does not double-fire across immediate ticks", async () => {
    const { runtime, queuedRuns, getConfig } = await createRuntimeHarness({
      automations: [
        createAutomation({
          id: "sched-1",
          name: "Daily Sweep",
          prompt: "Review the workspace",
          trigger: {
            kind: "schedule_nl",
            scheduleText: "every hour",
          },
        }),
      ],
      webhookSubscriptions: [],
      trustedWorkspaceRoots: [],
    });

    await (runtime as any).runSchedulerTick();
    await (runtime as any).runSchedulerTick();

    expect(queuedRuns).toHaveLength(1);
    expect(queuedRuns[0]?.triggerKind).toBe("schedule_nl");
    expect(getConfig().automations[0]?.lastTriggerAt).toBeTruthy();

    await runtime.stop();
  });

  it("debounces file events and ignores default excluded paths", async () => {
    vi.useFakeTimers();
    const workspaceRoot = path.join(os.tmpdir(), "binary-file-event");
    const { runtime } = await createRuntimeHarness({
      automations: [
        createAutomation({
          id: "file-1",
          name: "Watch Src",
          prompt: "Inspect changes",
          workspaceRoot,
          trigger: {
            kind: "file_event",
            workspaceRoot,
          },
        }),
      ],
      webhookSubscriptions: [],
      trustedWorkspaceRoots: [workspaceRoot],
    });

    await (runtime as any).handleFileChange(workspaceRoot, "src/app.ts", "change");
    await (runtime as any).handleFileChange(workspaceRoot, "src/app.ts", "change");
    await (runtime as any).handleFileChange(workspaceRoot, "node_modules/pkg/index.js", "change");

    const fileDebounce = (runtime as any).fileDebounce as Map<string, unknown>;
    expect(fileDebounce.size).toBe(1);
    expect(Array.from(fileDebounce.keys())).toEqual(["file-1:src/app.ts"]);

    await runtime.stop();
  });

  it("deduplicates repeated process ticks until the active window changes", async () => {
    let snapshotIndex = 0;
    const snapshots = [
      { activeWindow: { app: "Chrome", title: "Inbox" } },
      { activeWindow: { app: "Chrome", title: "Inbox" } },
      { activeWindow: { app: "Cursor", title: "binary-host" } },
    ];
    const workspaceRoot = path.join(os.tmpdir(), "binary-process-event");
    const { runtime, queuedRuns } = await createRuntimeHarness(
      {
        automations: [
          createAutomation({
            id: "proc-1",
            name: "Chrome Watch",
            prompt: "Watch Chrome",
            workspaceRoot,
            trigger: {
              kind: "process_event",
              query: "chrome",
              workspaceRoot,
            },
          }),
        ],
        webhookSubscriptions: [],
        trustedWorkspaceRoots: [workspaceRoot],
      },
      undefined
    );

    (runtime as any).input.getDesktopSnapshot = async () => snapshots[snapshotIndex++] || snapshots.at(-1);

    await (runtime as any).runProcessTick();
    await (runtime as any).runProcessTick();
    await (runtime as any).runProcessTick();

    expect(queuedRuns).toHaveLength(1);
    expect(queuedRuns[0]?.automationId).toBe("proc-1");

    await runtime.stop();
  });

  it("matches notification automations only when topic/query constraints match", async () => {
    const { runtime } = await createRuntimeHarness({
      automations: [
        createAutomation({
          id: "notify-1",
          name: "Sentry Watch",
          prompt: "React to Sentry",
          trigger: {
            kind: "notification",
            topic: "sentry",
            query: "urgent",
          },
        }),
        createAutomation({
          id: "notify-2",
          name: "Slack Watch",
          prompt: "React to Slack",
          trigger: {
            kind: "notification",
            topic: "slack",
          },
        }),
      ],
      webhookSubscriptions: [],
      trustedWorkspaceRoots: [],
    });

    const result = await runtime.ingestNotification({
      topic: "sentry",
      summary: "urgent regression on desktop automation",
    });

    expect(result.triggeredAutomationIds).toEqual(["notify-1"]);

    await runtime.stop();
  });

  it("delivers signed webhooks and records healthy delivery state", async () => {
    const requests: Array<{ headers: HeadersInit | undefined; body: string }> = [];
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      requests.push({
        headers: init?.headers,
        body: String(init?.body || ""),
      });
      return new Response("ok", { status: 200 });
    };
    const automation = createAutomation({
      id: "webhook-1",
      name: "Webhook Test",
      prompt: "Ship proof",
      trigger: {
        kind: "manual",
      },
    });
    const subscription: BinaryWebhookSubscription = {
      id: "sub-1",
      url: "https://example.com/binary",
      status: "active",
      secret: "secret-key",
      automationId: automation.id,
      events: ["automation.run_completed"],
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
      failureCount: 0,
    };
    const { runtime, getConfig } = await createRuntimeHarness(
      {
        automations: [automation],
        webhookSubscriptions: [subscription],
        trustedWorkspaceRoots: [],
      },
      fetchImpl as typeof fetch
    );

    await runtime.recordRunCompleted({
      automationId: automation.id,
      runId: "run-1",
      summary: "completed",
    });
    await (runtime as any).flushDeliveries();

    expect(requests).toHaveLength(1);
    const sentBody = requests[0]?.body || "";
    const headers = new Headers(requests[0]?.headers);
    expect(headers.get("X-Binary-Event")).toBe("automation.run_completed");
    expect(headers.get("X-Binary-Signature")).toBe(
      createHmac("sha256", "secret-key").update(sentBody).digest("hex")
    );
    expect(getConfig().webhookSubscriptions[0]?.lastSuccessAt).toBeTruthy();
    expect(getConfig().automations[0]?.deliveryHealth).toBe("healthy");

    await runtime.stop();
  });

  it("records failing webhook state and schedules retries", async () => {
    const fetchImpl = async () => new Response("bad", { status: 500 });
    const automation = createAutomation({
      id: "webhook-fail-1",
      name: "Webhook Failure Test",
      prompt: "Ship proof",
      trigger: {
        kind: "manual",
      },
    });
    const subscription: BinaryWebhookSubscription = {
      id: "sub-fail-1",
      url: "https://example.com/fail",
      status: "active",
      secret: "secret-key",
      automationId: automation.id,
      events: ["automation.run_completed"],
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
      failureCount: 0,
    };
    const { runtime, getConfig } = await createRuntimeHarness(
      {
        automations: [automation],
        webhookSubscriptions: [subscription],
        trustedWorkspaceRoots: [],
      },
      fetchImpl as typeof fetch
    );

    await runtime.recordRunCompleted({
      automationId: automation.id,
      runId: "run-2",
      summary: "completed",
    });
    await (runtime as any).flushDeliveries();

    expect(getConfig().webhookSubscriptions[0]?.failureCount).toBe(1);
    expect(getConfig().automations[0]?.deliveryHealth).toBe("failing");
    expect(getConfig().automations[0]?.lastDeliveryError).toContain("Webhook failed with status 500");

    await runtime.stop();
  });

  it("maps legacy background agents into automations and back", () => {
    const automation = legacyAgentToAutomation({
      id: "legacy-1",
      name: "Legacy Sweep",
      prompt: "Do the thing",
      status: "active",
      trigger: "scheduled",
      scheduleMinutes: 30,
      workspaceRoot: "C:/repo",
      model: "Binary IDE",
      createdAt: "2026-03-31T10:00:00.000Z",
      updatedAt: "2026-03-31T10:00:00.000Z",
    });

    expect(automation.trigger.kind).toBe("schedule_nl");
    expect((automation.trigger as Extract<BinaryAutomationDefinition["trigger"], { kind: "schedule_nl" }>).scheduleText).toBe(
      "every 30 minutes"
    );

    expect(automationToLegacyAgent(automation)).toMatchObject({
      id: "legacy-1",
      trigger: "scheduled",
      scheduleMinutes: 30,
      workspaceRoot: path.resolve("C:/repo"),
    });
  });
});
